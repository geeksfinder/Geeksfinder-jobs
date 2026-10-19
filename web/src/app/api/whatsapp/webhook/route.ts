import { NextResponse } from "next/server";
import { adminAlert } from "@/lib/admin/alerts";
import { rateLimit } from "@/lib/ratelimit";
import { log } from "@/lib/security";
import { adminClient } from "@/lib/supabase/admin";
import { handleInbound, handleStatus } from "@/lib/whatsapp/inbound";
import { events, verifySignature, type WaPayload } from "@/lib/whatsapp/webhook";

let alertedAt = 0;

/** Meta's subscription check: echo hub.challenge only when the verify token matches. */
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (expected && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === expected) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * Statuses and inbound messages (SPEC.md §3 Webhook). The signature is checked on the raw body before anything is
 * read; a forged call gets 401 and changes nothing. Every event is processed once, keyed by Meta's message id.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET)) {
    // More than 10 forged calls in an hour tells the owner (at most once an hour per server instance)
    const rl = await rateLimit("waSigFail", "global");
    if (!rl.ok && Date.now() - alertedAt > 3_600_000) {
      alertedAt = Date.now();
      await adminAlert("More than 10 WhatsApp webhook calls with a bad signature in the last hour. Someone may be probing the endpoint.").catch(() => {});
    }
    return NextResponse.json({ error: { code: "bad_signature", message: "Invalid signature." } }, { status: 401 });
  }

  let payload: WaPayload;
  try {
    payload = JSON.parse(raw) as WaPayload;
  } catch {
    return NextResponse.json({ ok: true }); // signed but empty or malformed: nothing to do
  }
  const db = adminClient();
  const { statuses, messages } = events(payload);
  try {
    for (const s of statuses) await handleStatus(db, s);
    for (const m of messages) await handleInbound(db, m);
  } catch (e) {
    // Meta retries on non-200; everything above is idempotent, but log and still answer 200 to avoid a retry storm
    log.error("whatsapp.webhook", e);
  }
  return NextResponse.json({ ok: true });
}
