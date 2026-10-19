import type { MetadataRoute } from "next";
import { COMPANY_MIN_JOBS, companiesHiring } from "@/lib/company-pages";
import { indexableHubs } from "@/lib/hubs";
import { publicClient } from "@/lib/public-data";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic"; // query at request time, not at build
export const revalidate = 86400;

// Pages whose content changes with the daily job and article runs; the rest are policy pages
const LIVE = ["", "/blog", "/jobs", "/companies"];
const STATIC = ["/tools", "/tools/ats-resume-checker", "/tools/hr-email-generator", "/about", "/editorial-policy", "/contact", "/privacy", "/terms", "/refund-policy", "/hr-opt-out"];
// Date policy pages last changed; update when one is edited, so lastModified stays honest
const STATIC_UPDATED = new Date("2026-10-19");

/** Core pages, published articles, and only job hubs with ≥ 10 live jobs (thin hubs stay out). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const core: MetadataRoute.Sitemap = [
    ...LIVE.map((p) => ({ url: `${SITE.url}${p}`, lastModified: now, changeFrequency: "daily" as const, priority: p === "" ? 1 : 0.8 })),
    ...STATIC.map((p) => ({ url: `${SITE.url}${p}`, lastModified: STATIC_UPDATED, changeFrequency: "monthly" as const, priority: p.startsWith("/tools") ? 0.7 : 0.4 })),
  ];

  const db = publicClient();
  if (!db) return core;

  const { data: articles } = await db.from("articles").select("slug, published_at, updated_at").order("published_at", { ascending: false }).limit(5000);
  const blog = (articles ?? []).map((a) => ({ url: `${SITE.url}/blog/${a.slug}`, lastModified: new Date(a.updated_at ?? a.published_at), changeFrequency: "weekly" as const, priority: 0.7 }));

  const hubs = (await indexableHubs()).map(({ hub }) => ({ url: `${SITE.url}/jobs/${hub.slug}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.8 }));
  const companies = (await companiesHiring())
    .filter((c) => c.jobs >= COMPANY_MIN_JOBS)
    .map((c) => ({ url: `${SITE.url}/companies/${c.slug}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.7 }));
  return [...core, ...blog, ...hubs, ...companies];
}
