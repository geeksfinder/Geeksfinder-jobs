import { ChevronDown, ExternalLink } from "lucide-react";
import { featureTier } from "@/lib/pricing";
import { notFound } from "next/navigation";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Badge, SkillChip } from "@/components/ui/Highlighter";
import { cleanCompany } from "@/lib/company";
import { MatchScore, type MatchReasons } from "@/components/ui/MatchScore";
import { city, lastDate, timeAgo } from "@/lib/format";
import { formatJobDescription } from "@/lib/jobtext";
import { requireUser } from "@/lib/supabase/server";
import { uuid } from "@/lib/validate";
import { JobActions } from "./JobActions";
import { ReportJob } from "./ReportJob";

export const metadata = { title: "Job" };

export default async function ApplyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { supabase, user } = await requireUser();
  const { id } = await params;
  const { tab } = await searchParams;
  if (!uuid.safeParse(id).success) notFound();

  const [{ data: u }, { data: job }, { data: match }, { data: profile }] = await Promise.all([
    supabase.from("users").select("plan").eq("id", user!.id).single(),
    supabase.from("jobs").select("id, title, company, company_domain, location, remote, description, skills, fresher_friendly, apply_url, posted_at, deadline").eq("id", id).maybeSingle(),
    supabase.from("matches").select("score, reasons").eq("user_id", user!.id).eq("job_id", id).maybeSingle(),
    supabase.from("profiles").select("skills").eq("user_id", user!.id).maybeSingle(),
  ]);
  if (!job) notFound();
  const mine = new Set((profile?.skills ?? []).map((s: string) => s.toLowerCase()));
  const where = job.remote ? "Remote" : city(job.location) || "India";
  const blocks = formatJobDescription(job.description);

  return (
    <>
      <header className="border-b border-line pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <CompanyLogo company={job.company} domain={job.company_domain} size="lg" />
            <div>
              <h1 className="text-h2 font-semibold md:text-h2-lg">{job.title}</h1>
              <p className="text-body text-ink-2">{cleanCompany(job.company)} · {where}{job.deadline ? ` · ${lastDate(job.deadline)}` : job.posted_at ? ` · ${timeAgo(job.posted_at)}` : ""}</p>
            </div>
          </div>
          {match && <MatchScore score={match.score} reasons={match.reasons as MatchReasons} city={where} />}
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {job.fresher_friendly && <Badge>Fresher-friendly</Badge>}
          {job.remote && <Badge>Remote</Badge>}
          {/intern/i.test(job.title) && <Badge>Internship</Badge>}
        </div>
        {job.skills?.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Skills asked">
            {job.skills.map((s: string) => <li key={s}><SkillChip name={s} matched={mine.has(s.toLowerCase())} /></li>)}
          </ul>
        )}
        {job.apply_url && (
          <a href={job.apply_url} target="_blank" rel="noopener nofollow" className="mt-5 inline-flex min-h-11 items-center gap-1.5 text-body font-medium text-action underline-offset-4 hover:underline">
            Apply on the original listing <ExternalLink size={16} strokeWidth={1.5} aria-hidden />
          </a>
        )}
      </header>

      <JobActions jobId={job.id} applyUrl={job.apply_url} plan={featureTier(u?.plan)} initialTab={tab === "email" ? "email" : "tailor"} />

      {blocks.length > 0 && (
        <details className="group mt-10 border-t border-line pt-6">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-chip text-body font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action [&::-webkit-details-marker]:hidden">
            <ChevronDown size={20} strokeWidth={1.5} aria-hidden className="transition-transform duration-[180ms] group-open:rotate-180" />
            Full job description
          </summary>
          <div className="mt-4 max-w-[70ch] space-y-3 text-body text-ink-2">
            {blocks.map((b, i) =>
              b.kind === "heading" ? (
                <h2 key={i} className="pt-3 text-body font-semibold text-ink first:pt-0">{b.text}</h2>
              ) : b.kind === "list" ? (
                <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-ink-3">
                  {b.items.map((it, j) => <li key={j}>{it}</li>)}
                </ul>
              ) : (
                <p key={i}>{b.text}</p>
              ),
            )}
          </div>
        </details>
      )}

      <ReportJob jobId={job.id} />
    </>
  );
}
