import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PublicShell } from "@/components/landing/PublicShell";
import { ButtonLink } from "@/components/ui/Button";
import { JobCard } from "@/components/ui/JobCard";
import { companiesHiring, companyLinkFinder } from "@/lib/company-pages";
import { CITIES, HUB_MIN_JOBS, ROLES, hubAnswer, hubCounts, hubJobs, hubName, hubSlug, hubStats, parseHub } from "@/lib/hubs";
import { JsonLd, breadcrumbSchema, faqSchema, fitTitle } from "@/lib/seo";

export const revalidate = 3600;

const load = cache(async (slug: string) => {
  const hub = parseHub(slug);
  if (!hub) return null;
  const jobs = await hubJobs(hub);
  return { hub, jobs, stats: hubStats(jobs), name: hubName(hub) };
});

export async function generateMetadata({ params }: { params: Promise<{ hub: string }> }): Promise<Metadata> {
  const d = await load((await params).hub);
  if (!d) return { title: "Not found", robots: { index: false } };
  const n = d.stats.total;
  return {
    title: fitTitle(`${d.name} (Updated Daily)`, d.name),
    description: `${n >= 60 ? "60+" : n} live ${d.name.charAt(0).toLowerCase()}${d.name.slice(1)}. See the skills companies ask for, who is hiring this week, and get matches on Telegram every morning.`,
    alternates: { canonical: `/jobs/${d.hub.slug}` },
    // Thin hubs stay out of the index (plan §8)
    robots: n >= HUB_MIN_JOBS ? { index: true, follow: true } : { index: false, follow: true },
  };
}

type LinkItem = { href: string; label: string; count: number };

export default async function HubPage({ params }: { params: Promise<{ hub: string }> }) {
  const d = await load((await params).hub);
  if (!d) notFound();
  const { hub, jobs, stats, name } = d;
  const [hubCountList, hiring] = await Promise.all([hubCounts(), companiesHiring()]);
  const counts = new Map(hubCountList);
  const companyLink = companyLinkFinder(hiring);
  const item = (role: (typeof ROLES)[number] | null, city: (typeof CITIES)[number] | null): LinkItem => {
    const slug = hubSlug(role, city);
    return { href: `/jobs/${slug}`, label: hubName({ role, city }), count: counts.get(slug) ?? 0 };
  };
  // Related hubs that have live jobs, biggest first; links to empty pages help nobody
  const live = (xs: LinkItem[]) => xs.filter((x) => x.count > 0).sort((a, b) => b.count - a.count).slice(0, 6);
  const groups: { title: string; links: LinkItem[] }[] = [];
  if (hub.role && hub.city) {
    groups.push({ title: "Wider searches", links: [item(hub.role, null), item(null, hub.city)].filter((x) => x.count > 0) });
    groups.push({ title: `${hub.role.name} jobs in other cities`, links: live(CITIES.filter((c) => c.slug !== hub.city!.slug).map((c) => item(hub.role, c))) });
    groups.push({ title: `Other roles ${hub.city.slug === "remote" ? "(remote)" : `in ${hub.city.name}`}`, links: live(ROLES.filter((r) => r.slug !== hub.role!.slug).map((r) => item(r, hub.city))) });
  } else if (hub.role) {
    groups.push({ title: `${hub.role.name} jobs by city`, links: live(CITIES.map((c) => item(hub.role, c))) });
    groups.push({ title: "Other roles", links: live(ROLES.filter((r) => r.slug !== hub.role!.slug).map((r) => item(r, null))) });
  } else if (hub.city) {
    groups.push({ title: `Roles ${hub.city.slug === "remote" ? "(remote)" : `in ${hub.city.name}`}`, links: live(ROLES.map((r) => item(r, hub.city))) });
    groups.push({ title: "Other cities", links: live(CITIES.filter((c) => c.slug !== hub.city!.slug).map((c) => item(null, c))) });
  }
  const shown = groups.filter((g) => g.links.length);
  // The page loads the newest 60; the true live count comes from the hub index (llms.txt and the sitemap use it too)
  const liveCount = Math.max(stats.total, counts.get(hub.slug) ?? 0);
  const answer = hubAnswer(name, { ...stats, total: liveCount });

  return (
    <PublicShell>
      <JsonLd data={[breadcrumbSchema([{ name: "Jobs", path: "/jobs" }, { name, path: `/jobs/${hub.slug}` }]), ...(answer.faq.length ? [faqSchema(answer.faq.map(({ q, a }) => ({ q, a })))] : [])]} />
      <div className="wrap pb-24 pt-8 md:pt-12">
        <nav aria-label="Breadcrumb" className="text-small text-ink-2">
          <Link href="/jobs" className="underline-offset-4 hover:underline">Jobs</Link> <span aria-hidden>/</span> {hub.role?.name ?? hub.city?.name}
        </nav>
        <h1 className="mt-3 max-w-[30ch] text-h1 font-bold md:text-h1-lg">{name}</h1>
        {/* One dated, specific sentence that answers the search (AEO); the FAQ markup above says the same */}
        <p className="mt-2 max-w-[70ch] text-body text-ink-2">{answer.summary}</p>

        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-3">
          <div className="bg-paper p-4"><dt className="text-small text-ink-2">Live openings</dt><dd className="tabular text-h2 font-semibold">{liveCount}</dd></div>
          <div className="bg-paper p-4"><dt className="text-small text-ink-2">Posted this week</dt><dd className="tabular text-h2 font-semibold">{stats.thisWeek}</dd></div>
          <div className="col-span-2 bg-paper p-4 sm:col-span-1">
            <dt className="text-small text-ink-2">Top hiring</dt>
            <dd className="text-body font-medium">
              {stats.companies.length
                ? stats.companies.slice(0, 3).map(([c], i) => {
                    const slug = companyLink(c);
                    return (
                      <span key={c}>
                        {i > 0 && ", "}
                        {slug ? <Link href={`/companies/${slug}`} className="text-action underline-offset-4 hover:underline">{c}</Link> : c}
                      </span>
                    );
                  })
                : "—"}
            </dd>
          </div>
        </dl>

        {stats.skills.length > 0 && (
          <section className="mt-8">
            <h2 className="text-h3 font-semibold">Skills companies ask for</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {stats.skills.map(([s, n]) => (
                <li key={s} className="inline-flex h-8 items-center gap-1.5 rounded-chip border border-line px-2.5 text-small">
                  {s} <span className="tabular text-ink-3">{n}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-h3 font-semibold">Latest openings</h2>
            <ButtonLink href="/login?next=/onboarding" size="sm">Get these matched to your resume</ButtonLink>
          </div>
          {jobs.length ? (
            <div className="mt-2">{jobs.slice(0, 25).map((j) => <JobCard key={j.id} job={j} />)}</div>
          ) : (
            <p className="mt-4 text-body text-ink-2">No live openings right now. New jobs are added every morning.</p>
          )}
        </section>

        {shown.length > 0 && (
          <section className="mt-12 grid gap-8 border-t border-line pt-8 md:grid-cols-3">
            {shown.map((g) => (
              <div key={g.title}>
                <h2 className="text-small font-semibold text-ink-2">{g.title}</h2>
                <ul className="mt-2 space-y-1">
                  {g.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="text-body text-action underline-offset-4 hover:underline">{l.label}</Link> <span className="tabular text-small text-ink-3">{l.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}
      </div>
    </PublicShell>
  );
}
