import { describe, expect, it } from "vitest";
import { classifySheetRow, companySlug, contactScore, nameFromDomain, normName, parseCsv, rootDomain } from "@/lib/companies";
import { isCompanyDomain, logoDomain } from "@/lib/company";
import { aliasIndex, displayName, uniqueSlug } from "@/lib/company-sync";

describe("company keys", () => {
  it("uses the registrable root domain", () => {
    expect(rootDomain("in.bosch.com")).toBe("bosch.com");
    expect(rootDomain("careers.tcs.co.in")).toBe("tcs.co.in");
    expect(rootDomain("www.Zepto.com")).toBe("zepto.com");
  });
  it("normalises names without merging different companies", () => {
    expect(normName("Bosch Group")).toBe("bosch");
    expect(normName("Razorpay Software Private Limited")).toBe("razorpay");
    expect(normName("HackerRank Careers")).toBe("hackerrank");
    // "Star Technologies" must not become "Star" (that's Star TV)
    expect(normName("Star Technologies")).toBe("star technologies");
    expect(normName("M&M (Mahindra)")).toBe("m and m");
  });
  it("builds names and slugs", () => {
    expect(nameFromDomain("in.bosch.com")).toBe("Bosch");
    expect(nameFromDomain("acme-corp.com")).toBe("Acme Corp");
    expect(companySlug("Tata Consultancy Services Ltd.")).toBe("tata-consultancy-services");
    const taken = new Map([["star", "star.com"]]);
    expect(uniqueSlug("Star", "startv.com", taken)).toBe("star-startv-com");
    expect(uniqueSlug("Star", "star.com", taken)).toBe("star");
  });
  it("leaves a name out when two companies share it", () => {
    const idx = aliasIndex([{ domain: "a.com", aliases: ["apex"] }, { domain: "b.com", aliases: ["apex", "beta"] }]);
    expect(idx.get("apex")).toBeUndefined();
    expect(idx.get("beta")).toBe("b.com");
  });
});

describe("job feeds", () => {
  it("never treats a job board, social site or site builder as the company's domain", () => {
    for (const d of ["linkedin.com", "in.linkedin.com", "justdial.com", "naukri.com", "boards.greenhouse.io", "jobs.lever.co", "sites.google.com", "x.com"]) expect(isCompanyDomain(d)).toBe(false);
    for (const d of ["bosch.com", "box.com", "oracle.com", "swiggy.in"]) expect(isCompanyDomain(d)).toBe(true);
    expect(logoDomain("India Spelling Bee", "linkedin.com")).toBeNull();
  });
  it("shows names sent in capitals in normal case, and leaves other names alone", () => {
    expect(displayName("SWIGGY")).toBe("Swiggy");
    expect(displayName("ISKILLS SOLUTIONS")).toBe("Iskills Solutions");
    expect(displayName("IBM")).toBe("IBM");
    expect(displayName("HackerRank")).toBe("HackerRank");
  });
});

describe("HR sheet rows", () => {
  const row = { name: "PRIYA SHARMA", email: "Priya.Sharma@Zepto.com ", designation: "Talent Acquisition Partner", company: "Zepto Pvt Ltd", companySource: "Provided", category: "Corporate HR / Talent team", emailType: "Company domain", confidence: "Recent source" };
  it("keeps a company HR person, tidied", () => {
    const r = classifySheetRow(row);
    expect(r).toMatchObject({ ok: true, contact: { email: "priya.sharma@zepto.com", domain: "zepto.com", name: "Priya Sharma", role: "Talent Acquisition Partner", category: "hr_team", quality: "recent", company: "Zepto" } });
  });
  it("drops personal mailboxes, free mail, agencies, bench sales and colleges", () => {
    expect(classifySheetRow({ ...row, emailType: "Personal mailbox" })).toEqual({ ok: false, reason: "personal_mailbox" });
    expect(classifySheetRow({ ...row, email: "priya@gmail.com" })).toEqual({ ok: false, reason: "free_mail" });
    for (const category of ["Staffing / Recruitment agency", "Staffing / Recruiter - likely US IT bench sales", "College / Placement cell", "Individual recruiter / HR (personal email)"]) {
      expect(classifySheetRow({ ...row, category })).toEqual({ ok: false, reason: "agency_or_college" });
    }
    expect(classifySheetRow({ ...row, email: "not-an-email" })).toEqual({ ok: false, reason: "invalid_email" });
  });
  it("keeps hr@/careers@ mailboxes without a person's name, and marks older sources", () => {
    const r = classifySheetRow({ ...row, email: "careers@zepto.com", category: "Generic company mailbox (hr@/careers@)", confidence: "Older source - verify before use" });
    expect(r).toMatchObject({ ok: true, contact: { category: "generic_mailbox", name: null, quality: "older" } });
  });
  it("ignores placeholder titles and names that are really emails", () => {
    const r = classifySheetRow({ ...row, name: "priya@zepto.com", designation: "HR'S and Hiring Managers" });
    expect(r).toMatchObject({ ok: true, contact: { name: null, role: null } });
  });
  it("doesn't trust a company name derived from the email domain", () => {
    expect(classifySheetRow({ ...row, companySource: "Derived from email domain" })).toMatchObject({ contact: { company: null } });
  });
});

describe("who a fresher writes to", () => {
  it("prefers campus and talent acquisition over HR heads and CXOs", () => {
    const people = [
      { email: "cpo@x.com", role: "Chief People Officer", quality: "recent" },
      { email: "ta@x.com", role: "Talent Acquisition Lead", quality: "recent" },
      { email: "hrbp@x.com", role: "HR Business Partner", quality: "recent" },
      { email: "campus@x.com", role: "Campus Hiring Manager", quality: "older" },
      { email: "careers@x.com", role: null, quality: "recent" },
    ];
    const order = [...people].sort((a, b) => contactScore(b) - contactScore(a)).map((p) => p.email);
    expect(order).toEqual(["ta@x.com", "campus@x.com", "careers@x.com", "hrbp@x.com", "cpo@x.com"]);
  });
  it("ranks a verified address above an older one with the same role", () => {
    expect(contactScore({ email: "a@x.com", role: "Recruiter", verified: true })).toBeGreaterThan(contactScore({ email: "b@x.com", role: "Recruiter", quality: "older" }));
  });
});

describe("CSV", () => {
  it("reads quotes, commas, doubled quotes, CRLF and a byte-order mark", () => {
    const bom = String.fromCharCode(0xfeff);
    const rows = parseCsv(`${bom}Name,Email\r\n"Rao, Priya",p@x.com\r\n"Say ""hi""",h@x.com\n\n`);
    expect(rows).toEqual([["Name", "Email"], ["Rao, Priya", "p@x.com"], ['Say "hi"', "h@x.com"]]);
  });
});
