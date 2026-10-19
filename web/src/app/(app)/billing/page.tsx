import { LIMITS, periodStart } from "@/lib/plan";
import { isPaidPlan, PLANS, planName, featureTier } from "@/lib/pricing";
import { longDate, shortDate } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import { whatsappOnSale } from "@/lib/whatsapp/on-sale";
import { BillingActions } from "./BillingActions";

export const metadata = { title: "Billing" };

export default async function Billing({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { supabase, user } = await requireUser();
  const { plan: wanted } = await searchParams;
  const [{ data: u }, { data: sub }, { data: payments }] = await Promise.all([
    supabase.from("users").select("plan").eq("id", user!.id).single(),
    supabase.from("subscriptions").select("*").eq("user_id", user!.id).maybeSingle(),
    supabase.from("payments").select("id, amount, status, paid_at").eq("user_id", user!.id).order("paid_at", { ascending: false }).limit(12),
  ]);
  const plan = featureTier(u?.plan);
  const { data: usage } = await supabase.from("usage").select("tailor_count, finder_count").eq("user_id", user!.id).eq("period_start", periodStart(plan, sub?.current_period_end)).maybeSingle();
  const active = !!sub?.status && ["authenticated", "active", "pending"].includes(sub.status);
  const inTrial = !!sub?.trial_end && new Date(sub.trial_end) > new Date();
  const nextDebit = inTrial ? sub?.trial_end : sub?.current_period_end;
  const code: unknown = sub?.plan_code;
  const bought = isPaidPlan(code) ? PLANS[code] : PLANS.pro_15;

  return (
    <>
      <h1 className="text-h1 font-bold md:text-h1-lg">Billing</h1>

      <section className="mt-6 panel p-5 md:p-6">
        <p className="text-small text-ink-2">Current plan</p>
        <p className="text-h2 font-semibold">{planName(u?.plan, sub?.plan_code)}{isPaidPlan(code) && plan === "pro" ? ` · ₹${bought.price} ${bought.every}` : ""}{plan === "pro" && inTrial && active ? " · free trial" : ""}</p>
        {active && nextDebit && (
          <p className="mt-4 text-h3 font-semibold md:text-h2">
            Next debit <span className="tabular">₹{bought.price}</span> on {shortDate(nextDebit)}
          </p>
        )}
        {sub?.status === "pending" && <p className="mt-2 text-body text-warning">Your last debit didn&apos;t go through. Keep ₹{bought.price} in your UPI-linked account — we retry automatically.</p>}
        {sub?.status === "cancelled" && sub.current_period_end && new Date(sub.current_period_end) > new Date() && (
          <p className="mt-2 text-body text-ink-2">Cancelled. Your plan stays active until {longDate(sub.current_period_end)}.</p>
        )}
        <p className="mt-4 text-small text-ink-2">
          Tailored resumes used: <span className="tabular">{usage?.tailor_count ?? 0} of {LIMITS[plan].tailor}</span>
          {plan === "pro" ? " this 15-day cycle" : ""}
          {plan === "pro" && <> · HR lookups: <span className="tabular">{usage?.finder_count ?? 0} of {LIMITS.pro.finder}</span></>}
        </p>
      </section>

      <BillingActions active={active} initialPlan={isPaidPlan(wanted) ? wanted : undefined} whatsappOnSale={whatsappOnSale()} />

      {active && (
        <section className="mt-10">
          <h2 className="text-h3 font-semibold">How to cancel</h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-body text-ink-2">
            <li>Open the UPI app you used (GPay, PhonePe, Paytm or your bank app).</li>
            <li>Go to Autopay, Mandates or Subscriptions.</li>
            <li>Pick GeeksFinder (shown via Razorpay) and tap Cancel or Revoke.</li>
          </ol>
          <p className="mt-2 text-body text-ink-2">Or use the Cancel subscription button above. Either way, your plan stays on until the end of the period you paid for.</p>
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-3 text-h3 font-semibold">Payment history</h2>
        {payments?.length ? (
          <div className="panel overflow-x-auto">
            <table className="w-full text-left text-small">
              <thead className="border-b border-line text-ink-2">
                <tr><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Amount</th><th className="px-4 py-3 font-medium">Status</th></tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">{longDate(p.paid_at)}</td>
                    <td className="tabular px-4 py-3">₹{((p.amount ?? 0) / 100).toFixed(0)}</td>
                    <td className={`px-4 py-3 ${p.status === "captured" ? "text-success" : "text-ink-2"}`}>{p.status === "captured" ? "Paid" : p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-body text-ink-2">No payments yet.</p>
        )}
      </section>
    </>
  );
}
