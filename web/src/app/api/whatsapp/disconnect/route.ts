import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { apiError } from "@/lib/security";
import { adminClient, requireUser } from "@/lib/supabase/server";

/** Turn WhatsApp off for the signed-in student: forget the number and take WhatsApp out of their alert channels. */
export async function POST() {
  const { user } = await requireUser();
  if (!user) return apiError(401, "unauthorized", "Please sign in again.");
  const rl = await rateLimit("api", user.id);
  if (!rl.ok) return apiError(429, "rate_limited", "Too many requests. Wait a minute and try again.");

  const admin = adminClient();
  await admin.from("whatsapp_contacts").delete().eq("user_id", user.id);
  await admin.from("whatsapp_otps").delete().eq("user_id", user.id);
  const { data: s } = await admin.from("alert_settings").select("channels").eq("user_id", user.id).maybeSingle();
  const channels = ((s?.channels ?? []) as string[]).filter((c) => c !== "whatsapp");
  await admin.from("alert_settings").update({ channels }).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
