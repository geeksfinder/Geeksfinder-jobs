import Link from "next/link";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import type { CompanyListing } from "@/lib/company-pages";

/**
 * "Hiring freshers on GeeksFinder this week": real companies with live fresher jobs today (DESIGN.md Landing).
 * Each links to its company page. A static row: no marquee, no motion.
 */
export function HiringStrip({ companies }: { companies: CompanyListing[] }) {
  if (companies.length < 4) return null;
  const shown = companies.slice(0, 10);
  return (
    <section aria-labelledby="hiring" className="border-y border-line bg-paper-2 py-8">
      <div className="wrap">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="hiring" className="text-small font-semibold text-ink-2">Hiring freshers on GeeksFinder this week</h2>
          <Link href="/companies" className="text-small text-action underline-offset-4 hover:underline">
            All {companies.length} companies
          </Link>
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
          {shown.map((c) => (
            <li key={c.slug}>
              <Link href={`/companies/${c.slug}`} className="group flex min-h-11 items-center gap-3">
                <CompanyLogo company={c.name} domain={c.domain} />
                <span className="min-w-0">
                  <span className="block truncate text-body font-medium text-ink group-hover:underline group-hover:underline-offset-4">{c.name}</span>
                  <span className="tabular block text-small text-ink-3">
                    {c.jobs} {c.jobs === 1 ? "opening" : "openings"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
