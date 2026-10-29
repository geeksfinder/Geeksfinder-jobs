import { FUNNEL, type FunnelEvent } from "../events";

/**
 * The funnel (SPEC.md §4, A12): distinct students per step in a date range, each step's share of the one before,
 * and the same steps broken down by where students came from. Pure: the page loads events and attributions.
 */
export type Attr = { utm_source?: string | null; utm_campaign?: string | null; referrer_host?: string | null; ref_code?: string | null };
export const BREAKDOWNS = ["source", "campaign", "ambassador", "college", "week"] as const;
export type Breakdown = (typeof BREAKDOWNS)[number];

/** Where a student came from: the UTM source, else the site that sent them, else "direct". */
export const sourceOf = (a: Attr | undefined) => a?.utm_source || a?.referrer_host || "direct";

/** Monday of the week a date falls in (IST), as "2026-10-26". */
export function weekOf(iso: string) {
  const d = new Date(new Date(iso).getTime() + 5.5 * 3_600_000);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

type Event = { name: string; user_id: string | null; created_at: string };

export function funnelSteps(events: Event[]) {
  const users = new Map<string, Set<string>>();
  for (const e of events) if (e.user_id) (users.get(e.name) ?? users.set(e.name, new Set()).get(e.name)!).add(e.user_id);
  return FUNNEL.map((step, i) => {
    const count = users.get(step.name)?.size ?? 0;
    const prev = i ? users.get(FUNNEL[i - 1].name)?.size ?? 0 : 0;
    return { ...step, count, fromPrev: i && prev ? Math.round((count / prev) * 100) : null };
  });
}

/** The value a student falls under for a breakdown (college through their ambassador's code). */
export function groupOf(by: Breakdown, a: Attr | undefined, signupAt: string | undefined, collegeByCode: Map<string, string>) {
  if (by === "source") return sourceOf(a);
  if (by === "campaign") return a?.utm_campaign || "(none)";
  if (by === "ambassador") return a?.ref_code || "(none)";
  if (by === "college") return (a?.ref_code && collegeByCode.get(a.ref_code)) || "(unknown)";
  return signupAt ? weekOf(signupAt) : "(before tracking)";
}

/** Rows of the breakdown table: each group's distinct students at the chosen steps, biggest group first. */
export function breakdown(events: Event[], attrs: Map<string, Attr>, by: Breakdown, steps: FunnelEvent[], collegeByCode = new Map<string, string>()) {
  const signupAt = new Map<string, string>();
  for (const e of events) if (e.name === "signup" && e.user_id && !signupAt.has(e.user_id)) signupAt.set(e.user_id, e.created_at);
  const groups = new Map<string, Map<FunnelEvent, Set<string>>>();
  for (const e of events) {
    if (!e.user_id || !steps.includes(e.name as FunnelEvent)) continue;
    const g = groupOf(by, attrs.get(e.user_id), signupAt.get(e.user_id), collegeByCode);
    const byStep = groups.get(g) ?? groups.set(g, new Map()).get(g)!;
    (byStep.get(e.name as FunnelEvent) ?? byStep.set(e.name as FunnelEvent, new Set()).get(e.name as FunnelEvent)!).add(e.user_id);
  }
  return [...groups.entries()]
    .map(([group, byStep]) => ({ group, counts: steps.map((s) => byStep.get(s)?.size ?? 0) }))
    // Real channels first; "(none)" and "(unknown)" go last. Weeks newest first.
    .sort((a, b) =>
      by === "week"
        ? b.group.localeCompare(a.group)
        : Number(a.group.startsWith("(")) - Number(b.group.startsWith("(")) || b.counts[0] - a.counts[0] || a.group.localeCompare(b.group),
    );
}
