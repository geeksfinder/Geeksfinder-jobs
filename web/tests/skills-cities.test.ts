import { describe, expect, it } from "vitest";
import { offeredSuggestions } from "@/components/app/TagInput";
import { checkAts } from "@/lib/ats";
import { ANYWHERE, INDIA_CITIES, REMOTE, canonicalCity, placeFit, tidyCity } from "@/lib/cities";
import { scoreMatch } from "@/lib/matching";
import { canonicalSkill, likelyBranch, skillBranch, skillSpellings } from "@/lib/skills";

describe("skill dictionary", () => {
  it("gives one name to every spelling", () => {
    expect(canonicalSkill("ReactJS")).toBe("React");
    expect(canonicalSkill("react.js")).toBe("React");
    expect(canonicalSkill("AutoCAD 2D")).toBe("AutoCAD");
    expect(canonicalSkill("staad.pro")).toBe("STAAD Pro");
    expect(canonicalSkill("  Something New ")).toBe("Something New");
  });
  it("knows each skill's branch", () => {
    expect(skillBranch("SolidWorks")).toBe("mechanical");
    expect(skillBranch("Embedded C")).toBe("entc");
    expect(skillBranch("Python")).toBe("cs");
    expect(likelyBranch(["SolidWorks", "CATIA", "Python"])).toBe("mechanical");
    expect(likelyBranch(["Something unknown"])).toBeNull();
  });
  it("leaves out spellings that are ordinary words when searching free text", () => {
    expect(skillSpellings("REST APIs")).toContain("rest");
    expect(skillSpellings("REST APIs", { inText: true })).not.toContain("rest");
    expect(skillSpellings("REST APIs", { inText: true })[0]).toBe("REST APIs");
  });
});

describe("cities", () => {
  it("fixes spellings and typos", () => {
    expect(canonicalCity("Bangalore")).toBe("Bengaluru");
    expect(canonicalCity("banglore")).toBe("Bengaluru");
    expect(canonicalCity("dehli")).toBe("Delhi");
    expect(tidyCity("banglore")).toBe("Bengaluru");
    expect(tidyCity("remote")).toBe(REMOTE);
    expect(tidyCity("delhi ncr")).toBe("Delhi NCR");
  });
  it("matches a job's place to what the student wants", () => {
    expect(placeFit(["Bangalore"], "Bengaluru, Karnataka", false)).toBe(1);
    expect(placeFit(["dehli"], "New Delhi", false)).toBe(1);
    expect(placeFit(["Delhi NCR"], "Noida, Uttar Pradesh", false)).toBe(1);
    expect(placeFit(["Delhi NCR"], "Gurgaon", false)).toBe(1);
    expect(placeFit(["Pune"], "Chennai", false)).toBe(0);
  });
  it("handles Remote and Anywhere in India", () => {
    expect(placeFit([ANYWHERE], "Nagpur", false)).toBe(1);
    expect(placeFit([REMOTE], null, true)).toBe(1);
    expect(placeFit(["Pune"], null, true)).toBe(0.5);
    expect(placeFit([], "Pune", false)).toBe(0);
  });
});

describe("matching and ATS for every branch", () => {
  it("counts a skill written differently on the resume and in the job", () => {
    const job = { title: "Design Engineer Trainee", location: "Pune", remote: false, skills: ["AutoCAD", "SolidWorks"], fresher_friendly: true, posted_at: new Date().toISOString() };
    const r = scoreMatch({ skills: ["AutoCAD 2D", "Solid Works"], preferred_roles: ["Design Engineer"], locations: ["Poona"] }, job);
    expect(r.reasons.matched_skills).toEqual(["AutoCAD", "SolidWorks"]);
    expect(r.reasons.location_fit).toBe(1);
    expect(r.score).toBeGreaterThanOrEqual(90);
  });
  it("reads a mechanical resume, not just software ones", () => {
    const resume = "Skills: AutoCAD 2D, SolidWorks, GD&T. Projects: gearbox design. Education: B.E. Mechanical";
    const job = "Graduate Engineer Trainee. Must know AutoCAD, SolidWorks, CATIA and GD&T.";
    const r = checkAts(resume, job);
    expect(r.matched).toEqual(expect.arrayContaining(["AutoCAD", "SolidWorks", "GD&T"]));
    expect(r.missing).toContain("CATIA");
  });
  it("doesn't read the word 'rest' as REST APIs", () => {
    expect(checkAts("I worked with the rest of the team", "Must know REST APIs").matched).not.toContain("REST APIs");
  });
});

describe("city picker", () => {
  it("shows 8 cities at first and leaves out ones already picked", () => {
    const shown = offeredSuggestions(INDIA_CITIES, ["Remote"], "", tidyCity);
    expect(shown).toHaveLength(8);
    expect(shown).not.toContain("Remote");
  });
  it("narrows as the student types, under either spelling", () => {
    expect(offeredSuggestions(INDIA_CITIES, [], "nag", tidyCity)).toEqual(["Nagpur"]);
    expect(offeredSuggestions(INDIA_CITIES, [], "banglore", tidyCity)).toEqual(["Bengaluru"]);
    expect(offeredSuggestions(INDIA_CITIES, [], "Bangalore", tidyCity)).toEqual(["Bengaluru"]);
    expect(offeredSuggestions(INDIA_CITIES, [], "delhi", tidyCity)).toContain("Delhi NCR");
    expect(offeredSuggestions(INDIA_CITIES, [], "zzz", tidyCity)).toEqual([]);
  });
  it("still works without a normalize function (roles, skills)", () => {
    expect(offeredSuggestions(["Data Analyst", "Software Engineer"], [], "data")).toEqual(["Data Analyst"]);
  });
});
