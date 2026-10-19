/** Overview targets (SPEC.md §4 "Targets shown on the overview") and the maths behind each number. Pure, for tests. */

export type OverviewRaw = {
  first_signup_at: string | null;
  signups: number;
  signups_today: number;
  signups_7d: number;
  profile_ready: number;
  activated: number;
  weekly_active: number;
  paid: number;
  paid_within_60d: number;
  debits_ok_30d: number;
  debits_failed_30d: number;
  halted: number;
  tailored_7d: number;
  alerts_today: number;
  jobs_today: number;
  last_job_at: string | null;
  enrich_backlog: number;
  drafts_waiting: number;
};

export type Tone = "ok" | "warning" | "danger";
export type Shown = { value: string | null; tone: Tone; target?: string; empty?: string; hint?: string };

// Below this many people a percentage says more about chance than about the product
const MIN_SAMPLE = 5;
const pct = (n: number) => `${Math.round(n * 100)}%`;
/** Warning below the target, danger below half of it. */
const toneFor = (ratio: number, target: number): Tone => (ratio >= target ? "ok" : ratio >= target / 2 ? "warning" : "danger");

export function overviewMetrics(r: OverviewRaw, now = Date.now()) {
  const day = r.first_signup_at ? Math.floor((now - Date.parse(r.first_signup_at)) / 86_400_000) + 1 : null;
  const share = (n: number, of: number, target: number, targetLabel: string, empty: string): Shown =>
    of < MIN_SAMPLE ? { value: null, tone: "ok", empty } : { value: pct(n / of), tone: toneFor(n / of, target), target: targetLabel, hint: `${n} of ${of}` };

  // 1,000 by day 60: compare with a straight-line pace after the first week
  const pace = day ? (1000 * Math.min(day, 60)) / 60 : 0;
  const signups: Shown = {
    value: r.signups.toLocaleString("en-IN"),
    tone: day && day >= 7 ? toneFor(r.signups / pace, 1) : "ok",
    target: "1,000 by day 60",
    hint: day ? `Day ${day} · ${r.signups_7d} in the last 7 days` : undefined,
  };
  const debits = r.debits_ok_30d + r.debits_failed_30d;

  return {
    signups,
    activation: share(r.activated, r.signups, 0.6, "60% of signups", "Appears after 5 sign-ups."),
    weeklyActive: share(r.weekly_active, r.signups, 0.4, "40% of signups", "Appears after 5 sign-ups."),
    conversion: share(r.paid_within_60d, r.signups, 0.1, "10% within 60 days", "Appears after 5 sign-ups."),
    autopay:
      debits === 0
        ? ({ value: null, tone: "ok", empty: "Appears after the first Autopay debit." } as Shown)
        : ({ value: pct(r.debits_ok_30d / debits), tone: toneFor(r.debits_ok_30d / debits, 0.85), target: "85% of debits", hint: `${r.debits_ok_30d} of ${debits} in 30 days` } as Shown),
    tailoring:
      r.weekly_active < MIN_SAMPLE
        ? ({ value: null, tone: "ok", empty: "Appears after 5 weekly active students." } as Shown)
        : ({ value: (r.tailored_7d / r.weekly_active).toFixed(1), tone: toneFor(r.tailored_7d / r.weekly_active, 2), target: "2+ per active user a week", hint: `${r.tailored_7d} tailored this week` } as Shown),
  };
}

export type Problem = { text: string; href: string; tone: "warning" | "danger" };
