import { createClient } from "@supabase/supabase-js";
import type { JobCardJob } from "@/components/ui/JobCard";

/**
 * Anonymous read-only client for public pages (blog, job hubs). Uses the anon key, so RLS still applies:
 * only public jobs and published articles are readable. Returns null when Supabase isn't configured yet.
 */
export function publicClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    // Public pages must never hang on a slow database
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(8000) }) },
  });
}

export type Article = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  topic: string | null;
  body_html: string;
  freshers_note: string | null;
  sources: { url: string; title: string }[];
  reviewer_name: string;
  // true = published by the automated checks with no person approving it; the byline then names no reviewer
  auto_published?: boolean;
  kind?: "news" | "guide";
  related_skills: string[];
  published_at: string;
  updated_at: string | null;
};

const JOB_COLS = "id, title, company, company_domain, location, remote, fresher_friendly, skills, posted_at";
const FRESH = () => new Date(Date.now() - 21 * 86_400_000).toISOString();

/** 3 live fresher jobs related to an article's skills (falls back to latest fresher jobs). */
export async function relatedJobs(skills: string[], limit = 3): Promise<JobCardJob[]> {
  const db = publicClient();
  if (!db) return [];
  let q = db.from("jobs").select(JOB_COLS).eq("fresher_friendly", true).gte("created_at", FRESH()).order("posted_at", { ascending: false }).limit(limit);
  if (skills.length) q = q.overlaps("skills", skills);
  const { data } = await q;
  if (data?.length || !skills.length) return (data ?? []) as JobCardJob[];
  return relatedJobs([], limit);
}

export { JOB_COLS, FRESH };
