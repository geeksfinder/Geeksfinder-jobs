import { describe, expect, it, vi } from "vitest";
import { attributionFrom, cleanCode, decodeAttribution, encodeAttribution, sanitizeAttribution, withRefCode } from "@/lib/attribution";
import { recordSignup } from "@/lib/landing";

describe("first-touch attribution", () => {
  it("reads UTM tags, a ref code, the sending site and the landing page", () => {
    const a = attributionFrom(new URL("https://geeksfinder.online/jobs/fresher-jobs-pune?utm_source=Instagram&utm_medium=story&utm_campaign=oct&ref=pune-amb-07"), "https://www.instagram.com/", Date.UTC(2026, 9, 29));
    expect(a).toEqual({ utm_source: "instagram", utm_medium: "story", utm_campaign: "oct", ref_code: "PUNE-AMB-07", referrer_host: "instagram.com", landing_path: "/jobs/fresher-jobs-pune", first_seen_at: "2026-10-29T00:00:00.000Z" });
  });
  it("doesn't count our own site as the referrer", () => {
    expect(attributionFrom(new URL("https://geeksfinder.online/"), "https://geeksfinder.online/blog").referrer_host).toBeUndefined();
  });
  it("survives the cookie round trip", () => {
    const a = { utm_source: "telegram_channel", ref_code: "PUNE-AMB-07", landing_path: "/" };
    expect(decodeAttribution(encodeAttribution(a))).toEqual(a);
  });
  it("throws away anything odd from a hand-edited cookie", () => {
    const evil = btoa(JSON.stringify({ utm_source: "<script>", ref_code: "x';drop", landing_path: "https://evil.example", extra: "field", utm_medium: "a".repeat(500) }));
    // Bad characters and unknown keys are dropped; an over-long value is cut to 100 characters
    expect(decodeAttribution(evil)).toEqual({ utm_medium: "a".repeat(100) });
    expect(decodeAttribution("not base64 at all !!")).toBeNull();
    expect(decodeAttribution("x".repeat(3000))).toBeNull();
    expect(sanitizeAttribution({ utm_campaign: "diwali sale 2026" })).toEqual({ utm_campaign: "diwali sale 2026" });
  });
  it("accepts only well-formed codes, upper-cased", () => {
    expect(cleanCode("pune-amb-07")).toBe("PUNE-AMB-07");
    expect(cleanCode("ab")).toBeUndefined();
    expect(cleanCode("A B C D")).toBeUndefined();
  });
  it("keeps the first touch when a referral link comes later", () => {
    expect(withRefCode({ utm_source: "google" }, "PUNE-AMB-07")).toEqual({ utm_source: "google", ref_code: "PUNE-AMB-07" });
    expect(withRefCode({ ref_code: "FIRST-01" }, "LATER-02").ref_code).toBe("FIRST-01");
    expect(withRefCode(null, "PUNE-AMB-07").ref_code).toBe("PUNE-AMB-07");
  });
});

describe("saving it at signup", () => {
  const fakeDb = () => {
    const writes: { table: string; op: string; value: unknown }[] = [];
    const q = (table: string) => ({
      upsert: async (value: unknown) => (writes.push({ table, op: "upsert", value }), { error: null }),
      insert: async (value: unknown) => (writes.push({ table, op: "insert", value }), { error: null }),
    });
    return { db: { from: vi.fn(q) } as never, writes };
  };
  it("saves where a new student came from and records the signup step", async () => {
    const { db, writes } = fakeDb();
    const cookie = encodeAttribution({ utm_source: "instagram", ref_code: "PUNE-AMB-07" });
    expect(await recordSignup(db, "u1", new Date().toISOString(), cookie)).toBe(true);
    expect(writes).toEqual([
      { table: "attributions", op: "upsert", value: { user_id: "u1", utm_source: "instagram", ref_code: "PUNE-AMB-07" } },
      { table: "events", op: "insert", value: { name: "signup", user_id: "u1", props: { source: "instagram", ref: "PUNE-AMB-07" } } },
    ]);
  });
  it("skips accounts older than a day, so returning students aren't counted as new", async () => {
    const { db, writes } = fakeDb();
    expect(await recordSignup(db, "u1", "2026-01-01T00:00:00Z", null)).toBe(false);
    expect(writes).toEqual([]);
  });
  it("records a direct visit when there's no cookie", async () => {
    const { db, writes } = fakeDb();
    await recordSignup(db, "u1", new Date().toISOString(), null);
    expect(writes[1]).toEqual({ table: "events", op: "insert", value: { name: "signup", user_id: "u1", props: { source: "direct" } } });
  });
});
