import { unstable_cache } from "next/cache";
import type { JobCardJob } from "@/components/ui/JobCard";
import { FRESH, JOB_COLS, publicClient } from "./public-data";
import { allRows } from "./supabase/all-rows";

/**
 * Job hubs (SEO plan §8) at three levels: role in a city, a role across India, and every fresher job in a city.
 * A hub is indexable only with ≥ 10 live jobs, so thin pages stay out of search; the wider levels let small
 * cities and niche roles still have an indexable page.
 */
export const HUB_MIN_JOBS = 10;

// Terms are matched against the padded, lowercased title. Keep them specific: "sales" alone would catch "Salesforce Developer".
export const ROLES = [
  { slug: "software-engineer", name: "Software Engineer", terms: ["software engineer", "software developer", "sde"] },
  { slug: "internship", name: "Internship", phrase: "Internships and trainee jobs", terms: ["intern", "trainee", "apprentice"] },
  { slug: "react-developer", name: "React Developer", terms: ["react"] },
  { slug: "frontend-developer", name: "Frontend Developer", terms: ["frontend", "front end", "front-end"] },
  { slug: "backend-developer", name: "Backend Developer", terms: ["backend", "back end", "back-end"] },
  { slug: "full-stack-developer", name: "Full Stack Developer", terms: ["full stack", "fullstack", "mern"] },
  { slug: "java-developer", name: "Java Developer", terms: ["java developer", "java engineer", "java backend", "java full stack", "java intern"] },
  { slug: "python-developer", name: "Python Developer", terms: ["python"] },
  { slug: "web-developer", name: "Web Developer", terms: ["web developer"] },
  { slug: "android-developer", name: "Android Developer", terms: ["android"] },
  { slug: "data-analyst", name: "Data Analyst", terms: ["data analyst", "analytics"] },
  { slug: "data-scientist", name: "Data Science and AI", phrase: "Data science and AI fresher jobs", terms: ["data scien", "machine learning", "ml engineer", "ai engineer"] },
  { slug: "devops-engineer", name: "DevOps Engineer", terms: ["devops", "cloud engineer", "sre"] },
  { slug: "qa-engineer", name: "QA and Testing", phrase: "QA and testing fresher jobs", terms: ["qa engineer", "qa analyst", "sdet", "tester", "test engineer", "quality assurance"] },
  { slug: "ui-ux-designer", name: "UI/UX Designer", terms: ["ui/ux", "ux designer", "ui designer", "product designer"] },
  // Core branches (lib/branches.ts). Terms stay specific: "design engineer" alone would catch UI and chip design roles
  { slug: "graduate-engineer-trainee", name: "Graduate Engineer Trainee", phrase: "Graduate engineer trainee jobs", terms: ["graduate engineer", "engineer trainee", "graduate trainee"] },
  {
    slug: "mechanical-engineer",
    name: "Mechanical Engineering",
    phrase: "Mechanical engineering fresher jobs",
    terms: ["mechanical", "production engineer", "maintenance engineer", "manufacturing engineer", "cad engineer", "cae engineer"],
  },
  {
    slug: "civil-engineer",
    name: "Civil Engineering",
    phrase: "Civil engineering fresher jobs",
    terms: ["civil", "site engineer", "structural engineer", "quantity surveyor", "planning engineer", "billing engineer"],
  },
  { slug: "electrical-engineer", name: "Electrical Engineering", phrase: "Electrical engineering fresher jobs", terms: ["electrical"] },
  {
    slug: "electronics-engineer",
    name: "Electronics, Embedded and VLSI",
    phrase: "Electronics, embedded and VLSI fresher jobs",
    terms: ["electronics", "embedded", "vlsi", "firmware", "pcb", "fpga", "hardware engineer", "rf engineer", "design verification"],
  },
  { slug: "chemical-engineer", name: "Chemical Engineering", phrase: "Chemical engineering fresher jobs", terms: ["chemical", "chemist"] },
  // Chosen by where the job came from (official PSU careers pages, scripts/cron.ts govtJobs), not by title words
  { slug: "govt-psu", name: "Govt and PSU", phrase: "Govt and PSU jobs for freshers", terms: [], source: "govt:" },
  {
    slug: "sales-marketing",
    name: "Sales and Marketing",
    phrase: "Sales and marketing fresher jobs",
    terms: ["sales executive", "sales associate", "inside sales", "sales intern", "sales trainee", "marketing", "business development", "account executive", "account development"],
  },
  {
    slug: "customer-support",
    name: "Customer Support",
    phrase: "Customer support fresher jobs",
    terms: ["support associate", "customer service", "customer support", "voice support", "customer success", "operations associate"],
  },
] as const;

export const CITIES = [
  { slug: "bengaluru", name: "Bengaluru", terms: ["bengaluru", "bangalore"] },
  { slug: "delhi-ncr", name: "Delhi NCR", terms: ["delhi", "gurgaon", "gurugram", "noida"] },
  { slug: "hyderabad", name: "Hyderabad", terms: ["hyderabad"] },
  { slug: "pune", name: "Pune", terms: ["pune"] },
  { slug: "mumbai", name: "Mumbai", terms: ["mumbai", "navi mumbai", "thane"] },
  { slug: "chennai", name: "Chennai", terms: ["chennai"] },
  { slug: "kolhapur", name: "Kolhapur", terms: ["kolhapur"] },
  { slug: "remote", name: "Remote", terms: [] },
] as const;

type Role = (typeof ROLES)[number];
type City = (typeof CITIES)[number];
export type Hub = { slug: string; role: Role | null; city: City | null };

