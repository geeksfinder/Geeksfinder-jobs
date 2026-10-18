/**
 * Pre-fill HR contacts for every company with live jobs, so Email HR answers instantly.
 *   npx tsx --env-file=.env.local scripts/seed-contacts.ts
 * Same sources and rules as the live finder (lib/finder.ts):
 *   1 public role inboxes (careers@, hr@, jobs@…) on the company's own website — free
 *   2 Hunter.io HR search for companies still missing — keeps HUNTER_RESERVE searches for students' live lookups
 * Never touches an address marked do-not-contact; every row records its source. Safe to re-run.
 */
import { logoDomain } from "@/lib/company";
import { scrapeSite } from "@/lib/finder";
import { adminClient } from "@/lib/supabase/admin";

const db = adminClient();
const RESERVE = Number(process.env.HUNTER_RESERVE ?? 10);
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

type Hit = { value: string; confidence: number; first_name?: string; last_name?: string; position?: string; verification?: { status?: string } };

async function hunterLeft(): Promise<number> {
  if (!process.env.HUNTER_API_KEY) return 0;
  const res = await fetch(`https://api.hunter.io/v2/account?api_key=${process.env.HUNTER_API_KEY}`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  const a = (await res?.json().catch(() => null))?.data;
  return a ? Math.max(0, a.requests.searches.available - a.requests.searches.used - RESERVE) : 0;
}

/** Insert without overwriting existing rows (keeps any do-not-contact flag a person or admin set). */
async function save(rows: Record<string, unknown>[]) {
  if (!rows.length) return 0;
  const { data, error } = await db.from("company_contacts").upsert(rows, { onConflict: "company_domain,email", ignoreDuplicates: true }).select("id");
  if (error) log("save failed", error.message);
  return data?.length ?? 0;
}

async function main() {
  const { data: jobs } = await db.from("jobs").select("company, company_domain").eq("enriched", true);
  const domains = new Map<string, string>(); // domain → company
  const noDomain = new Set<string>();
  for (const j of jobs ?? []) {
    const d = logoDomain(j.company, j.company_domain);
    if (d) domains.set(d, domains.get(d) ?? j.company);
    else noDomain.add(j.company);
  }
  log(`${domains.size} company domains; ${noDomain.size} companies without a known website: ${[...noDomain].join(", ") || "none"}`);

  const { data: existing } = await db.from("company_contacts").select("company_domain").in("company_domain", [...domains.keys()]);
  const have = new Set((existing ?? []).map((r) => r.company_domain));
  // Don't spend searches on companies looked up in the last 30 days (HR teams change, so re-check after that)
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: recent } = await db.from("contact_searches").select("company_domain").gte("searched_at", since);
  const searched = new Set((recent ?? []).map((r) => r.company_domain));
  const todo = [...domains.keys()].filter((d) => !have.has(d) && !searched.has(d));
  log(`${have.size} already have contacts, ${searched.size} searched in the last 30 days; checking ${todo.length}`);

  // 1. Public role inboxes on the company's own site
  const stillMissing: string[] = [];
  let fromSites = 0;
  for (const d of todo) {
    const email = await scrapeSite(d);
    if (email) fromSites += await save([{ company_domain: d, email, source: "company website", verified: false }]);
    else stillMissing.push(d);
  }
  log(`company websites: ${fromSites} role inboxes found; ${stillMissing.length} companies still missing`);

  // 2. Hunter, within budget, highest-confidence HR people only
  let budget = await hunterLeft();
  log(`hunter: ${budget} searches to use now (keeping ${RESERVE} for students this month)`);
  let fromHunter = 0;
  const unresolved: string[] = [];
  for (const d of stillMissing) {
    if (budget <= 0) { unresolved.push(d); continue; }
    budget--;
    const res = await fetch(`https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(d)}&department=hr&limit=5&api_key=${process.env.HUNTER_API_KEY}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
    const data = await res?.json().catch(() => null);
    const hits = ((data?.data?.emails ?? []) as Hit[]).filter((e) => e.confidence >= 80 && e.value.toLowerCase().endsWith(`@${d}`)).slice(0, 3);
    if (data?.data) await db.from("contact_searches").upsert({ company_domain: d, searched_at: new Date().toISOString(), found: hits.length });
    if (!hits.length) { unresolved.push(d); continue; }
    fromHunter += await save(
      hits.map((h) => ({
        company_domain: d,
        email: h.value.toLowerCase(),
        name: [h.first_name, h.last_name].filter(Boolean).join(" ") || null,
        role: h.position ?? null,
        source: "hunter",
        verified: h.verification?.status === "valid",
      })),
    );
    await new Promise((r) => setTimeout(r, 400));
  }
  log(`hunter: ${fromHunter} HR contacts saved`);
  log(`done. companies with no contact found: ${unresolved.length}${unresolved.length ? ` (${unresolved.join(", ")}) — students get the LinkedIn note for these` : ""}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
