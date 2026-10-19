import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanCompany, logoDomain } from "./company";
import { companySlug, normName, rootDomain } from "./companies";
import { allRows } from "./supabase/all-rows";

export type CompanyRow = { id?: string; domain: string; slug: string; name: string; email_domains: string[]; aliases: string[]; source: string };

/** "SWIGGY" → "Swiggy"; names written in normal case are kept as they are ("HackerRank", "IBM"). */
export function displayName(company: string) {
  const n = cleanCompany(company);
  return n.length > 4 && n === n.toUpperCase() && /[A-Z]/.test(n) ? n.toLowerCase().replace(/(^|[^a-z])[a-z]/g, (m) => m.toUpperCase()) : n;
}

/** Slug not used by another company: "star", then "star-startv-com". */
export function uniqueSlug(name: string, domain: string, taken: Map<string, string>): string {
  const base = companySlug(name);
  const owner = taken.get(base);
  if (!owner || owner === domain) return base;
  return `${base}-${domain.replace(/[^a-z0-9]+/g, "-")}`.slice(0, 80);
}

/** name (normalised) → root domain, from every company's aliases. Ambiguous names (two domains) are left out. */
export function aliasIndex(companies: Pick<CompanyRow, "domain" | "aliases">[]) {
  const seen = new Map<string, string | null>();
  for (const c of companies) {
    for (const a of c.aliases) {
      if (!a) continue;
      const prev = seen.get(a);
      seen.set(a, prev === undefined || prev === c.domain ? c.domain : null);
    }
  }
  return new Map([...seen].filter(([, d]) => d !== null) as [string, string][]);
}

/**
 * Daily, after new jobs arrive: every company with jobs gets a companies row, and jobs without a company website
 * get one when the company's name is a known alias. Exact normalised names only, so similar names never merge.
 */
export async function syncJobCompanies(db: SupabaseClient) {
  const [jobs, rows] = await Promise.all([
    allRows<{ company: string; company_domain: string | null }>((a, b) => db.from("jobs").select("company, company_domain").order("id").range(a, b)),
    allRows<CompanyRow>((a, b) => db.from("companies").select("id, domain, slug, name, email_domains, aliases, source").order("id").range(a, b)),
  ]);
  const companies = new Map<string, CompanyRow>(rows.map((r) => [r.domain, r]));
  const taken = new Map([...companies.values()].map((c) => [c.slug, c.domain]));
  const aliases = aliasIndex([...companies.values()]);

  const pairs = new Map<string, { company: string; domain: string | null }>();
  for (const j of jobs) pairs.set(`${j.company}|${j.company_domain ?? ""}`, { company: j.company, domain: j.company_domain ?? null });

  const upserts = new Map<string, CompanyRow>();
  let filled = 0;
  for (const { company, domain } of pairs.values()) {
    const alias = normName(company);
    const fromJob = logoDomain(company, domain);
    // A job with no website of its own joins the company already known by that exact name (its HR may use another
    // domain, e.g. swiggy.in), before falling back to the curated domain list
    const byName = !domain && alias ? (aliases.get(alias) ?? null) : null;
    const root = byName ?? (fromJob ? rootDomain(fromJob) : null);
    if (!root) continue;

    if (!domain) {
      // Fill the job's company website (logos, HR lookups and company pages all key off it)
      const { data } = await db.from("jobs").update({ company_domain: root }).eq("company", company).is("company_domain", null).select("id");
      filled += data?.length ?? 0;
    }
    const existing = upserts.get(root) ?? companies.get(root);
    // A new domain for a company we already know by exact name (swiggy.com for Swiggy, whose HR uses swiggy.in)
    // becomes one more of its domains, not a second Swiggy
    const sameName = !existing && alias ? aliases.get(alias) : undefined;
    if (sameName && sameName !== root) {
      const owner = upserts.get(sameName) ?? companies.get(sameName);
      if (owner && !owner.email_domains.includes(root)) upserts.set(sameName, { ...owner, email_domains: [...owner.email_domains, root] });
      continue;
    }
    if (existing) {
      if (alias && !existing.aliases.includes(alias)) upserts.set(root, { ...existing, aliases: [...existing.aliases, alias] });
    } else {
      const name = displayName(company);
      const slug = uniqueSlug(name, root, taken);
      taken.set(slug, root);
      upserts.set(root, { domain: root, slug, name, email_domains: [], aliases: alias ? [alias] : [], source: fromJob && !domain ? "known" : "jobs" });
    }
  }
  const list = [...upserts.values()].map((c) => ({
    domain: c.domain,
    slug: c.slug,
    name: c.name,
    email_domains: c.email_domains,
    aliases: c.aliases,
    source: c.source,
    updated_at: new Date().toISOString(),
  }));
  for (let i = 0; i < list.length; i += 200) {
    const { error } = await db.from("companies").upsert(list.slice(i, i + 200), { onConflict: "domain" });
    if (error) throw new Error(`companies upsert: ${error.message}`);
  }
  return { companies_changed: list.length, job_domains_filled: filled };
}
