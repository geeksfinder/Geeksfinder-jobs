/**
 * Plain-code numbers behind the admin Operations pages (matching, crons, AI, tailoring). No database access here, so
 * each rule is tested on its own; the pages load rows and call these.
 */

/** Score bands, matching how students see them: 45–59 is "Worth a look", 60+ a match, 80+ shown in green. */
export const SCORE_BANDS = [
  { label: "45–59 (Worth a look)", min: 45, max: 59 },
  { label: "60–69", min: 60, max: 69 },
  { label: "70–79", min: 70, max: 79 },
  { label: "80–89", min: 80, max: 89 },
  { label: "90–100", min: 90, max: 100 },
] as const;

export function scoreBands(scores: number[]) {
  return SCORE_BANDS.map((b) => ({ ...b, count: scores.filter((s) => s >= b.min && s <= b.max).length }));
}

export function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** Why a student has no strong matches, most fixable first, so support knows what to tell them. */
export function zeroMatchReason(p: { skills?: string[] | null; preferred_roles?: string[] | null; locations?: string[] | null } | null, near: number) {
  if (!p || !p.skills?.length) return "No resume yet";
  if (p.skills.length < 5) return `Only ${p.skills.length} skills on the profile`;
  if (!p.preferred_roles?.length) return "No roles chosen";
  if (!p.locations?.length) return "No cities chosen";
  if (near > 0) return `Only close fits (${near} worth a look)`;
  return "No jobs for their skills and cities yet";
}

/** "2 min 14 s" for a cron run, "running" while it hasn't finished. */
export function duration(startedAt: string, finishedAt: string | null) {
  if (!finishedAt) return "running";
  const s = Math.max(0, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

/** The few numbers worth showing from a run's counts ("inserted 80 · matched 23"), per-source detail left out. */
export function countsSummary(counts: Record<string, unknown> | null, max = 4) {
  return Object.entries(counts ?? {})
    .filter(([k, v]) => typeof v === "number" && v > 0 && !/^(fetched|kept)_/.test(k))
    .slice(0, max)
    .map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`)
    .join(" · ");
}

/** Share of AI calls that fell back from Gemini to Groq (each request counts once for Gemini, once more for Groq). */
export const fallbackRate = (gemini: number, groq: number) => (gemini ? Math.round((groq / gemini) * 100) : 0);
