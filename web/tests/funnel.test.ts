import { describe, expect, it } from "vitest";
import { breakdown, funnelSteps, sourceOf, weekOf } from "@/lib/admin/funnel";

// Fixture (SPEC.md §7 "funnel fixture test"): four students, two from Instagram via an ambassador
const ev = (name: string, user_id: string, created_at = "2026-10-28T06:00:00Z") => ({ name, user_id, created_at });
const events = [
  ev("signup", "a"), ev("signup", "b"), ev("signup", "c"), ev("signup", "d", "2026-10-20T06:00:00Z"),
  ev("profile_ready", "a"), ev("profile_ready", "b"), ev("profile_ready", "c"),
  ev("prefs_saved", "a"), ev("prefs_saved", "b"),
  ev("channel_connected", "a"), ev("channel_connected", "a"), ev("channel_connected", "b"),
  ev("first_action", "a"),
  ev("paid_first", "a"),
];
const attrs = new Map([
  ["a", { utm_source: "instagram", ref_code: "PUNE-AMB-07", utm_campaign: "oct" }],
  ["b", { utm_source: "instagram", ref_code: "PUNE-AMB-07" }],
  ["c", { referrer_host: "google.com" }],
]);

describe("funnel", () => {
  it("counts each student once per step, with the share carried on from the step before", () => {
    const steps = funnelSteps(events);
    const by = Object.fromEntries(steps.map((s) => [s.name, [s.count, s.fromPrev]]));
    expect(by.signup).toEqual([4, null]);
    expect(by.profile_ready).toEqual([3, 75]);
    expect(by.prefs_saved).toEqual([2, 67]);
    expect(by.channel_connected).toEqual([2, 100]);
    expect(by.first_action).toEqual([1, null]);
    expect(by.paid_first).toEqual([1, null]);
  });
  it("breaks down by source and by ambassador", () => {
    expect(breakdown(events, attrs, "source", ["signup", "paid_first"])).toEqual([
      { group: "instagram", counts: [2, 1] },
      { group: "direct", counts: [1, 0] },
      { group: "google.com", counts: [1, 0] },
    ]);
    expect(breakdown(events, attrs, "ambassador", ["signup", "channel_connected"])[0]).toEqual({ group: "PUNE-AMB-07", counts: [2, 2] });
  });
  it("breaks down by college through the ambassador's code, and by signup week", () => {
    const colleges = new Map([["PUNE-AMB-07", "COEP Pune"]]);
    expect(breakdown(events, attrs, "college", ["signup"], colleges)[0]).toEqual({ group: "COEP Pune", counts: [2] });
    expect(breakdown(events, attrs, "week", ["signup"]).map((r) => r.group)).toEqual(["2026-10-26", "2026-10-19"]);
  });
  it("names sources and weeks plainly", () => {
    expect(sourceOf(undefined)).toBe("direct");
    expect(sourceOf({ referrer_host: "t.me" })).toBe("t.me");
    expect(weekOf("2026-10-29T10:00:00Z")).toBe("2026-10-26");
  });
});
