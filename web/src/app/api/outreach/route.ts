import { NextResponse } from "next/server";
import { track } from "@/lib/events";
import { AiBudgetError, generateJSON, outreachPrompt } from "@/lib/ai";
import { findContact } from "@/lib/finder";
import { consume } from "@/lib/plan";
import { rateLimit } from "@/lib/ratelimit";
import { loadResume } from "@/lib/resume";
import { badRequest, fail, oneLine, tooMany, unauthorized } from "@/lib/security";
import { adminClient, requireUser } from "@/lib/supabase/server";
import { JobIdBody, parseJson } from "@/lib/validate";

export const maxDuration = 60;

export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const body = await parseJson(request, JobIdBody);
  if (!body) return badRequest();
  const rl = await rateLimit("ai", user.id);
  if (!rl.ok) return tooMany(rl.retryAfter);

  const resume = await loadResume(supabase, user.id);
  if (!resume) return badRequest("Upload your resume first.");
  const admin = adminClient();
  // contact_email is not readable through the public API; read it server-side only after auth + quota checks
  const { data: job } = await admin.from("jobs").select("title, company, description, contact_email, company_domain").eq("id", body.jobId).maybeSingle();
  if (!job) return NextResponse.json({ error: "This job is no longer available." }, { status: 404 });

  const quota = await consume(admin, user.id, "finder");
  if (!quota.ok) return NextResponse.json({ error: "Finding HR emails is part of every paid plan.", upgrade: true }, { status: 402 });

  try {
    const contact = await findContact(admin, job);
    const draft = await generateJSON<{ subject: string; email: string; linkedin_note: string }>(
      outreachPrompt(resume, { ...job, description: job.description ?? "" }, contact?.name),
    );
    await track(admin, "first_action", user.id, { action: "email_hr" });
    return NextResponse.json({
      contact,
      subject: oneLine(String(draft.subject ?? ""), 120),
      email: String(draft.email ?? "").slice(0, 2000),
      linkedin_note: String(draft.linkedin_note ?? "").slice(0, 300),
    });
  } catch (e) {
    if (e instanceof AiBudgetError) return fail("outreach.budget", e, "We're busy right now. Try again in a few hours.", 503);
    return fail("outreach", e, "Couldn't draft the email this time. Try again in a minute.", 502);
  }
}
