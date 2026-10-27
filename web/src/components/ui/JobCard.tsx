import Link from "next/link";
import { cleanCompany } from "@/lib/company";
import { city, timeAgo } from "@/lib/format";
import { CompanyLogo } from "./CompanyLogo";
import { Badge, SkillChip } from "./Highlighter";
import { MatchScore, gapText, reasonText, type MatchReasons } from "./MatchScore";

export type JobCardJob = {
  id: string;
  title: string;
  company: string;
  company_domain?: string | null;
  location: string | null;
  remote: boolean | null;
  fresher_friendly: boolean | null;
  skills: string[];
  posted_at: string | null;
};

type Props = {
  job: JobCardJob;
  score?: number;
  reasons?: MatchReasons;
  /** Skills the viewer has; matched ones get the highlighter. */
  mySkills?: string[];
  href?: string;
  actions?: React.ReactNode;
  /** "Worth a look" rows: say what's missing instead of why it fits (the score stays hidden under 60). */
  showGap?: boolean;
};

/**
 * Flat row (DESIGN.md §6). Top: company tile, title, meta + badges, score on the right.
 * Bottom: skill chips and actions — aligned under the title on tablet/desktop, full width on mobile.
 */
export function JobCard({ job, score, reasons, mySkills, href, actions, showGap }: Props) {
  const mine = new Set((mySkills ?? reasons?.matched_skills ?? []).map((s) => s.toLowerCase()));
  const skills = [...job.skills].sort((a, b) => Number(mine.has(b.toLowerCase())) - Number(mine.has(a.toLowerCase()))).slice(0, 4);
  const intern = /intern/i.test(job.title);
  const where = job.remote ? "Remote" : city(job.location) || "India";
  const hasFooter = skills.length > 0 || Boolean(actions);
  const why = reasons && score !== undefined && score >= 60 ? reasonText(reasons, where) : "";
  const gap = showGap && reasons ? gapText(reasons) : "";

  return (
    <article className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 gap-y-4 border-b border-line py-5 last:border-b-0">
      <CompanyLogo company={job.company} domain={job.company_domain} />

      <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h3 className="text-h3 font-semibold text-ink">
            {href ? (
              <Link href={href} className="rounded-chip underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action">
                {job.title}
              </Link>
            ) : (
              job.title
            )}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <p className="text-small text-ink-3">
              {cleanCompany(job.company)} · {where}
              {job.posted_at ? ` · ${timeAgo(job.posted_at)}` : ""}
            </p>
            {job.fresher_friendly && <Badge>Fresher-friendly</Badge>}
            {job.remote && <Badge>Remote</Badge>}
            {intern && <Badge>Internship</Badge>}
          </div>
          {why && <p className="mt-1.5 text-small text-ink-2">Why it fits: {why}</p>}
          {gap && <p className="mt-1.5 text-small text-ink-2">What&apos;s missing: {gap}</p>}
        </div>
        {score !== undefined && (
          <div className="shrink-0 sm:pt-0.5">
            <MatchScore score={score} reasons={reasons} city={where} />
          </div>
        )}
      </div>

      {hasFooter && (
        <div className="col-span-2 flex flex-col gap-3 sm:col-span-1 sm:col-start-2 md:flex-row md:items-center md:justify-between">
          {skills.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Skills asked">
              {skills.map((s) => (
                <li key={s}>
                  <SkillChip name={s} matched={mine.has(s.toLowerCase())} />
                </li>
              ))}
            </ul>
          ) : (
            <span />
          )}
          {actions && <div className="flex items-center gap-2 md:shrink-0 [&>a]:flex-1 md:[&>a]:flex-none">{actions}</div>}
        </div>
      )}
    </article>
  );
}
