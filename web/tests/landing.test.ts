import { describe, expect, it } from "vitest";
import { destination } from "@/lib/landing";

const now = Date.parse("2026-10-19T10:00:00Z");
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

describe("where a student lands after signing in", () => {
  it("first-timers go through setup", () => {
    expect(destination({ onboardedAt: null, lastSeenAt: null, wanted: "/onboarding", now })).toBe("/onboarding");
    expect(destination({ onboardedAt: null, lastSeenAt: daysAgo(1), wanted: "/dashboard", now })).toBe("/onboarding");
  });

  it("someone heading to checkout can pay before uploading a resume", () => {
    expect(destination({ onboardedAt: null, lastSeenAt: null, wanted: "/billing?plan=pro_30", now })).toBe("/billing?plan=pro_30");
  });

  it("returning students skip login and setup and go to the dashboard", () => {
    for (const wanted of ["/onboarding", "/login", "/login?next=/onboarding", "/", null]) {
      expect(destination({ onboardedAt: daysAgo(30), lastSeenAt: daysAgo(2), wanted, now })).toBe("/dashboard");
    }
  });

  it("returning students still reach the page they were going to", () => {
    expect(destination({ onboardedAt: daysAgo(30), lastSeenAt: daysAgo(2), wanted: "/apply/123?tab=email", now })).toBe("/apply/123?tab=email");
    expect(destination({ onboardedAt: daysAgo(30), lastSeenAt: daysAgo(2), wanted: "/billing?plan=pro_wa_15", now })).toBe("/billing?plan=pro_wa_15");
  });

  it("after 60 days away, one quick check of their preferences", () => {
    expect(destination({ onboardedAt: daysAgo(200), lastSeenAt: daysAgo(60), wanted: "/dashboard", now })).toBe("/onboarding?review=1");
    expect(destination({ onboardedAt: daysAgo(200), lastSeenAt: daysAgo(59), wanted: "/dashboard", now })).toBe("/dashboard");
  });

  it("never follows a link off the site", () => {
    for (const wanted of ["https://phishing.example", "//phishing.example", "/\\phishing.example"]) {
      expect(destination({ onboardedAt: daysAgo(30), lastSeenAt: daysAgo(2), wanted, now })).toBe("/dashboard");
    }
  });
});
