/**
 * Import an HR contacts sheet (saved from Excel as CSV) into company_contacts and companies.
 *   npx tsx --env-file=.env.local scripts/import-hr-contacts.ts <file.csv> [--dry-run]
 * Expected headers: Name, Email, Designation, Company, Company Source, Category, Email Type, City, Source Confidence.
 * Phone and Notes columns are ignored on purpose: students only ever see one HR email per job.
 *
 * Kept: company HR teams and hr@/careers@ mailboxes on company domains whose domain accepts mail (MX record).
 * Dropped: personal mailboxes, free-mail domains, agencies, college cells, anyone opted out or flagged do-not-contact.
 * Existing contacts are never overwritten, so opt-outs and verified addresses stay as they are.
 * The sheet itself must never be committed (.gitignore blocks .xlsx and .csv).
 */
import { readFileSync } from "node:fs";
import { resolveMx } from "node:dns/promises";
import { withCronRun, type CronCounts } from "@/lib/admin/cron-run";
import { classifySheetRow, nameFromDomain, normName, parseCsv, rootDomain, type SheetContact } from "@/lib/companies";
import { syncJobCompanies, uniqueSlug, type CompanyRow } from "@/lib/company-sync";
import { adminClient } from "@/lib/supabase/admin";
import { allRows } from "@/lib/supabase/all-rows";

const db = adminClient();
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);
const file = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

const HEADERS: Record<string, keyof Parameters<typeof classifySheetRow>[0]> = {
  name: "name",
  email: "email",
  designation: "designation",
  company: "company",
  "company source": "companySource",
  category: "category",
  "email type": "emailType",
  city: "city",
  "source confidence": "confidence",
};

