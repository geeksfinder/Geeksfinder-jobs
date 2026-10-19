/**
 * Plans — the single source for names, prices and billing periods (user's choice, 19 Oct 2026):
 * one paid plan, Hustle, billed every 15 days or monthly, with an optional WhatsApp alerts add-on.
 *   Hustle             ₹10 every 15 days · ₹20 a month
 *   Hustle + WhatsApp  ₹29 every 15 days · ₹59 a month
 * Features are the same in every paid plan apart from WhatsApp. users.plan is "pro", or "pro_wa" with WhatsApp.
 * The amount actually charged is set on the Razorpay plan (env RAZORPAY_PLAN_ID_*); the client only sends a plan code.
 */
export type Period = "15d" | "30d";
export type PaidPlan = "pro_15" | "pro_30" | "pro_wa_15" | "pro_wa_30";
export const PAID_PLANS: PaidPlan[] = ["pro_15", "pro_30", "pro_wa_15", "pro_wa_30"];
export const PERIODS: Period[] = ["15d", "30d"];

export const FREE_PLAN = { name: "Fresher", price: 0 } as const;

type PlanInfo = {
  name: string;
  /** Rupees per debit */
  price: number;
  /** "every 15 days" */
  every: string;
  period: Period;
  whatsapp: boolean;
  /** Approximate length of one billing period, for fallbacks when Razorpay doesn't send current_end */
  days: number;
  /** Razorpay subscription total_count (~5 years) */
  totalCount: number;
};

export const PLANS: Record<PaidPlan, PlanInfo> = {
  pro_15: { name: "Hustle", price: 10, every: "every 15 days", period: "15d", whatsapp: false, days: 15, totalCount: 120 },
  pro_30: { name: "Hustle", price: 20, every: "a month", period: "30d", whatsapp: false, days: 30, totalCount: 60 },
  pro_wa_15: { name: "Hustle + WhatsApp", price: 29, every: "every 15 days", period: "15d", whatsapp: true, days: 15, totalCount: 120 },
  pro_wa_30: { name: "Hustle + WhatsApp", price: 59, every: "a month", period: "30d", whatsapp: true, days: 30, totalCount: 60 },
};

export const PERIOD_LABEL: Record<Period, string> = { "15d": "Every 15 days", "30d": "Monthly" };

export const DEFAULT_PLAN: PaidPlan = "pro_15";
export const isPaidPlan = (v: unknown): v is PaidPlan => typeof v === "string" && (PAID_PLANS as string[]).includes(v);

/** Plan code for a period and the WhatsApp tick. */
export const planCode = (period: Period, whatsapp: boolean): PaidPlan => `${whatsapp ? "pro_wa" : "pro"}_${period === "15d" ? "15" : "30"}` as PaidPlan;

/** What users.plan becomes when this plan is paid for. */
export const planTier = (code: PaidPlan): "pro" | "pro_wa" => (PLANS[code].whatsapp ? "pro_wa" : "pro");

/** "+₹19" — what the WhatsApp tick adds for a period. */
export const whatsappExtra = (period: Period) => PLANS[planCode(period, true)].price - PLANS[planCode(period, false)].price;

/** Razorpay plan id for a plan code. The ₹10 plan falls back to the earlier RAZORPAY_PLAN_ID_HUSTLE / RAZORPAY_PLAN_ID (same price). */
export function razorpayPlanId(plan: PaidPlan): string | undefined {
  const env = {
    pro_15: process.env.RAZORPAY_PLAN_ID_PRO_15 ?? process.env.RAZORPAY_PLAN_ID_HUSTLE ?? process.env.RAZORPAY_PLAN_ID,
    pro_30: process.env.RAZORPAY_PLAN_ID_PRO_30,
    pro_wa_15: process.env.RAZORPAY_PLAN_ID_PRO_WA_15,
    pro_wa_30: process.env.RAZORPAY_PLAN_ID_PRO_WA_30,
  };
  return env[plan] || undefined;
}

/** Reverse lookup used by the webhook: Razorpay's plan_id is the authority on what was bought. */
export function planFromRazorpayId(planId: string | undefined | null): PaidPlan | null {
  if (!planId) return null;
  return PAID_PLANS.find((p) => razorpayPlanId(p) === planId) ?? null;
}

/** "Hustle + WhatsApp" for a paid user, "Fresher" for free users. */
export function planName(plan: string | null | undefined, code?: string | null) {
  if (plan !== "pro" && plan !== "pro_wa") return FREE_PLAN.name;
  if (isPaidPlan(code)) return PLANS[code].name;
  return plan === "pro_wa" ? "Hustle + WhatsApp" : "Hustle";
}

/** Feature tier for quotas and screens: both paid tiers unlock Hustle features. */
export const featureTier = (plan: string | null | undefined): "free" | "pro" => (plan === "pro" || plan === "pro_wa" ? "pro" : "free");

/** Short line for upsells: "from ₹10 every 15 days" */
export const FROM_PRICE = `from ₹${PLANS.pro_15.price} ${PLANS.pro_15.every}`;
