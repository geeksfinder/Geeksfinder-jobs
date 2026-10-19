import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/landing/PublicShell";
import { companiesHiring } from "@/lib/company-pages";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Companies hiring freshers right now",
  description: "Companies with live fresher jobs and internships this week, with how many openings each has. Updated every morning from company career pages and job boards.",
  alternates: { canonical: "/companies" },
};

export default async function CompaniesIndex() {
  const companies = await companiesHiring();
  return (
    <PublicShell>
      <div className="wrap pb-24 pt-8 md:pt-12">
        <h1 className="text-h1 font-bold md:text-h1-lg">Companies hiring freshers right now</h1>
        <p className="mt-2 max-w-[60ch] text-body text-ink-2">Every company with live fresher openings, refreshed each morning. Numbers show open roles.</p>
        {companies.length ? (
          <ul className="mt-8 grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {companies.map((c) => (
              <li key={c.slug}>
                <Link href={`/companies/${c.slug}`} className="inline-flex min-h-9 items-center text-body text-action underline-offset-4 hover:underline">{c.name}</Link>{" "}
                <span className="tabular text-small text-ink-3">{c.jobs}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-8 text-body text-ink-2">No companies to show right now. New jobs arrive every morning.</p>
        )}
      </div>
    </PublicShell>
  );
}
