import Link from "next/link";
import { featureTier } from "@/lib/pricing";
import { FilterBar, type Filters } from "@/components/app/FilterBar";
import { SaveButton } from "@/components/app/SaveButton";
import { ButtonLink } from "@/components/ui/Button";
import { JobCard } from "@/components/ui/JobCard";
import { EmptyState } from "@/components/ui/Toast";
import { jobFacets } from "@/lib/job-facets";
import { filterRows, searchAllJobs, type JobRow } from "@/lib/job-search";
import { LIMITS, periodStart } from "@/lib/plan";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Matches" };


const DAY = 86_400_000;

export default async function Dashboard({ searchParams }: { searchParams: Promise<Filters> }) {
  const { supabase, user } = await requireUser();
  const f = await searchParams;


  const [{ data: u }, { data: profile }, { data: alerts }, { data: sub }, { data: rows }, { data: tracked }, facets] = await Promise.all([
    supabase.from("users").select("name, plan, telegram_chat_id").eq("id", user!.id).single(),
    supabase.from("profiles").select("skills, preferred_roles, locations, job_type").eq("user_id", user!.id).maybeSingle(),
    supabase.from("alert_settings").select("channels").eq("user_id", user!.id).maybeSingle(),
    supabase.from("subscriptions").select("current_period_end").eq("user_id", user!.id).maybeSingle(),
    supabase
      .from("matches")
      .select("score, reasons, created_at, jobs(id, title, company, company_domain, location, remote, fresher_friendly, skills, posted_at, apply_url)")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .order("score", { ascending: false })
      .limit(100),
    supabase.from("applications").select("job_id, stage").eq("user_id", user!.id),
    jobFacets(),
  ]);
  const plan = featureTier(u?.plan);
  const { data: usage } = await supabase.from("usage").select("tailor_count").eq("user_id", user!.id).eq("period_start", periodStart(plan, sub?.current_period_end)).maybeSingle();
  const savedIds = new Set((tracked ?? []).map((s) => s.job_id));
  const applied = (tracked ?? []).filter((t) => t.stage !== "saved").length;
  const tailorLeft = Math.max(0, LIMITS[plan].tailor - (usage?.tailor_count ?? 0));

  const all = ((rows ?? []) as unknown as JobRow[]).filter((m) => m.jobs);
  // No matches yet (new account, or a thin day): open on All jobs instead of an empty list
  const view = f.view === "all" || (f.view !== "matches" && all.length === 0) ? "all" : "matches";
  if (view === "all") f.view = "all";
  const mySkills = (profile?.skills ?? []) as string[];

  // My matches: filter the user's own scored matches. All jobs: search every live job and score it on the fly.
  const search = view === "all" ? await searchAllJobs(supabase, f, profile ? { ...profile, skills: mySkills } : null, facets.skills.map((s) => s.name)) : null;
  const matches = search ? search.rows : filterRows(all, f);

  const dayAgo = Date.now() - DAY;
  const today = view === "matches" ? matches.filter((m) => new Date(m.created_at).getTime() >= dayAgo) : [];
  const earlier = view === "matches" ? matches.filter((m) => new Date(m.created_at).getTime() < dayAgo) : matches;
  const filtered = Object.entries(f).some(([k, v]) => v && k !== "sort" && k !== "view");
  const newToday = all.filter((m) => new Date(m.created_at).getTime() >= dayAgo).length;

  const ist = new Date(Date.now() + 5.5 * 3_600_000).getUTCHours();
  const hello = ist < 12 ? "Good morning" : ist < 17 ? "Good afternoon" : "Good evening";
  const first = (u?.name ?? "").trim().split(/\s+/)[0];

  const list = (items: JobRow[]) => (
    <div className="panel px-4 md:px-5">
      {items.map((m) => (
        <JobCard
          key={m.jobs.id}
          job={m.jobs}
          score={m.score}
          reasons={m.reasons}
          mySkills={mySkills}
          href={`/apply/${m.jobs.id}`}
          actions={
            <>
              <SaveButton jobId={m.jobs.id} initiallySaved={savedIds.has(m.jobs.id)} />
              <ButtonLink href={`/apply/${m.jobs.id}?tab=tailor`} size="sm">Tailor resume</ButtonLink>
              <ButtonLink href={`/apply/${m.jobs.id}?tab=email`} size="sm" variant="secondary">Email HR</ButtonLink>
            </>
          }
        />
      ))}
    </div>
  );

  return (
    <>
      <h1 className="text-h1 font-bold md:text-h1-lg">{first ? `${hello}, ${first}` : "Your matches"}</h1>
      <p className="mt-1 text-body text-ink-2">
        {newToday > 0 ? `${newToday} new ${newToday === 1 ? "match" : "matches"} today. ` : ""}New jobs arrive every morning, scored against your resume.
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-4">
        {[
          ["New today", newToday, null],
          ["Saved", savedIds.size - applied, "/tracker"],
          ["Applied", applied, "/tracker"],
          [plan === "free" ? "Tailored resume left" : "Tailored left (15 days)", tailorLeft, plan === "free" && tailorLeft === 0 ? "/billing" : null],
        ].map(([label, n, href]) => (
          <div key={label as string} className="bg-paper px-4 py-3">
            <dt className="text-small text-ink-2">{label}</dt>
            <dd className="tabular text-h3 font-semibold text-ink">
              {href ? <Link href={href as string} className="underline-offset-4 hover:underline">{n}</Link> : n}
            </dd>
          </div>
        ))}
      </dl>

      {!profile?.skills?.length && (
        <Notice href="/onboarding" cta="Upload your resume">Upload your resume so we can match jobs to your skills.</Notice>
      )}
      {alerts?.channels?.includes("telegram") && !u?.telegram_chat_id && (
        <Notice href="/alerts" cta="Connect Telegram">Connect Telegram to get these jobs every morning.</Notice>
      )}
      {plan === "free" && tailorLeft === 0 && (
        <p className="mt-4 text-small text-ink-2">
          You&apos;ve used your free tailored resume.{" "}
          <Link href="/billing" className="text-action underline-offset-4 hover:underline">Get 10 every 15 days, from ₹10</Link>
        </p>
      )}

      <nav aria-label="Job list" className="mt-6 inline-flex rounded-control border border-line p-1">
        {([["matches", "My matches", all.length], ["all", "All jobs", facets.total]] as const).map(([v, label, n]) => (
          <Link
            key={v}
            href={`/dashboard?view=${v}`}
            aria-current={view === v ? "page" : undefined}
            className={`inline-flex h-10 items-center gap-1.5 rounded-chip px-4 text-small font-medium transition-colors duration-[180ms] ${view === v ? "bg-ink text-white" : "text-ink-2 hover:text-ink"}`}
          >
            {label} <span className={`tabular ${view === v ? "text-white" : "text-ink-3"}`}>{n}</span>
          </Link>
        ))}
      </nav>

      <FilterBar f={f} roles={facets.roles} skills={facets.skills} cities={facets.cities} count={matches.length} total={search?.total} />

      <div className="mt-4 space-y-8">
        {matches.length === 0 ? (
          filtered || view === "all" ? (
            <EmptyState
              text={view === "all" ? "No jobs for these filters yet. Try a nearby city, a broader role or remove a filter." : "None of your matches fit these filters. Try All jobs to search every listing."}
              action={<ButtonLink href={view === "all" ? "/dashboard?view=all" : `/dashboard?${new URLSearchParams({ ...(f as Record<string, string>), view: "all" })}`} variant="secondary">{view === "all" ? "Clear filters" : "Search all jobs"}</ButtonLink>}
            />
          ) : (
            <EmptyState
              text={profile?.skills?.length ? "No matches yet. Add 3 more skills to widen your results." : "Upload your resume and your first matches appear after the next morning run."}
              action={<ButtonLink href={profile?.skills?.length ? "/resumes" : "/onboarding"} variant="secondary">{profile?.skills?.length ? "Edit skills" : "Upload your resume"}</ButtonLink>}
            />
          )
        ) : (
          <>
            {today.length > 0 && (
              <section aria-labelledby="new-today">
                <h2 id="new-today" className="mb-3 text-small font-semibold text-ink-2">New today</h2>
                {list(today)}
              </section>
            )}
            {earlier.length > 0 && (
              <section aria-labelledby="earlier">
                <h2 id="earlier" className="mb-3 text-small font-semibold text-ink-2">{view === "all" ? (f.sort === "new" ? "Newest jobs" : "Best fit for your resume") : "Earlier"}</h2>
                {list(earlier)}
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}

function Notice({ href, cta, children }: { href: string; cta: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 flex flex-col items-start justify-between gap-3 rounded-panel bg-paper-2 p-4 sm:flex-row sm:items-center">
      <p className="text-body">{children}</p>
      <ButtonLink href={href} size="sm" variant="secondary">{cta}</ButtonLink>
    </div>
  );
}
