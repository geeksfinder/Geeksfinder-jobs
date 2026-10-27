import { NextResponse } from "next/server";
import { getFlag } from "@/lib/admin/flags";
import { featureTier } from "@/lib/pricing";
import { alertEmailHtml, alertEmailSubject, canSendTestAlert, sendTelegramAlert, type AlertMatch } from "@/lib/alerts";
import { sendEmail } from "@/lib/email";
import { MATCH_THRESHOLD } from "@/lib/matching";
import { rateLimit } from "@/lib/ratelimit";
import { badRequest, fail, tooMany, unauthorized } from "@/lib/security";
import { requireUser } from "@/lib/supabase/server";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import { parseJson, TestAlertBody } from "@/lib/validate";

const JOB_COLS = "id, title, company, location, remote, apply_url, fresher_friendly";

export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const body = await parseJson(request, TestAlertBody);
  if (!body) return badRequest();
  // Account age comes from Supabase Auth, which the user can't edit
  if (!canSendTestAlert(user.created_at)) return NextResponse.json({ error: "Test alerts are available on your first day only." }, { status: 403 });
  if (!(await getFlag(body.channel === "telegram" ? "telegram_sends" : "email_sends")))
    return NextResponse.json({ error: "Alerts on this channel are paused for a short while. Try again later." }, { status: 503 });
  const rl = await rateLimit("testAlert", user.id);
  if (!rl.ok) return tooMany(rl.retryAfter);

  const { data: u } = await supabase.from("users").select("name, plan, telegram_chat_id").eq("id", user.id).single();
  if (body.channel === "telegram" && !u?.telegram_chat_id) return badRequest("Connect Telegram first, then send a test.");
  if (body.channel === "email" && !user.email) return badRequest("Your account has no email address.");

  // Your top 3 matches; if there are none yet, 3 recent fresher-friendly jobs so you still see the format.
  // Read-only: the matches stay un-notified, so they still arrive in your first real alert.
  const { data: rows } = await supabase.from("matches").select(`score, jobs(${JOB_COLS})`).eq("user_id", user.id).gte("score", MATCH_THRESHOLD).order("score", { ascending: false }).limit(3);
  let matches = ((rows ?? []) as unknown as AlertMatch[]).filter((m) => m.jobs);
  if (!matches.length) {
    const { data: jobs } = await supabase.from("jobs").select(JOB_COLS).eq("fresher_friendly", true).order("posted_at", { ascending: false }).limit(3);
    matches = ((jobs ?? []) as AlertMatch["jobs"][]).map((j) => ({ score: 80, jobs: j }));
  }
  if (!matches.length) return NextResponse.json({ error: "No jobs to show yet. Try again after the next morning run." }, { status: 409 });

  const app = (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(/\/+$/, "");
  try {
    let ok: boolean;
    if (body.channel === "telegram") {
      ok = await sendTelegramAlert(u!.telegram_chat_id!, { name: u?.name, plan: featureTier(u?.plan), matches, app, test: true });
    } else {
      const unsub = unsubscribeUrl(app, user.id);
      const html = alertEmailHtml(matches, { plan: featureTier(u?.plan), unsubscribeUrl: unsub, app, test: true });
      ok = await sendEmail(user.email!, alertEmailSubject(matches.length, true), html, { unsubscribeUrl: unsub });
    }
    if (!ok) return NextResponse.json({ error: body.channel === "telegram" ? "Telegram didn't accept the message. Press Start in the bot, then try again." : "The email didn't send. Try again in a few minutes." }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail("alerts.test", e, "The test alert didn't send. Try again in a few minutes.", 502);
  }
}