export const hubSlug = (role: Role | null, city: City | null) =>
  role && city ? `${role.slug}-fresher-${city.slug}` : role ? `${role.slug}-fresher-jobs` : `fresher-jobs-${city!.slug}`;

export function parseHub(slug: string): Hub | null {
  const cityOnly = /^fresher-jobs-([a-z-]+)$/.exec(slug);
  if (cityOnly) {
    const city = CITIES.find((c) => c.slug === cityOnly[1]);
    return city ? { slug, role: null, city } : null;
  }
  const roleOnly = /^([a-z-]+)-fresher-jobs$/.exec(slug);
  if (roleOnly) {
    const role = ROLES.find((r) => r.slug === roleOnly[1]);
    return role ? { slug, role, city: null } : null;
  }
  const m = /^([a-z-]+)-fresher-([a-z-]+)$/.exec(slug);
  if (!m) return null;
  const role = ROLES.find((r) => r.slug === m[1]);
  const city = CITIES.find((c) => c.slug === m[2]);
  return role && city ? { slug, role, city } : null;
}

export const allHubs = (): Hub[] => [
  ...CITIES.map((city) => ({ slug: hubSlug(null, city), role: null, city })),
  ...ROLES.map((role) => ({ slug: hubSlug(role, null), role, city: null })),
  ...ROLES.flatMap((role) => CITIES.map((city) => ({ slug: hubSlug(role, city), role, city }))),
];

const rolePhrase = (role: Role | null) => (role ? ("phrase" in role ? role.phrase : `${role.name} fresher jobs`) : "Fresher jobs");

/** The hub's name as a heading: "React Developer fresher jobs in Bengaluru", "Remote fresher jobs", "Internships and trainee jobs in India". */
export function hubName(hub: Pick<Hub, "role" | "city">) {
  const phrase = rolePhrase(hub.role);
  if (hub.city?.slug === "remote") return `Remote ${phrase.charAt(0).toLowerCase()}${phrase.slice(1)}`;
  return `${phrase} in ${hub.city ? hub.city.name : "India"}`;
}

const esc = (s: string) => s.replace(/[%_,()]/g, " ").trim();

const roleSource = (role: Role | null) => (role && "source" in role ? role.source : null);

export async function hubJobs(hub: Hub, limit = 60): Promise<JobCardJob[]> {
  const db = publicClient();
  if (!db) return [];
  let q = db.from("jobs").select(JOB_COLS).eq("fresher_friendly", true).gte("created_at", FRESH()).order("posted_at", { ascending: false }).limit(limit);
  const source = roleSource(hub.role);
  if (source) q = q.like("source", `${source}%`);
  else if (hub.role) q = q.or(hub.role.terms.map((t) => `title.ilike.%${esc(t)}%`).join(","));
  if (hub.city) q = hub.city.slug === "remote" ? q.eq("remote", true) : q.or(hub.city.terms.map((t) => `location.ilike.%${esc(t)}%`).join(","));
  const { data } = await q;
  return (data ?? []) as JobCardJob[];
}

/** Unique data GeeksFinder owns: openings this week, common skills, top hiring companies. */
export function hubStats(jobs: JobCardJob[]) {
  const weekAgo = Date.now() - 7 * 86_400_000;
  const thisWeek = jobs.filter((j) => j.posted_at && new Date(j.posted_at).getTime() >= weekAgo).length;
  const tally = (xs: string[]) => {
    const m = new Map<string, number>();
    xs.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  return {
    total: jobs.length,
    thisWeek,
    skills: tally(jobs.flatMap((j) => j.skills)).slice(0, 8),
    companies: tally(jobs.map((j) => j.company)).slice(0, 6),
  };
}

/** Pure count of live jobs per hub slug, from title, location and remote flag. */
export function countHubs(jobs: { title: string; location: string | null; remote: boolean | null; source?: string | null }[]): Map<string, number> {
  const counts = new Map<string, number>();
  const hubs = allHubs();
  for (const j of jobs) {
    const title = ` ${j.title.toLowerCase()} `;
    const loc = (j.location ?? "").toLowerCase();
    for (const h of hubs) {
      const source = roleSource(h.role);
      const roleHit = !h.role || (source ? (j.source ?? "").startsWith(source) : h.role.terms.some((t) => title.includes(t)));
      const cityHit = !h.city || (h.city.slug === "remote" ? !!j.remote : h.city.terms.some((t) => loc.includes(t)));
      if (roleHit && cityHit) counts.set(h.slug, (counts.get(h.slug) ?? 0) + 1);
    }
  }
  return counts;
}

/** Live-job count for every hub from one query, cached for an hour (sitemap, jobs index, related links). */
export const hubCounts = unstable_cache(
  async (): Promise<[string, number][]> => {
    const db = publicClient();
    if (!db) return [];
    const since = FRESH();
    const data = await allRows<{ title: string; location: string | null; remote: boolean | null; source: string }>((a, b) =>
      db.from("jobs").select("title, location, remote, source").eq("fresher_friendly", true).gte("created_at", since).order("id").range(a, b),
    );
    return [...countHubs(data)];
  },
  ["hub-counts-v3"],
  { revalidate: 3600 },
);

/** Hubs that pass the index bar, biggest first. */
export async function indexableHubs(): Promise<{ hub: Hub; count: number }[]> {
  const counts = new Map(await hubCounts());
  return allHubs()
    .map((hub) => ({ hub, count: counts.get(hub.slug) ?? 0 }))
    .filter((h) => h.count >= HUB_MIN_JOBS)
    .sort((a, b) => b.count - a.count);
}
