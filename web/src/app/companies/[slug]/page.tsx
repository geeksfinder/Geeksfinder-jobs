import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PublicShell } from "@/components/landing/PublicShell";
import { ButtonLink } from "@/components/ui/Button";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { JobCard } from "@/components/ui/JobCard";
import { COMPANY_MIN_JOBS, companiesHiring, companyHasHr, companyJobs, getCompany, hiringCities } from "@/lib/company-pages";
import { hubStats } from "@/lib/hubs";
import { SITE } from "@/lib/site";
import { JsonLd, breadcrumbSchema, fitTitle } from "@/lib/seo";

export const revalidate = 3600;

const load = cache(async (slug: string) => {
  const company = await getCompany(slug);
  if (!company) return null;
  const jobs = await companyJobs(company);
  // A page only when there's something to apply to; no empty company profiles
  if (!jobs.length) return null;
  return { company, jobs, stats: hubStats(jobs), cities: hiringCities(jobs) };
});

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await load((await params).slug);
  if (!d) return { title: "Company not found", robots: { index: false } };
  const { company, stats, cities } = d;
  return {
    title: fitTitle(`${company.name} jobs for freshers (Updated Daily)`, `${company.name} jobs for freshers`),
    description: `${stats.total} live fresher openings at ${company.name}${cities.length ? ` in ${list(cities.slice(0, 3))}` : ""}. See the skills ${company.name} asks for and get matched jobs on Telegram every morning.`,
    alternates: { canonical: `/companies/${company.slug}` },
    robots: stats.total >= COMPANY_MIN_JOBS ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const d = await load((await params).slug);
  if (!d) notFound();
  const { company, jobs, stats, cities } = d;
  const [hasHr, hiring] = await Promise.all([companyHasHr(company), companiesHiring()]);
  const others = hiring.filter((c) => c.slug !== company.slug).slice(0, 8);

  return (
    <PublicShell>
      <JsonLd
        data={[
          { "@context": "https://schema.org", "@type": "Organization", name: company.name, url: `https://${company.domain}`, logo: `${SITE.url}/api/logo/${company.domain}` },
          breadcrumbSchema([{ name: "Companies", path: "/companies" }, { name: company.name, path: `/companies/${company.slug}` }]),
        ]}
      />
      <div className="wrap pb-24 pt-8 md:pt-12">
        <nav aria-label="Breadcrumb" className="text-small text-ink-2">
          <Link href="/companies" className="underline-offset-4 hover:underline">Companies</Link> <span aria-hidden>/</span> {company.name}
        </nav>
        <div className="mt-3 flex items-center gap-4">
          <CompanyLogo company={company.name} domain={company.domain} size="lg" />
          <h1 className="max-w-[30ch] text-h1 font-bold md:text-h1-lg">{company.name} jobs for freshers</h1>
        </div>
        {cities.length > 0 && <p className="mt-2 text-body text-ink-2">Hiring in {list(cities.slice(0, 4))}.</p>}

        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-3">
          <div className="bg-paper p-4"><dt className="text-small text-ink-2">Live fresher openings</dt><dd className="tabular text-h2 font-semibold">{stats.total}</dd></div>
          <div className="bg-paper p-4"><dt className="text-small text-ink-2">Posted this week</dt><dd className="tabular text-h2 font-semibold">{stats.thisWeek}</dd></div>
          <div className="col-span-2 bg-paper p-4 sm:col-span-1">
            <dt className="text-small text-ink-2">Email HR</dt>
            <dd className="text-body font-medium">{hasHr ? "HR email on file" : "LinkedIn note only"}</dd>
          </div>
        </dl>
        <p className="mt-3 max-w-[60ch] text-small text-ink-2">
          {hasHr
            ? `Sign in, open any ${company.name} job below and tap Email HR: we draft a short, personal email to their HR team for you to send.`
            : `We don't have an HR email for ${company.name} yet. Open a job and we'll draft a LinkedIn note you can send instead.`}
        </p>

        {stats.skills.length > 0 && (
          <section className="mt-8">
            <h2 className="text-h3 font-semibold">Skills {company.name} asks for</h2>
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
          <div className="mt-2">{jobs.slice(0, 25).map((j) => <JobCard key={j.id} job={j} />)}</div>
        </section>

        {others.length > 0 && (
          <section className="mt-12 border-t border-line pt-8">
            <h2 className="text-small font-semibold text-ink-2">Other companies hiring freshers</h2>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
              {others.map((c) => (
                <li key={c.slug}>
                  <Link href={`/companies/${c.slug}`} className="text-body text-action underline-offset-4 hover:underline">{c.name}</Link> <span className="tabular text-small text-ink-3">{c.jobs}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </PublicShell>
  );
}
