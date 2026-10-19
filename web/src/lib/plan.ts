import type { SupabaseClient } from "@supabase/supabase-js";
import { effectivePlan, tier } from "./entitlement";

export const LIMITS = {
  free: { tailor: 1, finder: 0, frequencies: ["weekly", "monthly"] as string[] },
  pro: { tailor: 10, finder: 30, frequencies: ["daily", "weekly", "monthly"] as string[] },
};

const CYCLE = 15 * 86_400_000;

/**
 * Quotas reset every 15 days on every paid plan. Windows are counted back from the billing period end,
 * so the 15-day plan's window is its whole period and the monthly plan gets a fresh window every 15 days inside its month.
 * Free users get a lifetime count.
 */
export function periodStart(plan: "free" | "pro", periodEnd?: string | null, now = Date.now()) {
  if (plan === "free") return "2000-01-01";
  const end = periodEnd ? new Date(periodEnd).getTime() : now + CYCLE;
  const windowsLeft = Math.max(1, Math.ceil((end - now) / CYCLE));
  return new Date(end - windowsLeft * CYCLE).toISOString().slice(0, 10);
}

/** Plan is read only from the DB (never from the request): the paid plan or an active Pro grant, whichever is higher. */
export async function getPlan(admin: SupabaseClient, userId: string) {
  const [eff, { data: sub }] = await Promise.all([
    effectivePlan(admin, userId),
    admin.from("subscriptions").select("current_period_end").eq("user_id", userId).maybeSingle(),
  ]);
  const plan = tier(eff.plan);
  // A paid plan's window follows its billing period; a grant-only student's follows the grant's end date
  const periodEnd = eff.paidPlan === "free" ? eff.grantEndsAt : sub?.current_period_end;
  return { plan, period: periodStart(plan, periodEnd) };
}

/** Atomic check-and-increment via the consume_usage SQL function. */
export async function consume(
  admin: SupabaseClient,
  userId: string,
  kind: "tailor" | "finder",
): Promise<{ ok: boolean; used: number; limit: number }> {
  const { plan, period } = await getPlan(admin, userId);
  const limit = LIMITS[plan][kind];
  if (limit === 0) return { ok: false, used: 0, limit };
  const { data, error } = await admin.rpc("consume_usage", { p_user: userId, p_period: period, p_kind: kind, p_limit: limit });
  if (error) throw error;
  const n = data as number;
  return n < 0 ? { ok: false, used: limit, limit } : { ok: true, used: n, limit };
}
