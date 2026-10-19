import { unstable_cache } from "next/cache";
import type { JobCardJob } from "@/components/ui/JobCard";
import { logoDomain } from "./company";
import { normName, rootDomain } from "./companies";
import { FRESH, JOB_COLS, publicClient } from "./public-data";
import { allRows } from "./supabase/all-rows";

/**
 * Public company profiles (/companies/<slug>). Built from live fresher-friendly jobs only: a page exists when a
 * company has at least one, and is indexable from COMPANY_MIN_JOBS, so thin pages stay out of search.
 * No personal data: HR contacts appear only as "an HR email is on file".
 */
export const COMPANY_MIN_JOBS = 3;

export type Company = { slug: string; name: string; domain: string; email_domains: string[]; aliases: string[]; industry: string | null; city: string | null };
export type CompanyListing = { slug: string; name: string; domain: string; aliases: string[]; jobs: number };

/** Companies with live fresher jobs, biggest first, cached for an hour (index page, sitemap, hub links). */
export const companiesHiring = unstable_cache(
  async (): Promise<CompanyListing[]> => {
    const db = publicClient();
    if (!db) return [];
    const since = FRESH();
    const [jobs, companies] = await Promise.all([
      allRows<{ company: string; company_domain: string | null }>((a, b) => db.from("jobs").select("company, company_domain").eq("fresher_friendly", true).gte("created_at", since).order("id").range(a, b)),
      allRows<{ slug: string; name: string; domain: string; aliases: string[]; email_domains: string[] }>((a, b) => db.from("companies").select("slug, name, domain, aliases, email_domains").order("id").range(a, b)),
    ]);
    const byDomain = new Map(companies.map((c) => [c.domain, c]));
    // Jobs listed under another of the company's domains count for that company
    const owner = new Map<string, string>();
    for (const c of companies) for (const d of c.email_domains ?? []) owner.set(rootDomain(d), c.domain);
    const counts = new Map<string, number>();
    for (const j of jobs) {
      const d = logoDomain(j.company, j.company_domain);
      const r = d ? rootDomain(d) : null;
      const root = r && (byDomain.has(r) ? r : owner.get(r));
      if (root) counts.set(root, (counts.get(root) ?? 0) + 1);
    }
    return [...counts]
      .map(([domain, n]) => {
        const c = byDomain.get(domain)!;
        return { slug: c.slug, name: c.name, domain, aliases: c.aliases ?? [], jobs: n };
      })
      .sort((a, b) => b.jobs - a.jobs || a.name.localeCompare(b.name));
  },
  ["companies-hiring-v1"],
  { revalidate: 3600 },
);

/** "Bosch Group" (as a job lists it) → its company page, if it has one. */
export function companyLinkFinder(list: CompanyListing[]) {
  const byAlias = new Map<string, string>();
  for (const c of list) for (const a of [...c.aliases, normName(c.name)]) if (a && !byAlias.has(a)) byAlias.set(a, c.slug);
  return (company: string) => byAlias.get(normName(company)) ?? null;
}

export async function getCompany(slug: string): Promise<Company | null> {
  const db = publicClient();
  if (!db || !/^[a-z0-9-]{2,80}$/.test(slug)) return null;
  const { data } = await db.from("companies").select("slug, name, domain, email_domains, aliases, industry, city").eq("slug", slug).maybeSingle();
  return (data as Company | null) ?? null;
}

const SAFE_DOMAIN = /^[a-z0-9.-]+$/;

/** Live fresher jobs at the company: any of its domains or their subdomains ("careers.bosch.com"). */
export async function companyJobs(c: Company, limit = 60): Promise<JobCardJob[]> {
  const db = publicClient();
  const domains = [...new Set([c.domain, ...c.email_domains])].filter((d) => SAFE_DOMAIN.test(d)).slice(0, 12);
  if (!db || !domains.length) return [];
  const { data } = await db
    .from("jobs")
    .select(JOB_COLS)
    .eq("fresher_friendly", true)
    .gte("created_at", FRESH())
    .or(domains.flatMap((d) => [`company_domain.eq.${d}`, `company_domain.like.*.${d}`]).join(","))
    .order("posted_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as JobCardJob[];
}

/** Whether any HR email is on file (never who): decides the "Email HR" line on the page. */
export async function companyHasHr(c: Company): Promise<boolean> {
  const db = publicClient();
  if (!db) return false;
  const { data } = await db.rpc("company_has_hr", { p_domains: [c.domain, ...c.email_domains] });
  return data === true;
}

/** Cities a company is hiring in, most openings first: "Bengaluru, Pune and remote". */
export function hiringCities(jobs: JobCardJob[]) {
  const m = new Map<string, number>();
  for (const j of jobs) {
    const city = j.remote ? "Remote" : (j.location ?? "").split(",")[0].trim();
    if (city) m.set(city, (m.get(city) ?? 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}
