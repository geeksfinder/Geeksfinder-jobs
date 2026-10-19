import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { apiError, log } from "@/lib/security";
import { adminClient, requireUser } from "@/lib/supabase/server";
import { WaConfirmBody } from "@/lib/validate";
import { OTP_MAX_TRIES, codeMatches } from "@/lib/whatsapp/otp";

/**
 * Step 2 (SPEC.md §3 Verification): check the code in constant time, 3 tries, then mark the number verified.
 * POST { code } → { status: "verified" }
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
  const parsed = WaConfirmBody.safeParse(raw);
  if (!parsed.success) return apiError(400, "bad_request", parsed.error.issues[0]?.message ?? "Enter the 6-digit code from WhatsApp.");
  const rl = await rateLimit("waConfirm", user.id);
  if (!rl.ok) return apiError(429, "rate_limited", "Too many tries. Wait an hour, then ask for a new code.", { "Retry-After": String(rl.retryAfter) });

  const admin = adminClient();
  const { data: otp } = await admin
    .from("whatsapp_otps")
    .select("id, phone_e164, code_hash, attempts, expires_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!otp || Date.parse(otp.expires_at) < Date.now()) return apiError(400, "expired", "That code has expired. Tap Send code to get a new one.");
  const tries = Number(otp.attempts ?? 0);
  if (tries >= OTP_MAX_TRIES) return apiError(400, "locked", "Too many wrong codes. Tap Send code to get a new one.");

  if (!codeMatches(user.id, parsed.data.code, otp.code_hash)) {
    const attempts = tries + 1;
    await admin.from("whatsapp_otps").update({ attempts }).eq("id", otp.id);
    const left = OTP_MAX_TRIES - attempts;
    return apiError(400, "wrong_code", left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong codes. Tap Send code to get a new one.");
  }

  const now = new Date().toISOString();
  // The unique index on verified numbers is the final guard against two accounts claiming one number (W1.3)
  const { error } = await admin
    .from("whatsapp_contacts")
    .update({ status: "verified", verified_at: now, opted_out_at: null, paused: false, fail_streak: 0, updated_at: now })
    .eq("user_id", user.id)
    .eq("phone_e164", otp.phone_e164);
  if (error) {
    if (error.code === "23505") return apiError(409, "number_taken", "This number is already connected to another GeeksFinder account. Use a different number.");
    log.error("whatsapp.confirm", error);
    return apiError(500, "server_error", "Your number didn't verify. Try again.");
  }
  await admin.from("whatsapp_otps").delete().eq("user_id", user.id);

  // Turn WhatsApp on in the student's alert channels; they can switch it off in Alerts
  const { data: s } = await admin.from("alert_settings").select("channels").eq("user_id", user.id).maybeSingle();
  const channels = (s?.channels ?? []) as string[];
  if (!channels.includes("whatsapp")) await admin.from("alert_settings").update({ channels: [...channels, "whatsapp"] }).eq("user_id", user.id);
  // Funnel step (written once per student; a repeat hits the unique index and is ignored). No personal data in props.
  await admin.from("events").insert({ name: "channel_connected", user_id: user.id, props: { channel: "whatsapp" } });

  return NextResponse.json({ status: "verified" });
}
