import { NextResponse } from "next/server";
import { AiBudgetError, generateJSON, tailorPrompt, type ParsedResume } from "@/lib/ai";
import { track } from "@/lib/events";
import { consume } from "@/lib/plan";
import { rateLimit } from "@/lib/ratelimit";
import { diffLines, enforceNoNewSkills, loadResume } from "@/lib/resume";
import { badRequest, fail, tooMany, unauthorized } from "@/lib/security";
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

  const original = await loadResume(supabase, user.id);
  if (!original?.skills.length) return badRequest("Upload your resume first.");
  const { data: job } = await supabase.from("jobs").select("title, company, description").eq("id", body.jobId).maybeSingle();
  if (!job) return NextResponse.json({ error: "This job is no longer available." }, { status: 404 });

  const admin = adminClient();
  // Cached per user+job: reopening doesn't use another credit (filtered by owner — no IDOR)
  const { data: existing } = await admin
    .from("tailored_resumes")
    .select("id, content")
    .eq("user_id", user.id)
    .eq("job_id", body.jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return NextResponse.json({ id: existing.id, lines: diffLines(original, existing.content as ParsedResume) });

  const quota = await consume(admin, user.id, "tailor");
  if (!quota.ok) {
    return NextResponse.json({ error: `You've used ${quota.limit} of ${quota.limit} tailored resumes this cycle.`, upgrade: true }, { status: 402 });
  }

  let tailored: ParsedResume;
  try {
    const raw = await generateJSON<ParsedResume>(tailorPrompt(original, { ...job, description: job.description ?? "" }));
    tailored = enforceNoNewSkills(original, raw);
  } catch (e) {
    if (e instanceof AiBudgetError) return fail("tailor.budget", e, "We're busy right now. Try again in a few hours.", 503);
    return fail("tailor.ai", e, "Tailoring didn't work this time. Try again in a minute.", 502);
  }

  const { data: row, error } = await admin.from("tailored_resumes").insert({ user_id: user.id, job_id: body.jobId, content: tailored }).select("id").single();
  if (error) return fail("tailor.save", error);
  await track(admin, "first_action", user.id, { action: "tailor" });
  return NextResponse.json({ id: row.id, lines: diffLines(original, tailored) });
}
