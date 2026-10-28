import { NextResponse } from "next/server";
import { audit } from "@/lib/admin/audit";
import { AREA_ROLES } from "@/lib/admin/constants";
import { adminError, adminPost } from "@/lib/admin/route";
import { AdminJobBody } from "@/lib/validate";

/**
 * Hide a job for every student (scam, duplicate, other), mark it expired, or show it again. A hidden job leaves every
 * list, page and alert (RLS for students and visitors; the cron filters hidden_at itself).
 */
export const POST = adminPost(AREA_ROLES.jobs, AdminJobBody, async ({ admin, user }, { job, action, reason }) => {
  const { data: before } = await admin.from("jobs").select("id, title, company, hidden_at, hidden_reason").eq("id", job).maybeSingle();
  if (!before) return adminError(404, "not_found", "No job with that id. Paste the job's link or id.");
  const after =
    action === "unhide"
      ? { hidden_at: null, hidden_reason: null }
      : { hidden_at: before.hidden_at ?? new Date().toISOString(), hidden_reason: action === "expired" ? "expired" : reason };
  const { error } = await admin.from("jobs").update(after).eq("id", job);
  if (error) return adminError(500, "save_failed", "Couldn't save. Try again.");
  await audit(user.id, `job.${action}`, { table: "jobs", id: job }, { hidden_at: before.hidden_at, hidden_reason: before.hidden_reason }, after, admin);
  return NextResponse.json({ ok: true, title: before.title });
});