/** MX lookup over HTTPS (Google Public DNS), for machines whose local DNS resolver Node can't reach. */
async function mxOverHttps(domain: string): Promise<boolean> {
  const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`, { signal: AbortSignal.timeout(8000) });
  const data = (await res.json()) as { Status?: number; Answer?: { type: number }[] };
  return data.Status === 0 && (data.Answer ?? []).some((a) => a.type === 15);
}

async function hasMx(domain: string): Promise<boolean> {
  try {
    return (await resolveMx(domain)).length > 0;
  } catch (e) {
    // The domain answered "no such domain / no MX": that's a real no
    if (["ENOTFOUND", "ENODATA", "NXDOMAIN"].includes((e as NodeJS.ErrnoException).code ?? "")) return false;
    // The resolver itself failed (refused, timed out): ask over HTTPS instead
    return mxOverHttps(domain).catch(() => false);
  }
}

/** Domains that can receive mail. Checked once per domain, 20 at a time; addresses elsewhere would bounce. */
async function mailDomains(domains: string[]) {
  const ok = new Set<string>();
  for (let i = 0; i < domains.length; i += 20) {
    await Promise.all(domains.slice(i, i + 20).map(async (d) => (await hasMx(d)) && ok.add(d)));
  }
  return ok;
}

const mostCommon = (xs: (string | null)[]) => {
  const m = new Map<string, number>();
  for (const x of xs) if (x) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

async function main(): Promise<CronCounts> {
  if (!file) throw new Error("usage: scripts/import-hr-contacts.ts <file.csv> [--dry-run]");
  const [head, ...body] = parseCsv(readFileSync(file, "utf8"));
  const cols = head.map((h) => HEADERS[h.trim().toLowerCase()]);
  if (!cols.includes("email")) throw new Error("the CSV needs an Email column");

  const skipped = new Map<string, number>();
  const skip = (r: string) => skipped.set(r, (skipped.get(r) ?? 0) + 1);
  const byEmail = new Map<string, SheetContact>();
  for (const r of body) {
    const row: Record<string, string> = {};
    cols.forEach((c, i) => c && (row[c] = r[i] ?? ""));
    const res = classifySheetRow(row);
    if (!res.ok) { skip(res.reason); continue; }
    const prev = byEmail.get(res.contact.email);
    // One row per address; a recent source wins over an older one
    if (!prev || (prev.quality === "older" && res.contact.quality === "recent")) byEmail.set(res.contact.email, res.contact);
    else skip("duplicate");
  }
  log(`read ${body.length} rows: ${byEmail.size} usable, skipped`, Object.fromEntries(skipped));

  const live = await mailDomains([...new Set([...byEmail.values()].map((c) => c.domain))]);
  const dncRows = await allRows<{ email: string }>((a, b) => db.from("company_contacts").select("email").eq("do_not_contact", true).order("id").range(a, b));
  const dnc = new Set(dncRows.map((r) => r.email.toLowerCase()));
  const contacts: SheetContact[] = [];
  for (const c of byEmail.values()) {
    if (!live.has(c.domain)) skip("domain_takes_no_mail");
    else if (dnc.has(c.email)) skip("opted_out");
    else contacts.push(c);
  }
  log(`${contacts.length} contacts on ${live.size} mail-ready domains`);

  // Companies, one per root domain: the name the sheet gave most often, else one built from the domain
  const groups = new Map<string, SheetContact[]>();
  for (const c of contacts) groups.set(rootDomain(c.domain), [...(groups.get(rootDomain(c.domain)) ?? []), c]);
  const existingRows = await allRows<CompanyRow>((a, b) => db.from("companies").select("domain, slug, name, email_domains, aliases, source").order("id").range(a, b));
  const existing = new Map(existingRows.map((r) => [r.domain, r]));
  const taken = new Map([...existing.values()].map((c) => [c.slug, c.domain]));
  const companies: Omit<CompanyRow, "id">[] = [];
  for (const [root, list] of groups) {
    const given = mostCommon(list.map((c) => c.company));
    const prev = existing.get(root);
    const name = prev && prev.source !== "hr sheet" ? prev.name : (given ?? nameFromDomain(root));
    const aliases = new Set([...(prev?.aliases ?? []), ...list.map((c) => c.company && normName(c.company)), normName(nameFromDomain(root))].filter(Boolean) as string[]);
    const slug = prev?.slug ?? uniqueSlug(name, root, taken);
    taken.set(slug, root);
    companies.push({
      domain: root,
      slug,
      name,
      email_domains: [...new Set([...(prev?.email_domains ?? []), ...list.map((c) => c.domain)])],
      aliases: [...aliases],
      source: prev?.source ?? "hr sheet",
    });
  }
  if (dryRun) {
    log(`dry run: would add up to ${contacts.length} contacts and touch ${companies.length} companies`);
    return { dry_run: true, contacts: contacts.length, companies: companies.length };
  }

  for (let i = 0; i < companies.length; i += 200) {
    const { error } = await db.from("companies").upsert(companies.slice(i, i + 200).map((c) => ({ ...c, updated_at: new Date().toISOString() })), { onConflict: "domain" });
    if (error) throw new Error(`companies: ${error.message}`);
  }
  const now = new Date().toISOString();
  let added = 0;
  for (let i = 0; i < contacts.length; i += 500) {
    const batch = contacts.slice(i, i + 500).map((c) => ({
      company_domain: c.domain,
      email: c.email,
      name: c.name,
      role: c.role,
      source: "hr contact sheet",
      verified: false,
      category: c.category,
      quality: c.quality,
      imported_at: now,
    }));
    // ignoreDuplicates: an address we already hold (maybe opted out or verified) is left exactly as it is
    const { data, error } = await db.from("company_contacts").upsert(batch, { onConflict: "company_domain,email", ignoreDuplicates: true }).select("id");
    if (error) throw new Error(`contacts: ${error.message}`);
    added += data?.length ?? 0;
  }
  const sync = await syncJobCompanies(db);
  log(`added ${added} new contacts (${contacts.length - added} already held), ${companies.length} companies; jobs:`, sync);
  return { read: body.length, usable: byEmail.size, added, companies: companies.length, ...sync, ...Object.fromEntries([...skipped].map(([k, v]) => [`skipped_${k}`, v])) };
}

withCronRun("import-hr-contacts", main, db).then(() => process.exit(0)).catch((e) => { console.error(e.message ?? e); process.exit(1); });
