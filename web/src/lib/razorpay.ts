import { createHmac, timingSafeEqual } from "crypto";

/** Env values pasted into a dashboard often carry a stray space, line break or quotes; any of them breaks auth. */
export const envValue = (v: string | undefined) => (v ?? "").trim().replace(/^["']|["']$/g, "").trim();

const auth = () => "Basic " + Buffer.from(`${envValue(process.env.RAZORPAY_KEY_ID)}:${envValue(process.env.RAZORPAY_KEY_SECRET)}`).toString("base64");

export async function rzp<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: auth(), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.description ?? `Razorpay ${res.status}`);
  return data as T;
}

export function verifyWebhook(raw: string, signature: string | null) {
  const secret = envValue(process.env.RAZORPAY_WEBHOOK_SECRET);
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type PaymentsCheck = { label: string; ok: boolean; detail: string };

/**
 * Owner-only setup check for Admin → System: is the key live, does it authenticate, does each plan id exist in that
 * account, is the webhook secret set? Read-only calls; never returns a secret.
 */
export async function paymentsSetupCheck(planIds: { label: string; id: string | undefined }[]): Promise<PaymentsCheck[]> {
  const keyId = envValue(process.env.RAZORPAY_KEY_ID);
  const out: PaymentsCheck[] = [];
  if (!keyId || !envValue(process.env.RAZORPAY_KEY_SECRET)) return [{ label: "Razorpay key", ok: false, detail: "RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing." }];
  out.push({
    label: "Key type",
    ok: keyId.startsWith("rzp_live_"),
    detail: keyId.startsWith("rzp_live_") ? "Live key (real payments)." : keyId.startsWith("rzp_test_") ? "Test key: live plans won't work with it. Use the rzp_live_ key." : "Doesn't look like a Razorpay key id.",
  });
  try {
    await rzp("/plans?count=1");
    out.push({ label: "Key and secret", ok: true, detail: "Razorpay accepted them." });
  } catch (e) {
    out.push({ label: "Key and secret", ok: false, detail: `Razorpay refused them (${(e as Error).message}). Copy the key id and secret from the same popup.` });
    return out;
  }
  for (const p of planIds) {
    if (!p.id) { out.push({ label: p.label, ok: false, detail: "Plan id not set." }); continue; }
    try {
      const plan = await rzp<{ item: { amount: number }; period: string; interval: number }>(`/plans/${encodeURIComponent(p.id)}`);
      out.push({ label: p.label, ok: true, detail: `${p.id}: ₹${plan.item.amount / 100} every ${plan.interval} ${plan.period}` });
    } catch (e) {
      out.push({ label: p.label, ok: false, detail: `${p.id} not found in this account (${(e as Error).message}).` });
    }
  }
  out.push({ label: "Webhook secret", ok: !!envValue(process.env.RAZORPAY_WEBHOOK_SECRET), detail: envValue(process.env.RAZORPAY_WEBHOOK_SECRET) ? "Set. Payments will update students' plans." : "Missing: students would pay but stay on the free plan." });
  return out;
}
