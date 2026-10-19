import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta webhook helpers (SPEC.md §3 Webhook). The signature is checked on the raw body, in constant time, before
 * anything in the request is read.
 */
export function verifySignature(rawBody: string, header: string | null, secret: string | undefined): boolean {
  if (!header || !secret || !header.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  let given: Buffer;
  try {
    given = Buffer.from(header.slice(7), "hex");
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** wa_inbound stores only a hash of the sender's number. */
export const phoneHash = (e164: string) => createHash("sha256").update(e164).digest("hex");

/** STOP, UNSUBSCRIBE or CANCEL in any case opts out; START opts back in. Anything else is ordinary text. */
export function keywordOf(text: string | undefined): "stop" | "start" | null {
  const t = (text ?? "").trim().toLowerCase().replace(/[.!]+$/, "");
  if (t === "stop" || t === "unsubscribe" || t === "cancel") return "stop";
  if (t === "start") return "start";
  return null;
}

export type WaStatus = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp?: string;
  errors?: { code?: number }[];
  pricing?: { billable?: boolean; category?: string };
};
export type WaInbound = { from: string; id: string; type: string; text?: { body?: string } };
export type WaPayload = { entry?: { changes?: { value?: { statuses?: WaStatus[]; messages?: WaInbound[] } }[] }[] };

export function events(payload: WaPayload) {
  const statuses: WaStatus[] = [];
  const messages: WaInbound[] = [];
  for (const e of payload.entry ?? []) {
    for (const c of e.changes ?? []) {
      statuses.push(...(c.value?.statuses ?? []));
      messages.push(...(c.value?.messages ?? []));
    }
  }
  return { statuses, messages };
}

// A late "delivered" must not overwrite "read"
const ORDER = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 3 } as const;
export const isNewer = (current: string, next: string) => (ORDER[next as keyof typeof ORDER] ?? 0) > (ORDER[current as keyof typeof ORDER] ?? 0);
