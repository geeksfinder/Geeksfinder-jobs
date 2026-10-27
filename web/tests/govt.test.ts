import { describe, expect, it } from "vitest";
import { govtListPrompt, govtNoticePrompt } from "@/lib/ai";
import { advertLink, govtDescription, isoDate, onDomain, pageLinks, todayIst, type GovtNotice } from "@/lib/govt";
import { countHubs, parseHub } from "@/lib/hubs";

// Shaped like bel-india.in/job-notifications: a heading, then a generic "Click here" link to the advert PDF
const BEL = `<nav><a href="/about">About</a></nav>
<h2>RECRUITMENT FOR THE POST OF PROBATIONARY ENGINEER (E-II GRADE) ON ALL INDIA BASIS</h2><h3>Advertisements</h3>
<div><a href="https://bel-india.in/wp-content/uploads/2026/10/External-Ad-2026-English-1.pdf" class="file-link">
  Click here to view the detailed advertisement - [pdf, 522.58 KB]</a></div>
<a href="https://jobapply.in/BEL2026">Click here to apply</a>
<a href="javascript:void(0)">Menu</a><a href="mailto:hr@bel.co.in">Mail</a>
<script>var x = "<a href='https://evil.example/x.pdf'>Recruitment</a>";</script>`;

describe("reading an official careers page", () => {
  const links = pageLinks(BEL, "https://bel-india.in/job-notifications/");
  it("keeps each link with the heading before it", () => {
    const pdf = links.find((l) => l.url.endsWith("External-Ad-2026-English-1.pdf"))!;
    expect(pdf.text).toMatch(/^Click here to view the detailed advertisement/);
    expect(pdf.context).toContain("PROBATIONARY ENGINEER");
    expect(links.find((l) => l.url.endsWith("/about"))?.url).toBe("https://bel-india.in/about");
  });
  it("skips script, mail and javascript links", () => {
    expect(links.some((l) => l.url.includes("evil.example"))).toBe(false);
    expect(links.some((l) => /^(javascript|mailto):/.test(l.url))).toBe(false);
  });
  it("only trusts the organisation's own domain", () => {
    expect(onDomain("https://bel-india.in/x.pdf", "bel-india.in")).toBe(true);
    expect(onDomain("https://careers.ntpc.co.in/recruitment/", "ntpc.co.in")).toBe(true);
    expect(onDomain("https://jobapply.in/BEL2026", "bel-india.in")).toBe(false);
    expect(onDomain("https://bel-india.in.evil.com/x", "bel-india.in")).toBe(false);
    expect(onDomain("not a url", "bel-india.in")).toBe(false);
  });
});

describe("notice pages that link their advertisement (Coal India)", () => {
  const page = `<a href="https://cdn.example.net/documents/hindi_adv.pdf">विज्ञापन संख्या 07 2026</a>
    <a href="https://cdn.example.net/documents/FAQ.pdf">FAQ vide No 02/2026</a>
    <a href="https://cdn.example.net/documents/Scribe_Form.pdf">Scribe form</a>
    <a href="https://cdn.example.net/documents/Advt.062026.pdf">Advt.062026</a>`;
  it("picks the English advertisement, not the Hindi copy, FAQ or forms", () => {
    expect(advertLink(pageLinks(page, "https://www.coalindia.in/x/"))?.url).toBe("https://cdn.example.net/documents/Advt.062026.pdf");
    expect(advertLink(pageLinks(`<a href="/a.pdf">Scribe form</a>`, "https://x.in/"))).toBeNull();
  });
});

describe("dates and the job text", () => {
  it("accepts only real dates", () => {
    expect(isoDate("2026-11-18")).toBe("2026-11-18");
    expect(isoDate("2026-02-30")).toBeNull();
    expect(isoDate("18.11.2026")).toBeNull();
    expect(isoDate(null)).toBeNull();
    expect(todayIst(Date.UTC(2026, 9, 27, 19, 0))).toBe("2026-10-28");
  });
  it("writes the job page from the notice, ending with the official link", () => {
    const n: GovtNotice = {
      is_opening: true,
      fresher_ok: true,
      title: "Probationary Engineer",
      posts: [{ name: "Probationary Engineer (Electronics)", vacancies: 175, qualification: "B.E./B.Tech", branches: ["Electronics", "Mechanical"] }],
      last_date: "2026-11-18",
      location: "India",
      age_limit: "25 years",
      how_to_apply: "Apply online on the BEL website.",
      summary: "Entry-level engineer posts at BEL for fresh graduates.",
    };
    const src = { id: "bel", name: "Bharat Electronics (BEL)", url: "", domain: "bel-india.in", company_domain: "bel-india.in" };
    const text = govtDescription(n, src, "https://bel-india.in/ad.pdf", "2026-11-18");
    expect(text).toContain("Probationary Engineer (Electronics) (175 posts): B.E./B.Tech. Branches: Electronics, Mechanical");
    expect(text).toContain("Last date to apply\n2026-11-18");
    expect(text.trim().endsWith("https://bel-india.in/ad.pdf")).toBe(true);
  });
});

describe("prompts keep page text as data", () => {
  it("wraps page links and notices in untrusted blocks", () => {
    expect(govtListPrompt("BEL", "2026-10-28", "1. x | y | https://bel-india.in/a")).toMatch(/<untrusted_links>[\s\S]*<\/untrusted_links>/);
    expect(govtNoticePrompt("BEL", "t", "2026-10-28", "notice text")).toMatch(/<untrusted_notice>\nnotice text\n<\/untrusted_notice>/);
    expect(govtNoticePrompt("BEL", "t", "2026-10-28", "", true)).toContain("attached PDF");
  });
});

describe("Govt and PSU job page", () => {
  it("counts jobs by where they came from, not their title", () => {
    const counts = countHubs([
      { title: "Probationary Engineer", location: "India", remote: false, source: "govt:bel" },
      { title: "Graduate Engineer Trainee", location: "Pune", remote: false, source: "greenhouse" },
    ]);
    expect(counts.get("govt-psu-fresher-jobs")).toBe(1);
    expect(parseHub("govt-psu-fresher-jobs")?.role?.name).toBe("Govt and PSU");
  });
});
