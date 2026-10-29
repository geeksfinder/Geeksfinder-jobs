import { describe, expect, it } from "vitest";
import { countsSummary, duration, fallbackRate, median, scoreBands, zeroMatchReason } from "@/lib/admin/ops";

describe("admin operations numbers", () => {
  it("bands scores the way students see them", () => {
    const b = scoreBands([45, 59, 60, 72, 80, 95, 30]);
    expect(b.map((x) => x.count)).toEqual([2, 1, 1, 1, 1]);
  });
  it("takes a median", () => {
    expect(median([])).toBe(0);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 10])).toBe(3);
  });
  it("says why a student has no matches, most fixable first", () => {
    expect(zeroMatchReason(null, 0)).toBe("No resume yet");
    expect(zeroMatchReason({ skills: ["A", "B"] }, 0)).toBe("Only 2 skills on the profile");
    expect(zeroMatchReason({ skills: ["A", "B", "C", "D", "E"], preferred_roles: [], locations: ["Pune"] }, 0)).toBe("No roles chosen");
    expect(zeroMatchReason({ skills: ["A", "B", "C", "D", "E"], preferred_roles: ["Design Engineer"], locations: ["Pune"] }, 4)).toBe("Only close fits (4 worth a look)");
    expect(zeroMatchReason({ skills: ["A", "B", "C", "D", "E"], preferred_roles: ["Design Engineer"], locations: ["Pune"] }, 0)).toBe("No jobs for their skills and cities yet");
  });
  it("formats run time and counts", () => {
    expect(duration("2026-10-29T00:30:00Z", "2026-10-29T00:32:14Z")).toBe("2 min 14 s");
    expect(duration("2026-10-29T00:30:00Z", null)).toBe("running");
    expect(countsSummary({ fetched_bosch: 9, inserted: 80, matched: 23, govt_new: 0, note: "x" })).toBe("inserted 80 · matched 23");
  });
  it("works out the Groq fallback rate", () => {
    expect(fallbackRate(200, 30)).toBe(15);
    expect(fallbackRate(0, 0)).toBe(0);
  });
});
