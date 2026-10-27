import type { SupabaseClient } from "@supabase/supabase-js";
import type { Filters } from "@/components/app/FilterBar";
import type { JobCardJob } from "@/components/ui/JobCard";
import type { MatchReasons } from "@/components/ui/MatchScore";
import { canonicalCity, citySpellings } from "./job-facets";
import { scoreMatch, type MatchProfile } from "./matching";

export type JobRow = { score: number; reasons: MatchReasons; created_at: string; jobs: JobCardJob & { apply_url: string | null } };

const DAY = 86_400_000;
export const SEARCH_LIMIT = 100;
const JOB_COLS = "id, title, company, company_domain, location, remote, fresher_friendly, skills, posted_at, apply_url, created_at";

/** Search-box text → safe plain text: letters, numbers and a few symbols used in skills (C++, C#, Node.js, UI/UX). */
export function cleanTerm(s: string | undefined) {
  return (s ?? "").replace(/[^\p{L}\p{N} +#./&-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}
/** City names are only letters, spaces and hyphens. */
const cleanCity = (s: string | undefined) => (s ?? "").replace(/[^\p{L} -]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 40);
// Escape LIKE wildcards so "%" or "_" typed by a user match literally
const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const lc = (s: string | null | undefined) => (s ?? "").toLowerCase();
const postedAt = (r: JobRow) => new Date(r.jobs.posted_at ?? r.created_at).getTime();

/** Filters + sort for the user's own matches (≤100 rows, done in memory). */
export function filterRows(rows: JobRow[], f: Filters): JobRow[] {
  const role = lc(cleanTerm(f.role));
  const skill = lc(cleanTerm(f.skill));
  const place = canonicalCity(cleanCity(f.city)).toLowerCase();
  let out = rows;
  if (role) out = out.filter((m) => lc(m.jobs.title).includes(role));
  if (skill) out = out.filter((m) => m.jobs.skills.some((s) => lc(s) === skill || lc(s).includes(skill)));
  if (place) out = out.filter((m) => !m.jobs.remote && canonicalCity(m.jobs.location).toLowerCase() === place);
  if (f.remote) out = out.filter((m) => m.jobs.remote);
  if (f.fresher) out = out.filter((m) => m.jobs.fresher_friendly);
  if (f.intern) out = out.filter((m) => /intern/i.test(m.jobs.title));
  if (f.min) out = out.filter((m) => m.score >= Number(f.min));
  if (f.posted) {
    const since = Date.now() - Number(f.posted) * DAY;
    out = out.filter((m) => postedAt(m) >= since);
  }
  return [...out].sort((a, b) => (f.sort === "new" ? postedAt(b) - postedAt(a) : b.score - a.score));
}

/** "All jobs": search every live job in the database, then score each one against the user's resume. */
/** Skill names as stored on jobs that match what the user typed: exact (any case) first, else partial ("py" → Python, PySpark). */
export function skillVariants(typed: string, known: string[]) {
  const t = typed.toLowerCase();
  if (!t) return [];
  const exact = known.filter((k) => k.toLowerCase() === t);
  if (exact.length) return exact;
  const partial = known.filter((k) => k.toLowerCase().includes(t)).slice(0, 15);
  return partial.length ? partial : [typed];
}

export async function searchAllJobs(db: SupabaseClient, f: Filters, profile: MatchProfile | null, knownSkills: string[] = []): Promise<{ rows: JobRow[]; total: number }> {
  const role = cleanTerm(f.role);
  const skill = cleanTerm(f.skill);
  const place = canonicalCity(cleanCity(f.city));

  let q = db
    .from("jobs")
    .select(JOB_COLS, { count: "exact" })
    .eq("enriched", true)
    .gte("created_at", new Date(Date.now() - 45 * DAY).toISOString());
  if (role) q = q.ilike("title", like(role));
  if (skill) q = q.overlaps("skills", skillVariants(skill, knownSkills));
  // City spellings come from our alias table (or the cleaned term), never raw input, so the or() filter stays well-formed
  if (place) q = q.or(citySpellings(place).map((c) => `location.ilike.${like(cleanCity(c))}`).join(",")).eq("remote", false);
  if (f.remote) q = q.eq("remote", true);
  if (f.fresher) q = q.eq("fresher_friendly", true);
  if (f.intern) q = q.ilike("title", "%intern%");
  if (f.posted) q = q.gte("posted_at", new Date(Date.now() - Number(f.posted) * DAY).toISOString());

  const { data, count } = await q.order("posted_at", { ascending: false, nullsFirst: false }).limit(SEARCH_LIMIT);
  let rows: JobRow[] = (data ?? []).map((j) => {
    const { created_at, ...job } = j as typeof j & { created_at: string };
    const m = profile?.skills?.length ? scoreMatch(profile, job) : { score: 0, reasons: {} };
    return { score: m.score, reasons: m.reasons, created_at, jobs: job };
  });
  if (f.min) rows = rows.filter((r) => r.score >= Number(f.min));
  rows.sort((a, b) => (f.sort === "new" ? postedAt(b) - postedAt(a) : b.score - a.score));
  return { rows, total: f.min ? rows.length : (count ?? rows.length) };
}
