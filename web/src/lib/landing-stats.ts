import { unstable_cache } from "next/cache";
import { companiesHiring, type CompanyListing } from "./company-pages";
import { FRESH, publicClient } from "./public-data";

export type LandingStats = {
  /** Live fresher-friendly jobs (last 21 days) */
  liveFresher: number | null;
  /** Jobs added in the last 24 hours, all levels: what the 6:00 run read this morning */
  newToday: number | null;
  companies: CompanyListing[];
};

/** Real counts for the home page (DESIGN.md: real numbers only; null when unavailable). Cached for an hour. */
export const landingStats = unstable_cache(
  async (): Promise<LandingStats> => {
    const db = publicClient();
    if (!db) return { liveFresher: null, newToday: null, companies: [] };
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const [fresher, today, companies] = await Promise.all([
      db.from("jobs").select("id", { count: "exact", head: true }).eq("fresher_friendly", true).gte("created_at", FRESH()),
      db.from("jobs").select("id", { count: "exact", head: true }).gte("created_at", dayAgo),
      companiesHiring().catch(() => [] as CompanyListing[]),
    ]);
    return { liveFresher: fresher.error ? null : (fresher.count ?? null), newToday: today.error ? null : (today.count ?? null), companies };
  },
  ["landing-stats-v1"],
  { revalidate: 3600 },
);
