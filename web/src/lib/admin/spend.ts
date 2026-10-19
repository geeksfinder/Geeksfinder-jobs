import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "../supabase/admin";
import { adminAlert } from "./alerts";
import type { SpendProvider } from "./constants";

export { SPEND_PROVIDERS, type SpendProvider } from "./constants";

/**
 * Monthly spend caps in ₹ per provider (SPEC.md §5). At the alert % the owner gets one Telegram message;
 * at 100% the provider's sends stop until the cap is raised or the month ends. Enforced by the code that
 * spends (canSpend before each batch), not only shown in the admin panel.
 */

// Providers that cost money per message: no cap row means no sending (SPEC.md §6 notes)
const NEEDS_CAP: ReadonlySet<SpendProvider> = new Set(["whatsapp"]);
const USD_INR = () => Number(process.env.USD_INR_RATE ?? 88);

/** First day of the current month in IST, as YYYY-MM-DD. */
export function monthStartIST(now = Date.now()) {
  const ist = new Date(now + 5.5 * 3_600_000);
  return `${ist.toISOString().slice(0, 7)}-01`;
}

/** Spend so far this month in ₹. Hunter and Apollo are on free plans: nothing is billed per lookup yet. */
export async function monthSpend(provider: SpendProvider, db: SupabaseClient = adminClient(), now = Date.now()): Promise<number> {
  const from = monthStartIST(now);
  if (provider === "whatsapp") {
    const { data, error } = await db.from("wa_messages").select("cost_inr").gte("send_date", from);
    if (error) throw new Error(`whatsapp spend: ${error.message}`);
    return (data ?? []).reduce((s, r) => s + Number(r.cost_inr ?? 0), 0);
  }
  if (provider === "anthropic") {
    const { data, error } = await db.from("ai_usage").select("est_cost_usd").eq("provider", "anthropic").gte("day", from);
    if (error) throw new Error(`anthropic spend: ${error.message}`);
    return (data ?? []).reduce((s, r) => s + Number(r.est_cost_usd ?? 0), 0) * USD_INR();
  }
  return 0;
}

export type CapRow = { monthly_cap_inr: number; alert_pct: number; alerted_at: string | null; stopped_at: string | null };

/** Pure decision: may we spend, and should the owner be told now? Alerts already sent this month aren't repeated. */
export function spendDecision(spent: number, cap: CapRow | null, needsCap: boolean, monthStart: string) {
  if (!cap) return { ok: !needsCap, notify: null as null | "alert" | "stop" };
  const thisMonth = (t: string | null) => !!t && Date.parse(t) >= Date.parse(monthStart);
  const capInr = Number(cap.monthly_cap_inr);
  if (spent >= capInr) return { ok: false, notify: thisMonth(cap.stopped_at) ? null : ("stop" as const) };
  if (spent >= (capInr * cap.alert_pct) / 100) return { ok: true, notify: thisMonth(cap.alerted_at) ? null : ("alert" as const) };
  return { ok: true, notify: null };
}

/** Call before each paid batch. Fails closed for providers that need a cap when spend can't be read. */
export async function canSpend(provider: SpendProvider, db: SupabaseClient = adminClient(), now = Date.now()) {
  const needsCap = NEEDS_CAP.has(provider);
  const { data: cap, error } = await db.from("spend_caps").select("monthly_cap_inr, alert_pct, alerted_at, stopped_at").eq("provider", provider).maybeSingle();
  if (error) return { ok: !needsCap, spent: 0, cap: null };
  let spent: number;
  try {
    spent = await monthSpend(provider, db, now);
  } catch (e) {
    console.warn(`[spend] ${(e as Error).message}`);
    return { ok: !needsCap, spent: 0, cap: (cap as CapRow | null)?.monthly_cap_inr ?? null };
  }
  const monthStart = new Date(`${monthStartIST(now)}T00:00:00+05:30`).toISOString();
  const d = spendDecision(spent, cap as CapRow | null, needsCap, monthStart);
  if (d.notify && cap) {
    const stamp = new Date(now).toISOString();
    await db.from("spend_caps").update(d.notify === "stop" ? { stopped_at: stamp } : { alerted_at: stamp }).eq("provider", provider);
    const rupees = (n: number) => `₹${n.toFixed(2)}`;
    await adminAlert(
      d.notify === "stop"
        ? `${provider} spend reached its cap: ${rupees(spent)} of ${rupees(Number(cap.monthly_cap_inr))} this month. Sends are stopped until you raise the cap or the month ends.`
        : `${provider} spend is at ${Math.round((spent / Number(cap.monthly_cap_inr)) * 100)}% of its cap: ${rupees(spent)} of ${rupees(Number(cap.monthly_cap_inr))} this month.`,
      db,
    );
  }
  return { ok: d.ok, spent, cap: cap ? Number(cap.monthly_cap_inr) : null };
}
