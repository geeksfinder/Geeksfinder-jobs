"use server";

import { randomBytes } from "crypto";
import { featureTier } from "@/lib/pricing";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { matchNow } from "@/lib/match-now";
import { MATCH_THRESHOLD } from "@/lib/matching";
import { LIMITS } from "@/lib/plan";
import { rateLimit } from "@/lib/ratelimit";
import { adminClient, requireUser } from "@/lib/supabase/server";
import { botLink } from "@/lib/telegram";
import { AlertsBody, ProfileBody, type ProfileInput } from "@/lib/validate";

type Result = { ok: true } | { ok: false; error: string };

async function authed() {
  const { supabase, user } = await requireUser();
  if (!user) throw new Error("unauthorized");
  if (!(await rateLimit("api", user.id)).ok) throw new Error("Too many changes. Wait a minute.");
  return { supabase, user };
}

const SkillsBody = z.object({ skills: ProfileBody.shape.skills.min(1, "Add at least one skill") });
const PrefsBody = ProfileBody.pick({ preferred_roles: true, locations: true, job_type: true });

export async function saveSkills(skills: string[]): Promise<Result> {
  const { supabase, user } = await authed();
  const parsed = SkillsBody.safeParse({ skills });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  await supabase.from("profiles").upsert({ user_id: user.id, skills: [...new Set(parsed.data.skills)], updated_at: new Date().toISOString() });
  return { ok: true };
}

export async function savePreferences(input: z.infer<typeof PrefsBody>): Promise<Result> {
  const { supabase, user } = await authed();
  const parsed = PrefsBody.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!parsed.data.preferred_roles.length) return { ok: false, error: "Add at least one role you want." };
  await supabase.from("profiles").upsert({ user_id: user.id, ...parsed.data, updated_at: new Date().toISOString() });
  return { ok: true };
}

/** Full profile save (Resumes page). */
export async function saveProfile(input: ProfileInput): Promise<Result> {
  const { supabase, user } = await authed();
  const parsed = ProfileBody.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { name, phone, ...profile } = parsed.data;
  await supabase.from("users").update({ name, phone }).eq("id", user.id);
  const { error } = await supabase.from("profiles").upsert({ user_id: user.id, ...profile, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: "Couldn't save your profile. Try again." };
  revalidatePath("/resumes");
  return { ok: true };
}

export async function saveAlerts(input: z.input<typeof AlertsBody>): Promise<Result> {
  const { supabase, user } = await authed();
  const parsed = AlertsBody.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick how often and where." };
  const { data: u } = await supabase.from("users").select("plan").eq("id", user.id).single();
  const plan = featureTier(u?.plan);
  const { frequency, channels, alert_hour, quiet_start, quiet_end } = parsed.data;
  const { error } = await supabase
    .from("alert_settings")
    .update({
      // Plan comes from the DB, not the form: free users can't pick daily
      frequency: LIMITS[plan].frequencies.includes(frequency) ? frequency : "weekly",
      channels,
      alert_hour,
      quiet_hours: quiet_start !== quiet_end ? `[${quiet_start},${quiet_end})` : null,
    })
    .eq("user_id", user.id);
  if (error) return { ok: false, error: "Couldn't save alerts. Try again." };
  // Saving alerts is the last setup step: from now on sign-in goes straight to the dashboard (lib/landing.ts).
  // Written with the service role: onboarded_at isn't user-writable.
  await adminClient().from("users").update({ onboarded_at: new Date().toISOString() }).eq("id", user.id).is("onboarded_at", null);
  revalidatePath("/alerts");
  return { ok: true };
}

/** One-time, 15-minute code for t.me/<bot>?start=<code>. Written with the service role (column not user-writable). */
export async function telegramConnectLink(): Promise<string> {
  const { user } = await authed();
  const code = randomBytes(18).toString("base64url");
  await adminClient()
    .from("users")
    .update({ telegram_link_code: code, telegram_link_expires_at: new Date(Date.now() + 15 * 60_000).toISOString() })
    .eq("id", user.id);
  return botLink(code);
}

export async function telegramStatus(): Promise<boolean> {
  const { supabase, user } = await requireUser();
  if (!user) return false;
  const { data } = await supabase.from("users").select("telegram_chat_id").eq("id", user.id).single();
  return !!data?.telegram_chat_id;
}

export async function disconnectTelegram() {
  const { user } = await authed();
  await adminClient().from("users").update({ telegram_chat_id: null, telegram_link_code: null }).eq("id", user.id);
  revalidatePath("/alerts");
}

export type FirstMatch = { id: string; title: string; company: string; location: string | null; remote: boolean; fresher_friendly: boolean; skills: string[]; posted_at: string | null; score: number; reasons: Record<string, unknown> };

/** Onboarding step 4: score recent jobs now so value arrives before any payment ask. */
export async function firstMatches(): Promise<FirstMatch[]> {
  const { supabase, user } = await authed();
  await matchNow(adminClient(), user.id);
  const { data } = await supabase
    .from("matches")
    .select("score, reasons, jobs(id, title, company, company_domain, location, remote, fresher_friendly, skills, posted_at)")
    .eq("user_id", user.id)
    .gte("score", MATCH_THRESHOLD)
    .order("score", { ascending: false })
    .limit(5);
  // A job hidden after reports comes back as null through the student's own (RLS) view
  return (data ?? []).filter((m) => m.jobs).map((m) => ({ ...(m.jobs as unknown as Omit<FirstMatch, "score" | "reasons">), score: m.score, reasons: m.reasons }));
}
