/**
 * One-off: create the four Razorpay plans and print the env lines to paste into Vercel and .env.local.
 *   npx tsx --env-file=.env.local scripts/razorpay-plans.ts
 * Prices come from lib/pricing.ts. A UPI Autopay amount can't be raised later, so check them before running.
 */
import { PAID_PLANS, PLANS } from "@/lib/pricing";
import { rzp } from "@/lib/razorpay";

const ENV: Record<string, string> = { pro_15: "RAZORPAY_PLAN_ID_PRO_15", pro_30: "RAZORPAY_PLAN_ID_PRO_30", pro_wa_15: "RAZORPAY_PLAN_ID_PRO_WA_15", pro_wa_30: "RAZORPAY_PLAN_ID_PRO_WA_30" };

async function main() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) throw new Error("Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET first");
  const lines: string[] = [];
  for (const code of PAID_PLANS) {
    const p = PLANS[code];
    const plan = await rzp<{ id: string }>("/plans", {
      // 15-day plans bill every 15 days; monthly plans once a month
      period: p.period === "15d" ? "daily" : "monthly",
      interval: p.period === "15d" ? 15 : 1,
      item: { name: `GeeksFinder ${p.name}`, amount: p.price * 100, currency: "INR", description: `₹${p.price} ${p.every}` },
      notes: { plan_code: code },
    });
    lines.push(`${ENV[code]}=${plan.id}`);
    console.log(`created ${p.name} ₹${p.price} ${p.every} → ${plan.id}`);
  }
  console.log(`\nAdd these to Vercel (Production) and web/.env.local:\n${lines.join("\n")}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
