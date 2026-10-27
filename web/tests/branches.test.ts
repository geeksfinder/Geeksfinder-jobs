import { describe, expect, it } from "vitest";
import { BRANCHES, ROLE_NAMES, fetchSearches, suggestRoles } from "@/lib/branches";
import { gapText } from "@/components/ui/MatchScore";
import { hideDecision } from "@/lib/job-reports";
import { inIndia } from "@/lib/cities";
import { countHubs, parseHub } from "@/lib/hubs";

describe("morning fetch searches", () => {
  it("runs every branch's searches, mixed so each run covers several branches", () => {
    const q = fetchSearches(["Frontend Developer"], {});
    expect(q[0]).toBe("frontend developer fresher");
    // The first few searches already span several branches, not one
    expect(q.slice(0, 8)).toEqual(expect.arrayContaining(["software engineer fresher", "electronics engineer fresher", "mechanical engineer fresher", "civil engineer fresher"]));
    for (const b of BRANCHES) for (const s of b.searches) expect(q).toContain(s);
    expect(q).not.toContain("vlsi design engineer fresher");
  });
  it("adds a branch's extra searches once it has students, without repeats", () => {
    const q = fetchSearches(["VLSI Engineer", "Software Engineer"], { entc: 1 });
    expect(q).toContain("vlsi design engineer fresher");
    expect(q).toContain("vlsi engineer fresher");
    expect(new Set(q).size).toBe(q.length);
  });
});

describe("India check for job locations", () => {
  it("knows Indian cities, aliases and industrial towns", () => {
    for (const loc of ["Bengaluru, Karnataka", "Bangalore, IND", "Gurgaon", "Chakan, Pune", "Hosur", "Mumbai, Maharashtra, India", "India"]) expect(inIndia(loc)).toBe(true);
  });
  it("doesn't take Indiana or other countries for India", () => {
    for (const loc of ["Indianapolis, IN", "Louisville, Indiana", "Remote - US", "Berlin, Germany", "", null]) expect(inIndia(loc)).toBe(false);
  });
});

describe("branch job pages", () => {
  const jobs = [
    { title: "Graduate Engineer Trainee - Mechanical", location: "Pune, Maharashtra", remote: false },
    { title: "Site Engineer (Civil)", location: "Mumbai", remote: false },
    { title: "Embedded Software Engineer", location: "Bengaluru", remote: false },
    { title: "Design Verification Engineer", location: "Hyderabad", remote: false },
    { title: "Site Reliability Engineer", location: "Pune", remote: false },
    { title: "UI Design Engineer", location: "Pune", remote: false },
  ];
  const counts = countHubs(jobs);
  it("counts core-branch jobs on their pages", () => {
    expect(counts.get("mechanical-engineer-fresher-jobs")).toBe(1);
    expect(counts.get("mechanical-engineer-fresher-pune")).toBe(1);
    expect(counts.get("graduate-engineer-trainee-fresher-jobs")).toBe(1);
    expect(counts.get("civil-engineer-fresher-jobs")).toBe(1);
    expect(counts.get("electronics-engineer-fresher-jobs")).toBe(2);
  });
  it("keeps software roles off the core pages", () => {
    // "Site Reliability Engineer" isn't a site engineer; "UI Design Engineer" isn't mechanical
    expect(counts.get("civil-engineer-fresher-pune")).toBeUndefined();
    expect(counts.get("mechanical-engineer-fresher-jobs")).toBe(1);
  });
  it("parses the new page addresses", () => {
    expect(parseHub("civil-engineer-fresher-mumbai")?.role?.name).toBe("Civil Engineering");
    expect(parseHub("electronics-engineer-fresher-jobs")?.city).toBeNull();
  });
});

describe("role suggestions", () => {
  it("puts the roles a student's skills point to first", () => {
    expect(suggestRoles(["SolidWorks", "CATIA", "GD&T", "AutoCAD"])[0]).toBe("Design Engineer");
    expect(suggestRoles(["STAAD Pro", "ETABS", "AutoCAD"]).slice(0, 2)).toEqual(["Structural Design Engineer", "Structural Engineer"]);
    expect(suggestRoles(["Verilog", "VHDL", "Digital Electronics"]).slice(0, 3)).toContain("VLSI Design Engineer");
    expect(suggestRoles(["ReactJS", "JavaScript", "HTML", "CSS"])[0]).toBe("Frontend Developer");
  });
  it("still lists every role, once, so anything can be found by typing", () => {
    const all = suggestRoles([]);
    expect(all).toHaveLength(ROLE_NAMES.length);
    expect(new Set(ROLE_NAMES).size).toBe(ROLE_NAMES.length);
    expect(all[0]).toBe("Software Engineer");
  });
});

describe("near matches", () => {
  it("says what's missing", () => {
    expect(gapText({ missing_skills: ["SolidWorks"], location_fit: 1, role_fit: 1 })).toBe("Needs SolidWorks");
    expect(gapText({ missing_skills: ["A", "B", "C", "D"], location_fit: 0, role_fit: 0.5 })).toBe("Needs A, B and 2 more · Outside your cities");
    expect(gapText({ missing_skills: [], role_fit: 0 })).toBe("A different role from yours");
  });
});

describe("report this job", () => {
  it("hides a job only after 3 different students report it", () => {
    expect(hideDecision(["scam", "scam"]).hide).toBe(false);
    expect(hideDecision(["scam", "scam", "expired"])).toEqual({ hide: true, reason: "scam" });
    expect(hideDecision(["expired", "expired", "other"])).toEqual({ hide: true, reason: "expired" });
    expect(hideDecision(["wrong_info", "other", "scam"])).toEqual({ hide: true, reason: "other" });
  });
});

describe("chosen branch", () => {
  it("ranks roles by the branch the student picked when skills don't say", () => {
    expect(suggestRoles(["Teamwork"], "civil")[0]).toBe("Civil Engineer");
    expect(suggestRoles(["Excel"], "civil")[0]).toBe("Quantity Surveyor");
    expect(suggestRoles(["AutoCAD"], "electrical").slice(0, 3)).toContain("Electrical Design Engineer");
  });
});
