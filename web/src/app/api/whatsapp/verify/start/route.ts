import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { apiError, log } from "@/lib/security";
import { adminClient, requireUser } from "@/lib/supabase/server";
import { WaStartBody } from "@/lib/validate";
import { sendTemplate } from "@/lib/whatsapp/client";
import { istDay, messageCost } from "@/lib/whatsapp/cost";
import { planAllowsWhatsApp } from "@/lib/whatsapp/eligibility";
import { OTP_TTL_MS, hashCode, newCode } from "@/lib/whatsapp/otp";
import { CONSENT_VERSION, SUBMITTED_CATEGORY, verifyMessage } from "@/lib/whatsapp/templates";

/**
 * Step 1 of connecting WhatsApp (SPEC.md §3 Verification): save the number and consent, send a 6-digit code.
 * POST { phone, consent: true } → { status: "pending" }
 */
export async function POST(request: Request) {
  const { user } = await requireUser();
  if (!user) return apiError(401, "unauthorized", "Please sign in again.");

  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    // validated below
  }
  const parsed = WaStartBody.safeParse(raw);
  if (!parsed.success) return apiError(400, "bad_request", parsed.error.issues[0]?.message ?? "Enter your WhatsApp number and tick the box.");
  const { phone } = parsed.data;

  // 3 codes an hour per account and per number, so nobody can flood a number with codes
  const byUser = await rateLimit("waStart", user.id);
  const byPhone = await rateLimit("waStart", `phone:${createHash("sha256").update(phone).digest("hex")}`);
  if (!byUser.ok || !byPhone.ok) return apiError(429, "rate_limited", "Too many codes. Wait an hour, then ask for a new one.", { "Retry-After": String(Math.max(byUser.retryAfter, byPhone.retryAfter)) });

  const admin = adminClient();
  // Entitlement comes from the database (plan_limits), never from the request
  if (!(await planAllowsWhatsApp(admin, user.id))) return apiError(403, "plan", "WhatsApp alerts come with Pro + WhatsApp. Upgrade in Billing to add them.");

  const { data: taken } = await admin.from("whatsapp_contacts").select("user_id").eq("phone_e164", phone).eq("status", "verified").neq("user_id", user.id).maybeSingle();
  if (taken) return apiError(409, "number_taken", "This number is already connected to another GeeksFinder account. Use a different number.");

  const now = new Date();
  const { error: saveErr } = await admin.from("whatsapp_contacts").upsert(
    { user_id: user.id, phone_e164: phone, status: "pending", consent_at: now.toISOString(), consent_version: CONSENT_VERSION, updated_at: now.toISOString() },
    { onConflict: "user_id" },
  );
  if (saveErr) {
    log.error("whatsapp.start.save", saveErr);
    return apiError(500, "server_error", "Your number didn't save. Try again.");
  }

  const code = newCode();
  await admin.from("whatsapp_otps").insert({ user_id: user.id, phone_e164: phone, code_hash: hashCode(user.id, code), expires_at: new Date(now.getTime() + OTP_TTL_MS).toISOString() });

  const sent = await sendTemplate(phone, verifyMessage(code), admin);
  const category = SUBMITTED_CATEGORY.gf_verify;
  await admin.from("wa_messages").insert({
    user_id: user.id,
    kind: "verify",
    template: "gf_verify",
    send_date: istDay(),
    meta_message_id: sent.ok ? sent.messageId : null,
    status: sent.ok ? "sent" : "failed",
    category,
    cost_inr: sent.ok ? await messageCost(admin, category).catch(() => 0) : 0,
    error_code: sent.ok ? null : (sent.errorCode ?? sent.reason),
  });
  if (!sent.ok) {
    return sent.reason === "api_error"
      ? apiError(502, "send_failed", "WhatsApp didn't accept the code. Check the number is on WhatsApp, then try again.")
      : apiError(503, "paused", "WhatsApp codes are paused for a short while. Try again later.");
  }
  return NextResponse.json({ status: "pending" });
}
