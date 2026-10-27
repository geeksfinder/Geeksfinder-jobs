/**
 * "Report this job": the reasons a student can pick, and when reports hide a job for everyone. Reasons match the
 * job_reports.reason check in migration 009; the hidden reason matches jobs.hidden_reason. An admin can unhide.
 */
export const REPORT_REASONS = [
  { id: "expired", label: "The job is closed" },
  { id: "scam", label: "Looks fake or asks for money" },
  { id: "wrong_info", label: "Wrong details (company, city, role)" },
  { id: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["id"];

/** Reports from this many different students hide the job from every list, page and alert. */
export const HIDE_AFTER = 3;

/** Whether a job's reports hide it, and under which reason: the one most students gave if it's scam or expired. */
export function hideDecision(reasons: ReportReason[]): { hide: false } | { hide: true; reason: "scam" | "expired" | "other" } {
  if (reasons.length < HIDE_AFTER) return { hide: false };
  const n = (r: ReportReason) => reasons.filter((x) => x === r).length;
  const top = n("scam") >= n("expired") ? "scam" : "expired";
  return { hide: true, reason: n(top) * 2 > reasons.length ? top : "other" };
}
