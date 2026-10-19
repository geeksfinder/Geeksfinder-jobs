import { NextResponse } from "next/server";
import { audit } from "@/lib/admin/audit";
import { AREA_ROLES } from "@/lib/admin/constants";
import { getFlag } from "@/lib/admin/flags";
import { adminError, adminPost } from "@/lib/admin/route";
import { sendEmail } from "@/lib/email";
import { DEFAULT_PLAN, PLANS, isPaidPlan } from "@/lib/pricing";
import { sendTelegram } from "@/lib/telegram";
import { RemindBody } from "@/lib/validate";

/** Resend the "renewal didn't go through" reminder to a student whose debit is pending or halted (module A11). */
export const POST = adminPost(AREA_ROLES.remind, RemindBody, async ({ admin, user }, { user_id }) => {
  const { data: sub } = await admin.from("subscriptions").select("status, plan_code").eq("user_id", user_id).maybeSingle();
  if (!sub || !["pending", "halted"].includes(sub.status ?? "")) return adminError(409, "not_pending", "This student has no pending or halted debit.");
  const plan = isPaidPlan(sub.plan_code) ? PLANS[sub.plan_code] : PLANS[DEFAULT_PLAN];
  const { data: u } = await admin.from("users").select("email, telegram_chat_id").eq("id", user_id).single();
  const msg = `Your ₹${plan.price} ${plan.name} renewal didn't go through. Please keep ₹${plan.price} in your UPI-linked account — we'll retry automatically.`;

  const sent: string[] = [];
  if (u?.telegram_chat_id && (await getFlag("telegram_sends", admin)) && (await sendTelegram(u.telegram_chat_id, msg))) sent.push("telegram");
  if (u?.email && (await getFlag("email_sends", admin)) && (await sendEmail(u.email, `Your ${plan.name} renewal is pending`, `<p>${msg}</p>`))) sent.push("email");
  if (!sent.length) return adminError(502, "not_sent", "The reminder didn't send. The student may have no channel connected, or sends are paused.");
  await audit(user.id, "payment.remind", { table: "subscriptions", id: user_id }, null, { channels: sent }, admin);
  return NextResponse.json({ sent });
});
