import { unstable_cache } from "next/cache";
import { canonicalCity } from "./cities";
import { publicClient } from "./public-data";

// City spellings live in lib/cities.ts (shared with matching and scripts); re-exported for existing imports
export { canonicalCity, citySpellings } from "./cities";

// Roles freshers search for; shown even before matching jobs exist, merged with real titles
const COMMON_ROLES = [
  "Software Engineer", "Software Developer", "Frontend Developer", "Backend Developer", "Full Stack Developer",
  "Web Developer", "Android Developer", "iOS Developer", "Mobile Developer", "Data Analyst", "Data Scientist",
  "Data Engineer", "Machine Learning Engineer", "AI Engineer", "DevOps Engineer", "Cloud Engineer", "Site Reliability Engineer",
  "QA Engineer", "Test Engineer", "Security Engineer", "Support Engineer", "Solutions Engineer", "Application Engineer",
  "Business Analyst", "Product Manager", "Product Analyst", "UI/UX Designer", "Graphic Designer", "Technical Writer",
  "Customer Success", "Sales", "Marketing", "Operations", "Intern",
];

// Strip level words, brackets and anything after " - " / "," / "|" so "Senior Software Engineer - Java (L3)" → "Software Engineer"
const SENIORITY = /\b(senior|sr\.?|staff|principal|lead|manager|head|director|ii|iii|iv|i|l\d)\b|\(.*?\)|\s[-–|]\s.*$|,.*$/gi;

export type Facets = {
  roles: { name: string; count: number }[];
  skills: { name: string; count: number }[];
  cities: { name: string; count: number }[];
  total: number;
};

const top = (m: Map<string, number>, n: number) =>
  [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([name, count]) => ({ name, count }));

/** Search suggestions across all live jobs. Cached for an hour; jobs change once a day. */
export const jobFacets = unstable_cache(
  async (): Promise<Facets> => {
    const db = publicClient();
    if (!db) return { roles: COMMON_ROLES.map((name) => ({ name, count: 0 })), skills: [], cities: [], total: 0 };
    const since = new Date(Date.now() - 45 * 86_400_000).toISOString();
    const { data } = await db.from("jobs").select("title, location, remote, skills").eq("enriched", true).gte("created_at", since).limit(5000);
    const jobs = data ?? [];

    const skills = new Map<string, number>();
    const cities = new Map<string, number>();
    const titles = new Map<string, number>();
    const seenSkill = new Map<string, string>(); // lower → first spelling
    for (const j of jobs) {
      for (const s of (j.skills ?? []) as string[]) {
        const key = s.trim().toLowerCase();
        if (!key) continue;
        const name = seenSkill.get(key) ?? s.trim();
        seenSkill.set(key, name);
        skills.set(name, (skills.get(name) ?? 0) + 1);
      }
      if (!j.remote) {
        const c = canonicalCity(j.location);
        if (c && c.length < 30) cities.set(c, (cities.get(c) ?? 0) + 1);
      }
      const t = (j.title as string).replace(SENIORITY, "").replace(/\s+/g, " ").trim();
      if (t.length >= 4 && t.length <= 50) titles.set(t, (titles.get(t) ?? 0) + 1);
    }

    // Common fresher roles first (with live counts), then frequent real titles
    const count = (role: string) => jobs.filter((j) => (j.title as string).toLowerCase().includes(role.toLowerCase())).length;
    const roles = COMMON_ROLES.map((name) => ({ name, count: count(name) }));
    const known = new Set(roles.map((r) => r.name.toLowerCase()));
    for (const r of top(titles, 80)) if (!known.has(r.name.toLowerCase())) roles.push(r);

    return { roles: roles.sort((a, b) => b.count - a.count), skills: top(skills, 400), cities: top(cities, 100), total: jobs.length };
  },
  ["job-facets-v1"],
  { revalidate: 3600 },
);
