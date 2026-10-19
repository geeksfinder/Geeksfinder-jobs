import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/landing/PublicShell";
import { CITIES, ROLES, hubCounts, hubName, hubSlug } from "@/lib/hubs";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Fresher jobs and internships by role and city",
  description: "Fresher jobs and internships in Bengaluru, Delhi NCR, Pune, Hyderabad, Mumbai, Chennai and remote, by role: software, data, testing, design, sales and support.",
  alternates: { canonical: "/jobs" },
};

type Item = { href: string; label: string; count: number };

function LinkList({ items }: { items: Item[] }) {
  return (
    <ul className="mt-2 space-y-0.5">
      {items.map((i) => (
        <li key={i.href}>
          <Link href={i.href} className="inline-flex min-h-9 items-center text-body text-action underline-offset-4 hover:underline">{i.label}</Link>{" "}
          <span className="tabular text-small text-ink-3">{i.count}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function JobsIndex() {
  const counts = new Map(await hubCounts());
  // Without counts (database unreachable) show every link rather than an empty page
  const keep = (i: Item) => !counts.size || i.count > 0;
  const byCount = (a: Item, b: Item) => b.count - a.count;
  const cities = CITIES.map((c) => ({ href: `/jobs/${hubSlug(null, c)}`, label: hubName({ role: null, city: c }), count: counts.get(hubSlug(null, c)) ?? 0 })).filter(keep).sort(byCount);
  const roles = ROLES.map((r) => ({ href: `/jobs/${hubSlug(r, null)}`, label: hubName({ role: r, city: null }), count: counts.get(hubSlug(r, null)) ?? 0 })).filter(keep).sort(byCount);
  const grid = ROLES.map((r) => ({
    role: r,
    items: CITIES.map((c) => ({ href: `/jobs/${hubSlug(r, c)}`, label: c.slug === "remote" ? "Remote" : c.name, count: counts.get(hubSlug(r, c)) ?? 0 })).filter(keep),
  })).filter((g) => g.items.length);

  return (
    <PublicShell>
      <div className="wrap pb-24 pt-8 md:pt-12">
        <h1 className="text-h1 font-bold md:text-h1-lg">Fresher jobs and internships by role and city</h1>
        <p className="mt-2 max-w-[60ch] text-body text-ink-2">Every list is refreshed each morning from licensed job aggregators and company career pages. Numbers show live openings.</p>

        <div className="mt-8 grid gap-8 sm:grid-cols-2">
          {cities.length > 0 && (
            <section>
              <h2 className="text-h3 font-semibold">By city</h2>
              <LinkList items={cities} />
            </section>
          )}
          {roles.length > 0 && (
            <section>
              <h2 className="text-h3 font-semibold">By role, across India</h2>
              <LinkList items={roles} />
            </section>
          )}
        </div>

        {grid.length > 0 && (
          <>
            <h2 className="mt-12 border-t border-line pt-8 text-h3 font-semibold">By role and city</h2>
            <div className="mt-4 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {grid.map((g) => (
                <section key={g.role.slug}>
                  <h3 className="text-body font-semibold">{g.role.name}</h3>
                  <LinkList items={g.items} />
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </PublicShell>
  );
}
