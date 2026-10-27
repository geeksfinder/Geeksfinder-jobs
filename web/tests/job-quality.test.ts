import { describe, expect, it } from "vitest";
import { bestApplyLink, isMiddleman } from "@/lib/job-quality";

describe("apply links", () => {
  it("recognises middleman sites, including subdomains", () => {
    expect(isMiddleman("https://www.jobleads.com/in/job/123")).toBe(true);
    expect(isMiddleman("https://in.jobrapido.com/x")).toBe(true);
    expect(isMiddleman("https://bebee.com/in/jobs/1")).toBe(true);
    expect(isMiddleman("https://jobs.lever.co/zepto/1")).toBe(false);
    expect(isMiddleman("not a url")).toBe(false);
  });
  it("prefers the employer's own page, then a real job board, never a middleman", () => {
    expect(bestApplyLink([{ apply_link: "https://www.jobleads.com/a" }, { apply_link: "https://in.linkedin.com/jobs/1" }, { apply_link: "https://careers.acme.com/1", is_direct: true }])).toBe("https://careers.acme.com/1");
    expect(bestApplyLink([{ apply_link: "https://www.jobleads.com/a" }, { apply_link: "https://randomsite.in/1" }, { apply_link: "https://www.naukri.com/1" }])).toBe("https://www.naukri.com/1");
  });
  it("gives no link when every option is a middleman, so the job is skipped", () => {
    expect(bestApplyLink([{ apply_link: "https://www.jobleads.com/a" }, { apply_link: "https://bebee.com/b" }])).toBeNull();
    expect(bestApplyLink([{ apply_link: "javascript:alert(1)" }])).toBeNull();
  });
});
