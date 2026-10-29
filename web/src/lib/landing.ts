import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeAttribution } from "./attribution";
import { track } from "./events";
import { safeNext } from "./security-client";

/**
 * Where a student lands after signing in (or opening /login while signed in):
 * - never finished setup → onboarding;
 * - back after REVIEW_AFTER_DAYS or more → a quick "are these still right?" pass through their saved preferences;
 * - otherwise → where they were going, or the dashboard. Never back through login or onboarding.
 */
export const REVIEW_AFTER_DAYS = 60;
const DAY = 86_400_000;

const isSetupPath = (p: string) => p === "/login" || p.startsWith("/login?") || p === "/onboarding" || p.startsWith("/onboarding?") || p === "/";

export function destination(input: { onboardedAt: string | null; lastSeenAt: string | null; wanted: string | null; now?: number }): string {
  const now = input.now ?? Date.now();
  const wanted = safeNext(input.wanted, "/dashboard");
  // Someone heading to checkout from the pricing block can pay first and upload their resume after
  if (!input.onboardedAt) return wanted.startsWith("/billing") ? wanted : "/onboarding";
  if (input.lastSeenAt && now - Date.parse(input.lastSeenAt) >= REVIEW_AFTER_DAYS * DAY) return "/onboarding?review=1";
  return isSetupPath(wanted) ? "/dashboard" : wanted;
}

/** Works out the destination and records the visit. Service-role client: last_seen_at isn't user-writable. */
export async function afterSignIn(admin: SupabaseClient, userId: string, wanted: string | null, attrCookie?: string | null): Promise<string> {
  const { data: u } = await admin.from("users").select("onboarded_at, last_seen_at, created_at").eq("id", userId).maybeSingle();
  await recordSignup(admin, userId, (u?.created_at as string | undefined) ?? null, attrCookie ?? null);
  const dest = destination({ onboardedAt: (u?.onboarded_at as string | null) ?? null, lastSeenAt: (u?.last_seen_at as string | null) ?? null, wanted });
  await admin.from("users").update({ last_seen_at: new Date().toISOString() }).eq("id", userId);
  return dest;
}

/**
 * A new account (created in the last day): save where they first came from (gf_attr cookie, lib/attribution.ts) and
 * record the signup step. Older accounts signing in again are skipped, so they aren't counted as new students.
 * attributions.user_id is the key, so only the first sign-in writes it.
 */
export async function recordSignup(admin: SupabaseClient, userId: string, createdAt: string | null, attrCookie: string | null, now = Date.now()) {
  if (!createdAt || now - new Date(createdAt).getTime() > 86_400_000) return false;
  const a = decodeAttribution(attrCookie) ?? {};
  await admin.from("attributions").upsert({ user_id: userId, ...a }, { onConflict: "user_id", ignoreDuplicates: true });
  await track(admin, "signup", userId, { source: a.utm_source ?? a.referrer_host ?? "direct", ...(a.ref_code ? { ref: a.ref_code } : {}) });
  return true;
}
