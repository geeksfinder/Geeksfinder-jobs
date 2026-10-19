import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A student's effective plan is the highest of their paid plan (users.plan, set only by the Razorpay webhook)
 * and any active pro_grants row (SPEC.md §3 Billing). Grants never include WhatsApp unless an owner ticked it.
 */
export type EffectivePlan = "free" | "pro" | "pro_wa";
const RANK: Record<EffectivePlan, number> = { free: 0, pro: 1, pro_wa: 2 };

export type Grant = { starts_at: string; ends_at: string; includes_whatsapp: boolean };

export function activeGrants<G extends Grant>(grants: G[], now = Date.now()) {
  return grants.filter((g) => Date.parse(g.starts_at) <= now && Date.parse(g.ends_at) > now);
}

export function resolvePlan(userPlan: string | null | undefined, grants: Grant[], now = Date.now()): EffectivePlan {
  let best: EffectivePlan = userPlan === "pro" || userPlan === "pro_wa" ? userPlan : "free";
  for (const g of activeGrants(grants, now)) {
    const p: EffectivePlan = g.includes_whatsapp ? "pro_wa" : "pro";
    if (RANK[p] > RANK[best]) best = p;
  }
  return best;
}

/** Feature tier for quotas and alerts: both paid plans unlock the same Pro features. */
export const tier = (p: EffectivePlan): "free" | "pro" => (p === "free" ? "free" : "pro");

export async function effectivePlan(db: SupabaseClient, userId: string, now = Date.now()) {
  const [{ data: u }, { data: grants }] = await Promise.all([
    db.from("users").select("plan").eq("id", userId).single(),
    db.from("pro_grants").select("starts_at, ends_at, includes_whatsapp").eq("user_id", userId).gt("ends_at", new Date(now).toISOString()),
  ]);
  const list = (grants ?? []) as Grant[];
  const active = activeGrants(list, now);
  return {
    plan: resolvePlan(u?.plan as string | null, list, now),
    paidPlan: (u?.plan as string | null) ?? "free",
    // Latest end of an active grant: the quota window for students on a grant without a subscription
    grantEndsAt: active.length ? active.map((g) => g.ends_at).sort().at(-1)! : null,
  };
}
