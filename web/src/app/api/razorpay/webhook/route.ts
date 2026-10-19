import { NextResponse } from "next/server";
import { getFlag } from "@/lib/admin/flags";
import { adminClient } from "@/lib/supabase/admin";
import { verifyWebhook } from "@/lib/razorpay";
import { sendTelegram } from "@/lib/telegram";
import { sendEmail } from "@/lib/email";
import { PLANS, planFromRazorpayId, type PaidPlan } from "@/lib/pricing";
import { log } from "@/lib/security";

type Sub = { id: string; status: string; plan_id?: string; current_end?: number | null; notes?: { user_id?: string } };
type Pay = { id: string; amount: number; status: string; created_at: number };

const DAY = 86_400_000;

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyWebhook(raw, request.headers.get("x-razorpay-signature"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }
  let evt;
  try {
    evt = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }
  const sub: Sub | undefined = evt.payload?.subscription?.entity;
  if (!sub) return NextResponse.json({ ok: true });

  const admin = adminClient();
  // Idempotency: Razorpay retries deliveries; process each event id exactly once
  const eventId = request.headers.get("x-razorpay-event-id") ?? `${evt.event}:${sub.id}:${evt.created_at}`;
  const { error: dup } = await admin.from("webhook_events").insert({ id: `rzp:${eventId}`, provider: "razorpay" });
  if (dup) return NextResponse.json({ ok: true, duplicate: true });
  const { data: row } = await admin.from("subscriptions").select("user_id, current_period_end, trial_end, plan_code").eq("razorpay_subscription_id", sub.id).maybeSingle();
  const userId = row?.user_id ?? sub.notes?.user_id;
  if (!userId) return NextResponse.json({ ok: true });

  const setPlan = (plan: "free" | "pro") => admin.from("users").update({ plan }).eq("id", userId);
  // Razorpay's plan_id is the authority on what was bought; fall back to what checkout recorded
  const planCode: PaidPlan = planFromRazorpayId(sub.plan_id) ?? (row?.plan_code as PaidPlan | null) ?? "hustle";
  const plan = PLANS[planCode];
  const update = (fields: Record<string, unknown>) =>
    admin.from("subscriptions").update({ status: sub.status, plan_code: planCode, ...fields }).eq("razorpay_subscription_id", sub.id);

  try {
  switch (evt.event) {
    case "subscription.authenticated": // mandate set up on day 1 → trial access
    case "subscription.activated":
      await update({ current_period_end: row?.current_period_end ?? row?.trial_end ?? new Date(Date.now() + 7 * DAY).toISOString() });
      await setPlan("pro");
      break;

    case "subscription.charged": {
      const pay: Pay | undefined = evt.payload?.payment?.entity;
      const base = Math.max(Date.now(), row?.current_period_end ? new Date(row.current_period_end).getTime() : 0);
      await update({ current_period_end: sub.current_end ? new Date(sub.current_end * 1000).toISOString() : new Date(base + plan.days * DAY).toISOString() });
      if (pay) {
        await admin.from("payments").upsert(
          { user_id: userId, razorpay_payment_id: pay.id, amount: pay.amount, status: pay.status, paid_at: new Date(pay.created_at * 1000).toISOString() },
          { onConflict: "razorpay_payment_id" },
        );
      }
      await setPlan("pro");
      break;
    }

    case "subscription.pending": {
      await update({});
      const { data: u } = await admin.from("users").select("email, telegram_chat_id").eq("id", userId).single();
      const msg = `Your ₹${plan.price} ${plan.name} renewal didn't go through. Please keep ₹${plan.price} in your UPI-linked account — we'll retry automatically.`;
      if (u?.telegram_chat_id && (await getFlag("telegram_sends", admin))) await sendTelegram(u.telegram_chat_id, msg);
      if (u?.email && (await getFlag("email_sends", admin))) await sendEmail(u.email, `Your ${plan.name} renewal is pending`, `<p>${msg}</p>`);
      break;
    }

    case "subscription.halted":
      await update({});
      await setPlan("free");
      break;

    case "subscription.cancelled":
    case "subscription.completed": {
      await update({});
      // Keep paid features until current_period_end; the daily cron downgrades expired users.
      const end = row?.current_period_end ? new Date(row.current_period_end).getTime() : 0;
      if (end < Date.now()) await setPlan("free");
      break;
    }
  }
  } catch (e) {
    // Let Razorpay retry: forget this event id so the retry is processed
    await admin.from("webhook_events").delete().eq("id", `rzp:${eventId}`);
    log.error("razorpay.webhook", e);
    return NextResponse.json({ error: "retry" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
