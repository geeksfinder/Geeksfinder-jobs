import { hubName, indexableHubs } from "@/lib/hubs";
import { SITE } from "@/lib/site";

export const revalidate = 3600;

/**
 * /llms.txt (llmstxt.org): a plain map of the site for AI search tools, built from live data so it only lists job
 * pages that Google may index (10+ live jobs). Facts only: what the site is, where the data comes from, key pages.
 */
export async function GET() {
  const hubs = (await indexableHubs().catch(() => [])).slice(0, 40);
  const lines = [
    `# ${SITE.name}`,
    "",
    `> ${SITE.description}`,
    "",
    "GeeksFinder is for final-year students and freshers in India (B.E./B.Tech, diploma and other graduates, every branch).",
    "Jobs are fetched every morning at 6:00 IST from company career boards, official Govt & PSU careers pages and job",
    "feeds; senior posts, posts asking 4+ years and middleman reposts are removed. Each job page states its live count",
    "and the date it was updated. Students can upload a resume to get matched jobs on Telegram or email at 7:30 IST.",
    "",
    "## Fresher jobs (updated daily)",
    "",
    ...hubs.map(({ hub, count }) => `- [${hubName(hub)}](${SITE.url}/jobs/${hub.slug}): ${count} live openings`),
    `- [All job pages](${SITE.url}/jobs)`,
    `- [Companies hiring freshers](${SITE.url}/companies)`,
    "",
    "## Free tools",
    "",
    `- [ATS resume checker](${SITE.url}/tools/ats-resume-checker): matched and missing skills for a job description, for every engineering branch; the resume is read on the device`,
    `- [HR email generator](${SITE.url}/tools/hr-email-generator): a short email and LinkedIn note to a recruiter`,
    "",
    "## About",
    "",
    `- [Blog](${SITE.url}/blog): hiring news and guides for freshers`,
    `- [About](${SITE.url}/about) · [Editorial policy](${SITE.url}/editorial-policy) · [Contact](${SITE.url}/contact)`,
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
