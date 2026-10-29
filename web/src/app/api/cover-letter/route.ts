import { NextResponse } from "next/server";
import { AiBudgetError, coverLetterPrompt, generateJSON, type ParsedResume } from "@/lib/ai";
import { track } from "@/lib/events";
import { rateLimit } from "@/lib/ratelimit";
import { badRequest, fail, tooMany, unauthorized } from "@/lib/security";
import { adminClient, requireUser } from "@/lib/supabase/server";
import { CoverLetterEditBody, JobIdBody, parseJson } from "@/lib/validate";

export const maxDuration = 60;

/**
 * POST { jobId }: the cover letter for this job, written from the student's tailored resume for it. It comes with the
 * tailored resume (no extra credit), so the job must be tailored first; asking again returns the saved letter.
 */
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const body = await parseJson(request, JobIdBody);
  if (!body) return badRequest();
  const rl = await rateLimit("ai", user.id);
  if (!rl.ok) return tooMany(rl.retryAfter);

  const admin = adminClient();
  // Owner filter on every read: another student's job or letter returns nothing (no IDOR)
  const { data: saved } = await admin.from("cover_letters").select("id, body").eq("user_id", user.id).eq("job_id", body.jobId).maybeSingle();
  if (saved) return NextResponse.json(saved);

  const { data: tailored } = await admin
    .from("tailored_resumes")
    .select("id, content")
    .eq("user_id", user.id)
    .eq("job_id", body.jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!tailored) return NextResponse.json({ error: "Tailor your resume for this job first. The cover letter is written from it." }, { status: 409 });
  const { data: job } = await supabase.from("jobs").select("title, company, description").eq("id", body.jobId).maybeSingle();
  if (!job) return NextResponse.json({ error: "This job is no longer available." }, { status: 404 });

  let letter = "";
  try {
    const write = async (tooShort?: number) => {
      const out = await generateJSON<{ letter?: unknown }>(coverLetterPrompt(tailored.content as ParsedResume, { ...job, description: job.description ?? "" }, tooShort));
      return typeof out.letter === "string" ? out.letter.trim().slice(0, 5000) : "";
    };
    letter = await write();
    // Small models undershoot the 180–250 words: one more try, told how short the first one was
    const words = letter.split(/\s+/).filter(Boolean).length;
    if (words < 150) letter = (await write(words)) || letter;
  } catch (e) {
    if (e instanceof AiBudgetError) return fail("cover.budget", e, "We're busy right now. Try again in a few hours.", 503);
    return fail("cover.ai", e, "The cover letter didn't work this time. Try again in a minute.", 502);
  }
  if (letter.length < 50) return fail("cover.empty", new Error("empty letter"), "The cover letter didn't work this time. Try again in a minute.", 502);

  const { data: row, error } = await admin
    .from("cover_letters")
    .upsert({ user_id: user.id, job_id: body.jobId, tailored_id: tailored.id, body: letter, updated_at: new Date().toISOString() }, { onConflict: "user_id,job_id" })
    .select("id, body")
    .single();
  if (error) return fail("cover.save", error);
  await track(admin, "first_action", user.id, { action: "cover_letter" });
  return NextResponse.json(row);
}

/** PATCH { jobId, body }: save the student's edits to their own letter. */
export async function PATCH(request: Request) {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  const parsed = CoverLetterEditBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message);
  const rl = await rateLimit("api", user.id);
  if (!rl.ok) return tooMany(rl.retryAfter);
  const { data, error } = await adminClient()
    .from("cover_letters")
    .update({ body: parsed.data.body, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("job_id", parsed.data.jobId)
    .select("id")
    .maybeSingle();
  if (error) return fail("cover.edit", error);
  if (!data) return NextResponse.json({ error: "Write the cover letter first." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
