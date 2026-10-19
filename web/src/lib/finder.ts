import type { SupabaseClient } from "@supabase/supabase-js";
import { getFlag } from "./admin/flags";
import { safeFetch } from "./safe-fetch";

export type Contact = { email: string; name?: string; source: string };

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const HR_PREFIXES = ["careers", "hr", "jobs", "recruitment", "hiring", "talent", "people"];

/**
 * TRD chain, stop at first hit:
 * 1 job-post email → 2 cached company_contacts → 3 careers@/hr@/jobs@ on company site →
 * 4 Hunter.io (1 credit, then cached) → 5 pattern guess: skipped until an SMTP verifier is added (plan: "verified before use")
 * → 6 null = LinkedIn note only
 */
export async function findContact(
  admin: SupabaseClient,
  job: { contact_email: string | null; company_domain: string | null },
): Promise<Contact | null> {
  const domain = job.company_domain?.replace(/^www\./, "") ?? null;

  const blocked = async (email: string) => {
    const { data } = await admin.from("company_contacts").select("do_not_contact").eq("email", email.toLowerCase()).eq("do_not_contact", true).limit(1);
    return !!data?.length;
  };

  if (job.contact_email && !(await blocked(job.contact_email))) return { email: job.contact_email, source: "job post" };
  if (!domain) return null;

  const { data: cached } = await admin
    .from("company_contacts")
    .select("email, name, source")
    .eq("company_domain", domain)
    .eq("do_not_contact", false)
    .order("verified", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cached) return { email: cached.email, name: cached.name ?? undefined, source: `${cached.source} (cached)` };

  const fromSite = await scrapeSite(domain);
  if (fromSite) {
    await admin.from("company_contacts").upsert({ company_domain: domain, email: fromSite, source: "company website", verified: false }, { onConflict: "company_domain,email" });
    if (!(await blocked(fromSite))) return { email: fromSite, source: "company website" };
  }

  // Hunter is a paid lookup: the paid_contact_lookups switch stops it (spend is ₹0 on the free plan, so no cap check yet)
  if (process.env.HUNTER_API_KEY && (await getFlag("paid_contact_lookups"))) {
    try {
      const res = await fetch(`https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&department=hr&limit=3&api_key=${process.env.HUNTER_API_KEY}`, { signal: AbortSignal.timeout(6000) });
      const data = await res.json();
      const hit = (data.data?.emails ?? []).find((e: { confidence: number }) => e.confidence >= 80);
      if (hit) {
        const name = [hit.first_name, hit.last_name].filter(Boolean).join(" ") || undefined;
        await admin.from("company_contacts").upsert(
          { company_domain: domain, email: hit.value, name, role: hit.position, source: "hunter", verified: hit.verification?.status === "valid" },
          { onConflict: "company_domain,email" },
        );
        if (!(await blocked(hit.value))) return { email: hit.value, name, source: "hunter" };
      }
    } catch {
      // fall through
    }
  }
  return null;
}

export async function scrapeSite(domain: string): Promise<string | null> {
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return null;
  for (const path of ["/careers", "/contact", "/jobs", ""]) {
    try {
      const res = await safeFetch(`https://${domain}${path}`, { timeoutMs: 5000, maxBytes: 500_000 });
      if (res.status >= 400) continue;
      const emails = [...new Set((res.text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()))].filter((e) => e.endsWith(`@${domain}`));
      const hr = emails.find((e) => HR_PREFIXES.some((p) => e.startsWith(`${p}@`)));
      if (hr) return hr;
    } catch {
      // blocked by SSRF guard or unreachable — try next path
    }
  }
  return null;
}
