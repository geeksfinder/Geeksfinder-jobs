import Link from "next/link";
import { AdminAction } from "@/components/admin/AdminAction";
import { Metric, MetricGrid } from "@/components/admin/Metric";
import { AdminTable, Th } from "@/components/admin/Table";
import { requireAdmin } from "@/lib/admin/auth";
import { AREA_ROLES } from "@/lib/admin/constants";
import { shortDate } from "@/lib/format";
import { PAID_PLANS, PLANS, isPaidPlan } from "@/lib/pricing";

export const dynamic = "force-dynamic";

type Sub = { user_id: string; status: string | null; plan_code: string | null; current_period_end: string | null; trial_end: string | null; created_at: string };

/** A11 Payments: plan mix, MRR, new and cancelled, failed debits, halted mandates, trials ending, webhook log. */
export default async function Payments() {
  const { admin, role } = await requireAdmin(AREA_ROLES.payments);
  const now = Date.now();
  const d30 = new Date(now - 30 * 86_400_000).toISOString();
  const t = (iso: string | null) => (iso ? Date.parse(iso) : NaN);
  const [{ data: subs }, { count: users }, { data: failed }, { data: hooks }] = await Promise.all([
    admin.from("subscriptions").select("user_id, status, plan_code, current_period_end, trial_end, created_at").limit(10000),
    admin.from("users").select("id", { count: "exact", head: true }),
    admin.from("payments").select("user_id, amount, paid_at").eq("status", "failed").gte("paid_at", d30).order("paid_at", { ascending: false }).limit(50),
    admin.from("webhook_events").select("id, provider, received_at").eq("provider", "razorpay").order("received_at", { ascending: false }).limit(50),
  ]);
  const all = (subs ?? []) as Sub[];
  const live = all.filter((s) => s.status === "active" || s.status === "authenticated");
  // Monthly equivalent of every active mandate, from the plan's price and period
  const mrr = live.filter((s) => s.status === "active").reduce((sum, s) => {
    const p = PLANS[isPaidPlan(s.plan_code) ? s.plan_code : "hustle"];
    return sum + (p.price * 30) / p.days;
  }, 0);
  const halted = all.filter((s) => s.status === "halted" || s.status === "pending");
  const notAuthorised = all.filter((s) => s.status === "created");
  const trialsEnding = live.filter((s) => t(s.trial_end) >= now && t(s.trial_end) <= now + 7 * 86_400_000);

  const ids = [...new Set([...halted, ...notAuthorised, ...trialsEnding].map((s) => s.user_id).concat((failed ?? []).map((f) => f.user_id)))];
  const { data: people } = ids.length ? await admin.from("users").select("id, name, email").in("id", ids) : { data: [] };
  const who = (id: string) => {
    const p = (people ?? []).find((x) => x.id === id);
    return <Link href={`/admin/users/${id}`} className="text-action underline-offset-4 hover:underline">{p?.name || p?.email || "Student"}</Link>;
  };
  const canRemind = (AREA_ROLES.remind as readonly string[]).includes(role);

  return (
    <>
      <h1 className="text-h1 font-bold">Payments</h1>
      <p className="mb-6 mt-1 text-body text-ink-2">From Razorpay webhooks. Amounts are what each plan charges; Razorpay is the source of truth for money received.</p>

      <MetricGrid cols={4}>
        <Metric label="Monthly recurring revenue" value={live.length ? `₹${Math.round(mrr).toLocaleString("en-IN")}` : null} empty="Appears after the first paid subscription." hint={live.length ? "Monthly equivalent of active mandates" : undefined} />
        <Metric label="Paid subscriptions" value={live.length} hint={`of ${users ?? 0} accounts`} />
        <Metric label="New in 30 days" value={all.filter((s) => t(s.created_at) >= now - 30 * 86_400_000).length} />
        <Metric label="Cancelled" value={all.filter((s) => s.status === "cancelled").length} hint="All time" />
      </MetricGrid>

      <h2 className="mb-3 mt-10 text-h3 font-semibold">Plan mix</h2>
      <dl className="panel grid grid-cols-2 divide-x divide-line sm:grid-cols-4">
        <div className="px-4 py-3"><dt className="text-small text-ink-2">Free</dt><dd className="tabular text-h3 font-semibold">{Math.max(0, (users ?? 0) - live.length)}</dd></div>
        {PAID_PLANS.map((p) => (
          <div key={p} className="px-4 py-3">
            <dt className="text-small text-ink-2">{PLANS[p].name} · ₹{PLANS[p].price} {PLANS[p].every}</dt>
            <dd className="tabular text-h3 font-semibold">{live.filter((s) => (isPaidPlan(s.plan_code) ? s.plan_code : "hustle") === p).length}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mb-3 mt-10 text-h3 font-semibold">Halted or pending debits</h2>
      <AdminTable head={<><Th>Student</Th><Th>Plan</Th><Th>Status</Th><Th /></>} empty={!halted.length && "No halted or pending debits."}>
        {halted.map((s) => (
          <tr key={s.user_id}>
            <td>{who(s.user_id)}</td>
            <td>{PLANS[isPaidPlan(s.plan_code) ? s.plan_code : "hustle"].name}</td>
            <td className="text-warning">{s.status}</td>
            <td className="text-right">{canRemind && <AdminAction action="/api/admin/payments/remind" label="Resend payment reminder" success="Reminder sent" variant="text" extra={{ user_id: s.user_id }} inline />}</td>
          </tr>
        ))}
      </AdminTable>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-h3 font-semibold">Failed debits, last 30 days</h2>
          <AdminTable head={<><Th>Student</Th><Th>Amount</Th><Th>When</Th></>} empty={!(failed ?? []).length && "No failed debits."}>
            {(failed ?? []).map((f, i) => (
              <tr key={i}><td>{who(f.user_id)}</td><td className="tabular">₹{Math.round((f.amount ?? 0) / 100)}</td><td className="tabular text-ink-2">{f.paid_at ? shortDate(f.paid_at) : "—"}</td></tr>
            ))}
          </AdminTable>
        </section>
        <section>
          <h2 className="mb-3 text-h3 font-semibold">Trials ending this week</h2>
          <AdminTable head={<><Th>Student</Th><Th>Plan</Th><Th>Trial ends</Th></>} empty={!trialsEnding.length && "No trials end this week."}>
            {trialsEnding.map((s) => (
              <tr key={s.user_id}><td>{who(s.user_id)}</td><td>{PLANS[isPaidPlan(s.plan_code) ? s.plan_code : "hustle"].name}</td><td className="tabular text-ink-2">{shortDate(s.trial_end!)}</td></tr>
            ))}
          </AdminTable>
        </section>
        <section>
          <h2 className="mb-3 text-h3 font-semibold">Mandates started, not authorised</h2>
          <AdminTable head={<><Th>Student</Th><Th>Plan</Th><Th>Started</Th></>} empty={!notAuthorised.length && "None waiting."}>
            {notAuthorised.map((s) => (
              <tr key={s.user_id}><td>{who(s.user_id)}</td><td>{PLANS[isPaidPlan(s.plan_code) ? s.plan_code : "hustle"].name}</td><td className="tabular text-ink-2">{shortDate(s.created_at)}</td></tr>
            ))}
          </AdminTable>
        </section>
        <section>
          <h2 className="mb-3 text-h3 font-semibold">Razorpay webhook log</h2>
          <AdminTable head={<><Th>Event id</Th><Th>Received</Th></>} empty={!(hooks ?? []).length && "No webhooks received yet. They appear after the first checkout."}>
            {(hooks ?? []).map((h) => (
              <tr key={h.id}><td className="tabular text-tiny">{h.id}</td><td className="tabular text-ink-2">{new Date(h.received_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td></tr>
            ))}
          </AdminTable>
        </section>
      </div>
    </>
  );
}
