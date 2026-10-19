import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getFlag } from "../admin/flags";
import { canSpend } from "../admin/spend";
import { adminClient } from "../supabase/admin";
import { maskPhone } from "./phone";
import { FIXED_REPLIES, type FixedReply, type TemplateMessage } from "./templates";

/**
 * The only code allowed to call graph.facebook.com (SPEC.md §1; CI fails if anything else does).
 * The token lives only in server env vars. Before every send it checks the whatsapp_sends switch (fail closed) and
 * the monthly spend cap. It can send templates, or one of the fixed replies; there is no free-form text.
 */
const GRAPH = () => `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || "v23.0"}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
const LANG = () => process.env.WHATSAPP_TEMPLATE_LANG || "en";

export type SendResult = { ok: true; messageId: string } | { ok: false; reason: "not_configured" | "switch_off" | "cap" | "api_error"; errorCode?: string };

async function guard(db: SupabaseClient): Promise<SendResult | null> {
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) return { ok: false, reason: "not_configured" };
  if (!(await getFlag("whatsapp_sends", db))) return { ok: false, reason: "switch_off" };
  if (!(await canSpend("whatsapp", db)).ok) return { ok: false, reason: "cap" };
  return null;
}

async function post(payload: Record<string, unknown>, to: string): Promise<SendResult> {
  try {
    const res = await fetch(GRAPH(), {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: to.replace(/^\+/, ""), ...payload }),
      signal: AbortSignal.timeout(4000),
    });
    const data = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { code?: number; error_subcode?: number } };
    const id = data.messages?.[0]?.id;
    if (res.ok && id) return { ok: true, messageId: id };
    const code = String(data.error?.code ?? res.status);
    // Never log the number or the token: masked number and Meta's error code only
    console.warn(`[whatsapp] send to ${maskPhone(to)} failed: ${code}`);
    return { ok: false, reason: "api_error", errorCode: code };
  } catch {
    console.warn(`[whatsapp] send to ${maskPhone(to)} timed out`);
    return { ok: false, reason: "api_error", errorCode: "timeout" };
  }
}

/** Send an approved template. Body and button parameters must already be cleaned (templates.ts). */
export async function sendTemplate(to: string, msg: TemplateMessage, db: SupabaseClient = adminClient()): Promise<SendResult> {
  const blocked = await guard(db);
  if (blocked) return blocked;
  const components: Record<string, unknown>[] = [{ type: "body", parameters: msg.body.map((text) => ({ type: "text", text })) }];
  msg.buttons.forEach((text, index) => {
    // Authentication templates use a URL-style "copy code" button; digests use URL buttons into GeeksFinder
    components.push({ type: "button", sub_type: "url", index: String(index), parameters: [{ type: "text", text }] });
  });
  return post({ type: "template", template: { name: msg.template, language: { code: LANG() }, components } }, to);
}

/** One of the fixed replies (STOP confirmation, START confirmation, the once-a-day auto-reply). */
export async function sendFixedReply(to: string, kind: FixedReply, db: SupabaseClient = adminClient()): Promise<SendResult> {
  const blocked = await guard(db);
  if (blocked) return blocked;
  return post({ type: "text", text: { preview_url: false, body: FIXED_REPLIES[kind] } }, to);
}
