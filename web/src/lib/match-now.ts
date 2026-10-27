import type { SupabaseClient } from "@supabase/supabase-js";
import { NEAR_THRESHOLD, scoreMatch } from "./matching";
import { allRows } from "./supabase/all-rows";

type Profile = { skills: string[]; preferred_roles: string[]; locations: string[]; job_type: string | null; experience_level: string | null };
type Job = { id: string; title: string; location: string | null; remote: boolean | null; skills: string[]; fresher_friendly: boolean | null; posted_at: string | null; experience_min: number | null };

/** Same filters the daily cron uses, shared so both stay in sync. */
export function eligible(p: Profile, j: Job) {
  const isIntern = /intern/i.test(j.title);
  if (p.job_type === "internship" && !isIntern) return false;
  if (p.job_type === "full-time" && isIntern) return false;
  if (p.experience_level === "fresher" && (j.experience_min ?? 0) > 1) return false;
  return true;
}

/** Score the last 14 days of enriched jobs for one user right now (onboarding "Done" step). */
export async function matchNow(admin: SupabaseClient, userId: string) {
  const { data: p } = await admin.from("profiles").select("skills, preferred_roles, locations, job_type, experience_level").eq("user_id", userId).maybeSingle();
  if (!p?.skills?.length) return 0;
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  // Paged past the 1,000-row cap; hidden jobs (reported or removed by an admin) are never matched
  const jobs = await allRows<Job>((a, b) =>
    admin.from("jobs").select("id, title, location, remote, skills, fresher_friendly, posted_at, experience_min").eq("enriched", true).is("hidden_at", null).gte("created_at", since).order("id").range(a, b),
  );
  const rows = jobs
    .filter((j) => eligible(p, j))
    .map((j) => ({ job_id: j.id, ...scoreMatch(p, j) }))
    .filter((r) => r.score >= NEAR_THRESHOLD)
    .map((r) => ({ user_id: userId, job_id: r.job_id, score: r.score, reasons: r.reasons }));
  if (rows.length) await admin.from("matches").upsert(rows, { onConflict: "user_id,job_id", ignoreDuplicates: true });
  return rows.length;
}
