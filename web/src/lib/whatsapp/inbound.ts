import type { SupabaseClient } from "@supabase/supabase-js";
import { sendFixedReply } from "./client";
import { isCategory, istDay, messageCost } from "./cost";
import { planAllowsWhatsApp } from "./eligibility";
import type { FixedReply } from "./templates";
import { isNewer, keywordOf, phoneHash, type WaInbound, type WaStatus } from "./webhook";

/** Webhook event handling (SPEC.md §3 Webhook), called only after the signature check in the route. */
const PAUSE_AFTER_FAILURES = 3;
const DAY_MS = 86_400_000;

async function firstTime(db: SupabaseClient, id: string) {
  const { error } = await db.from("webhook_events").insert({ id, provider: "whatsapp" });
  return !error; // a duplicate id means this event was already handled
}

export async function handleStatus(db: SupabaseClient, s: WaStatus) {
  if (!s.id || !s.status || !(await firstTime(db, `wa:${s.id}:${s.status}`))) return;
  const { data: msg } = await db.from("wa_messages").select("id, user_id, status, category").eq("meta_message_id", s.id).maybeSingle();
  if (!msg) return;

  const category = isCategory(s.pricing?.category) ? s.pricing.category : (msg.category as string | null);
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (isNewer(msg.status, s.status)) update.status = s.status;
  if (s.status === "failed") update.error_code = String(s.errors?.[0]?.code ?? "unknown");
  if (s.pricing) {
    update.billable = s.pricing.billable !== false;
    if (isCategory(category)) {
      update.category = category;
      // Recompute from the rate card with Meta's billed category
      update.cost_inr = await messageCost(db, category, s.pricing.billable !== false).catch(() => undefined);
    }
  }
  await db.from("wa_messages").update(update).eq("id", msg.id);

  if (!msg.user_id) return;
  if (s.status === "delivered" || s.status === "read") {
    await db.from("whatsapp_contacts").update({ fail_streak: 0 }).eq("user_id", msg.user_id);
  } else if (s.status === "failed") {
    const { data: c } = await db.from("whatsapp_contacts").select("fail_streak").eq("user_id", msg.user_id).maybeSingle();
    const streak = (c?.fail_streak ?? 0) + 1;
    // W2.4: three failed deliveries in a row pause WhatsApp for this student
    await db.from("whatsapp_contacts").update({ fail_streak: streak, ...(streak >= PAUSE_AFTER_FAILURES ? { paused: true } : {}), updated_at: new Date().toISOString() }).eq("user_id", msg.user_id);
  }
}

async function reply(db: SupabaseClient, to: string, userId: string | null, kind: FixedReply) {
  const sent = await sendFixedReply(to, kind, db);
  await db.from("wa_messages").insert({
    user_id: userId,
    // STOP and START confirmations are both logged as keyword confirmations
    kind: kind === "auto_reply" ? "auto_reply" : "stop_confirm",
    send_date: istDay(),
    meta_message_id: sent.ok ? sent.messageId : null,
    status: sent.ok ? "sent" : "failed",
    category: "service",
    error_code: sent.ok ? null : (sent.errorCode ?? sent.reason),
  });
}

export async function handleInbound(db: SupabaseClient, m: WaInbound) {
  if (!m.id || !m.from) return;
  const e164 = `+${m.from.replace(/\D/g, "")}`;
  const { data: contact } = await db.from("whatsapp_contacts").select("user_id, opted_out_at, last_auto_reply_at").eq("phone_e164", e164).eq("status", "verified").maybeSingle();
  const text = m.type === "text" ? m.text?.body?.trim().slice(0, 1000) : undefined;
  const keyword = keywordOf(text);

  // The unique meta_message_id makes a repeated delivery of the same message a no-op
  const { error } = await db.from("wa_inbound").insert({ user_id: contact?.user_id ?? null, phone_hash: phoneHash(e164), body: text ?? null, keyword, meta_message_id: m.id });
  if (error) return;
  // Unknown numbers get no reply: nobody can make us message a number that never verified
  if (!contact) return;
  const now = new Date().toISOString();

  if (keyword === "stop") {
    await db.from("whatsapp_contacts").update({ opted_out_at: now, updated_at: now }).eq("user_id", contact.user_id);
    if (!contact.opted_out_at) await reply(db, e164, contact.user_id, "stop_confirm");
    return;
  }
  if (keyword === "start") {
    if (contact.opted_out_at && (await planAllowsWhatsApp(db, contact.user_id))) {
      await db.from("whatsapp_contacts").update({ opted_out_at: null, updated_at: now }).eq("user_id", contact.user_id);
      await reply(db, e164, contact.user_id, "start_confirm");
    }
    return;
  }
  // Any other message: one fixed reply at most once every 24 hours
  if (!contact.last_auto_reply_at || Date.now() - Date.parse(contact.last_auto_reply_at) > DAY_MS) {
    await db.from("whatsapp_contacts").update({ last_auto_reply_at: now }).eq("user_id", contact.user_id);
    await reply(db, e164, contact.user_id, "auto_reply");
  }
}
