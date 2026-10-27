"use server";

import { revalidatePath } from "next/cache";
import { adminAlert } from "@/lib/admin/alerts";
import { hideDecision, type ReportReason } from "@/lib/job-reports";
import { rateLimit } from "@/lib/ratelimit";
import { adminClient, requireUser } from "@/lib/supabase/server";
import { ReportBody } from "@/lib/validate";

/**
 * "Report this job". The job leaves the reporter's own lists at once; after HIDE_AFTER different students report it,
 * it is hidden for everyone and the owner gets a Telegram message. job_reports has no student policies (admin data),
 * so the write uses the service role after the session check.
 */
export async function reportJob(jobId: string, reason: ReportReason) {
  const { user } = await requireUser();
  if (!user) throw new Error("unauthorized");
  const parsed = ReportBody.safeParse({ jobId, reason });
  if (!parsed.success) throw new Error("bad request");
  if (!(await rateLimit("report", user.id)).ok) throw new Error("rate limited");

  const db = adminClient();
  const { error } = await db.from("job_reports").upsert({ job_id: parsed.data.jobId, user_id: user.id, reason: parsed.data.reason }, { onConflict: "job_id,user_id" });
  if (error) throw new Error("could not save");
  await db.from("matches").delete().eq("user_id", user.id).eq("job_id", parsed.data.jobId);

  const { data: reports } = await db.from("job_reports").select("reason").eq("job_id", parsed.data.jobId);
  const decision = hideDecision((reports ?? []).map((r) => r.reason as ReportReason));
  if (decision.hide) {
    const { data: hidden } = await db
      .from("jobs")
      .update({ hidden_at: new Date().toISOString(), hidden_reason: decision.reason })
      .eq("id", parsed.data.jobId)
      .is("hidden_at", null)
      .select("title, company");
    if (hidden?.length) await adminAlert(`Job hidden after ${reports!.length} reports (${decision.reason}): ${hidden[0].title} · ${hidden[0].company}`, db);
  }
  revalidatePath("/dashboard");
}
