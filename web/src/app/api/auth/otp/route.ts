import { NextResponse } from "next/server";
import { z } from "zod";
import { getFlag } from "@/lib/admin/flags";
import { sendEmail } from "@/lib/email";
import { loginCodeEmail } from "@/lib/login-email";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { badRequest, log, tooMany } from "@/lib/security";
import { adminClient, createClient } from "@/lib/supabase/server";
import { verifyTurnstile } from "@/lib/turnstile";
import { parseJson } from "@/lib/validate";

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  turnstile: z.string().max(2048).optional(),
  next: z.string().max(200).optional(),
});

/**
 * Email a sign-in code from GeeksFinder. Supabase creates the code without sending anything (admin generateLink);
 * we send it through Brevo with our own email, so students get a code, not Supabase's sign-in link.
 * Rate limited per IP and per email, CAPTCHA-checked, same response for known and unknown emails.
 */
export async function POST(request: Request) {
  const body = await parseJson(request, Body);
  if (!body) return badRequest("Enter a valid email address.");
  const ip = await clientIp();
  const [byIp, byEmail] = await Promise.all([rateLimit("auth"), rateLimit("auth", `email:${body.email}`)]);
  if (!byIp.ok || !byEmail.ok) return tooMany(Math.max(byIp.retryAfter, byEmail.retryAfter));
  // generateLink skips Supabase's own bot check, so this route always checks the Turnstile token itself
  if (!(await verifyTurnstile(body.turnstile, ip))) return badRequest("Please complete the check above and try again.");

  const { data, error } = await adminClient().auth.admin.generateLink({ type: "magiclink", email: body.email });
  const code = data?.properties?.email_otp;
  if (error || !code) {
    // The signups switch stops new accounts at the database trigger (migration 009)
    if (error && !(await getFlag("signups"))) {
      return NextResponse.json({ error: "Sign-ups are paused for a short while. Please try again later." }, { status: 503 });
    }
    log.warn("auth.otp.generate", error ?? "no code returned");
    return fallback(body.email);
  }

  const mail = loginCodeEmail(code);
  if (!(await sendEmail(body.email, mail.subject, mail.html))) {
    // Brevo down or not configured: let Supabase send its own email so nobody is locked out
    log.warn("auth.otp.send", "Brevo didn't accept the code email; falling back to Supabase");
    return fallback(body.email);
  }
  return NextResponse.json({ ok: true, digits: code.length, message: "Check your inbox for your code." });
}

/** Supabase's built-in email (its template decides whether it shows a code or a link). */
async function fallback(email: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) log.warn("auth.otp.fallback", error); // never reveal whether the email exists
  return NextResponse.json({ ok: true, message: "Check your inbox for your code." });
}
