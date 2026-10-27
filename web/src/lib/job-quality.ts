/**
 * Where a job's Apply button may send a student. Middleman sites re-host listings behind a sign-up wall or a paid
 * "premium" plan (JobLeads, beBee, Jobrapido…), so students land somewhere that isn't the employer. Used by the
 * job fetch (scripts/cron.ts) to pick each job's apply link, and by the clean-up of jobs already saved.
 */

// Aggregators that redirect, wall or upsell instead of letting students apply. Add a site here to stop using it.
const MIDDLEMEN = [
  "jobleads.com",
  "bebee.com",
  "jobrapido.com",
  "jooble.org",
  "jobsora.com",
  "whatjobs.com",
  "talent.com",
  "recruit.net",
  "careerjet.co.in",
  "careerjet.com",
  "jobisjob.co.in",
  "jobtome.com",
  "jobvertise.com",
  "mitula.in",
  "trovit.co.in",
  // Fresher "hiring news" blogs: an ad-filled repost that links on to the employer's own page
  "freshersdunia.in",
];

// Real job boards where students can actually apply; preferred after the employer's own page
const TRUSTED_BOARDS = ["linkedin.com", "naukri.com", "indeed.com", "indeed.co.in", "glassdoor.co.in", "glassdoor.com", "foundit.in", "shine.com", "internshala.com", "apna.co", "instahyre.com", "wellfound.com", "cutshort.io", "iimjobs.com", "hirist.tech", "timesjobs.com"];

const hostOf = (url: string): string | null => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.hostname.toLowerCase().replace(/^www\./, "") : null;
  } catch {
    return null;
  }
};
const onList = (host: string, list: string[]) => list.some((d) => host === d || host.endsWith(`.${d}`));

export const isMiddleman = (url: string | null | undefined): boolean => {
  const h = url ? hostOf(url) : null;
  return !!h && onList(h, MIDDLEMEN);
};

export type ApplyOption = { apply_link?: string | null; is_direct?: boolean | null; publisher?: string | null };

/**
 * The best apply link from what a feed offers: the employer's own page first, then a trusted job board, then any
 * other site. Middleman sites are never chosen. null = every link was a middleman (or none was valid): skip the job.
 */
export function bestApplyLink(options: ApplyOption[]): string | null {
  const usable = options.filter((o): o is ApplyOption & { apply_link: string } => !!o.apply_link && !!hostOf(o.apply_link) && !isMiddleman(o.apply_link));
  const rank = (o: { apply_link: string; is_direct?: boolean | null }) => (o.is_direct ? 0 : onList(hostOf(o.apply_link)!, TRUSTED_BOARDS) ? 1 : 2);
  return usable.sort((a, b) => rank(a) - rank(b))[0]?.apply_link ?? null;
}
