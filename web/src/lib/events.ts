import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Funnel events (SPEC.md §5), written server-side so ad blockers can't skew them. The once-only steps have a unique
 * index (migration 009), so recording one again is a no-op. Tracking never breaks the action it records: failures
 * are logged and swallowed.
 */
export const FUNNEL = [
  { name: "signup", label: "Signed up" },
  { name: "profile_ready", label: "Resume uploaded" },
  { name: "prefs_saved", label: "Preferences saved" },
  { name: "channel_connected", label: "Alert channel connected" },
  { name: "first_alert_delivered", label: "First alert delivered" },
  { name: "first_action", label: "First action (tailor, Email HR, cover letter, apply)" },
  { name: "trial_started", label: "Trial started (mandate set up)" },
  { name: "paid_first", label: "First paid debit" },
  { name: "renewed", label: "Renewed (second debit)" },
] as const;
export type FunnelEvent = (typeof FUNNEL)[number]["name"];

export async function track(db: SupabaseClient, name: FunnelEvent, userId: string, props: Record<string, unknown> = {}) {
  try {
    const { error } = await db.from("events").insert({ name, user_id: userId, props });
    // 23505: this once-only step was already recorded for this student
    if (error && error.code !== "23505") console.warn(`[events] ${name}: ${error.message}`);
  } catch (e) {
    console.warn(`[events] ${name}: ${(e as Error).message}`);
  }
}
