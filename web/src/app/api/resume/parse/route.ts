import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { AiBudgetError, generateJSON, resumeParsePrompt, type ParsedResume } from "@/lib/ai";
import { rateLimit } from "@/lib/ratelimit";
import { badRequest, fail, isPdf, tooMany, unauthorized } from "@/lib/security";
import { track } from "@/lib/events";
import { adminClient, requireUser } from "@/lib/supabase/server";
import { fitParsedProfile } from "@/lib/validate";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX = 2 * 1024 * 1024;

export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const rl = await rateLimit("ai", user.id);
  if (!rl.ok) return tooMany(rl.retryAfter);

  if (Number(request.headers.get("content-length") ?? 0) > MAX + 64 * 1024) return badRequest("Your PDF is over 2 MB. Export a smaller PDF and try again.");
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return badRequest("Choose a PDF to upload.");
  if (file.size > MAX) return badRequest("Your PDF is over 2 MB. Export a smaller PDF and try again.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Check magic bytes, not just the extension or browser-reported type
  if (!isPdf(bytes)) return badRequest("This file isn't a PDF. Upload your resume as a PDF.");

  let text = "";
  try {
    const pdf = await getDocumentProxy(bytes);
    if (pdf.numPages > 6) return badRequest("Your resume is over 6 pages. Upload a 1–2 page resume.");
    text = (await extractText(pdf, { mergePages: true })).text;
  } catch (e) {
    return fail("resume.parse.pdf", e, "We couldn't read this PDF. Re-export it from Word or Google Docs and try again.", 422);
  }
  if (!text || text.trim().length < 50) {
    return NextResponse.json({ error: "This PDF has no readable text. Upload a text-based PDF, not a scanned image." }, { status: 422 });
  }

  const path = `${user.id}/resume-${Date.now()}.pdf`;
  const { error: upErr } = await supabase.storage.from("resumes").upload(path, bytes, { contentType: "application/pdf" });
  if (upErr) return fail("resume.parse.upload", upErr, "Upload failed. Try again.");

  let parsed: ParsedResume;
  try {
    parsed = await generateJSON<ParsedResume>(resumeParsePrompt(text));
  } catch (e) {
    if (e instanceof AiBudgetError) return fail("resume.parse.budget", e, "We're busy right now. Try again in a few hours.", 503);
    return fail("resume.parse.ai", e, "We couldn't read your skills this time. Try again in a minute.", 502);
  }

  const skills = [...new Set((parsed.skills ?? []).map((s) => String(s).trim()).filter(Boolean))].slice(0, 60);
  await supabase.from("profiles").upsert({
    user_id: user.id,
    skills,
    // Trimmed to what the profile form accepts, so the student can always save it later
    ...fitParsedProfile(parsed),
    experience_level: ["fresher", "0-1", "1-3"].includes(parsed.experience_level) ? parsed.experience_level : "fresher",
    raw_resume_url: path,
    updated_at: new Date().toISOString(),
  });
  const updates: Record<string, string> = {};
  if (parsed.name) updates.name = String(parsed.name).slice(0, 100);
  if (parsed.phone) updates.phone = String(parsed.phone).replace(/[^+\d\s-]/g, "").slice(0, 20);
  if (Object.keys(updates).length) await supabase.from("users").update(updates).eq("id", user.id);

  await track(adminClient(), "profile_ready", user.id, { skills: skills.length });
  return NextResponse.json({ skills, name: updates.name ?? "" });
}
