import type { SupabaseClient } from "@supabase/supabase-js";
import { getFlag } from "../admin/flags";
import { canSpend } from "../admin/spend";
import { effectivePlan } from "../entitlement";

/**
 * canSendWhatsApp: every condition from SPEC.md §1 must hold — plan entitles WhatsApp, number verified, consent
 * recorded, not opted out, not paused, the whatsapp_sends switch on, and this month's spend under its cap.
 * client.ts checks the switch and cap again right before each send.
 */
export type WaContact = { status: string; consent_at: string | null; opted_out_at: string | null; paused: boolean } | null;
export type Blocker = "plan" | "not_verified" | "no_consent" | "opted_out" | "paused" | "switch_off" | "cap";

export function whatsappBlocker(input: { planAllows: boolean; contact: WaContact; switchOn: boolean; underCap: boolean }): Blocker | null {
  if (!input.planAllows) return "plan";
  const c = input.contact;
  if (!c || c.status !== "verified") return "not_verified";
  if (!c.consent_at) return "no_consent";
  if (c.opted_out_at) return "opted_out";
  if (c.paused) return "paused";
  if (!input.switchOn) return "switch_off";
  if (!input.underCap) return "cap";
  return null;
}

/** Whether the student's effective plan includes WhatsApp, read from plan_limits (W4.4). */
export async function planAllowsWhatsApp(db: SupabaseClient, userId: string): Promise<boolean> {
  const { plan } = await effectivePlan(db, userId);
  const { data } = await db.from("plan_limits").select("whatsapp").eq("plan", plan).maybeSingle();
  return data?.whatsapp === true;
}

export async function canSendWhatsApp(db: SupabaseClient, userId: string): Promise<{ ok: boolean; blocker: Blocker | null }> {
  const [planAllows, { data: contact }] = await Promise.all([
    planAllowsWhatsApp(db, userId),
    db.from("whatsapp_contacts").select("status, consent_at, opted_out_at, paused").eq("user_id", userId).maybeSingle(),
  ]);
  // Plan and contact first: the switch and cap cost database reads and only matter for someone we would message
  const early = whatsappBlocker({ planAllows, contact: contact as WaContact, switchOn: true, underCap: true });
  if (early) return { ok: false, blocker: early };
  const [switchOn, cap] = await Promise.all([getFlag("whatsapp_sends", db), canSpend("whatsapp", db)]);
  const blocker = whatsappBlocker({ planAllows, contact: contact as WaContact, switchOn, underCap: cap.ok });
  return { ok: !blocker, blocker };
}
