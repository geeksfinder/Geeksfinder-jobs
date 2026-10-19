import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PublicShell } from "@/components/landing/PublicShell";
import { ButtonLink } from "@/components/ui/Button";
import { JobCard } from "@/components/ui/JobCard";
import { longDate } from "@/lib/format";
import { hubName, indexableHubs } from "@/lib/hubs";
import { publicClient, relatedJobs, type Article } from "@/lib/public-data";
import { JsonLd, articleSchema, breadcrumbSchema, fitTitle } from "@/lib/seo";

export const revalidate = 600;

const getArticle = cache(async (slug: string) => {
  const db = publicClient();
  if (!db || !/^[a-z0-9-]{3,120}$/.test(slug)) return null;
  const { data } = await db.from("articles").select("*").eq("slug", slug).maybeSingle();
  return data as Article | null;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = await getArticle((await params).slug);
  if (!a) return { title: "Article not found", robots: { index: false } };
  return {
    title: fitTitle(a.title),
    description: a.summary ?? undefined,
    alternates: { canonical: `/blog/${a.slug}` },
    openGraph: { type: "article", title: a.title, description: a.summary ?? undefined, publishedTime: a.published_at, modifiedTime: a.updated_at ?? undefined, url: `/blog/${a.slug}` },
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const a = await getArticle((await params).slug);
  if (!a) notFound();
  const [jobs, hubs] = await Promise.all([relatedJobs(a.related_skills), indexableHubs()]);
  const browse = hubs.slice(0, 6);

  return (
    <PublicShell>
      <JsonLd
        data={[
          articleSchema({ title: a.title, slug: a.slug, summary: a.summary ?? "", published_at: a.published_at, updated_at: a.updated_at, kind: a.kind, reviewer: a.reviewer_name, auto_published: a.auto_published }),
          breadcrumbSchema([{ name: "Blog", path: "/blog" }, { name: a.title, path: `/blog/${a.slug}` }]),
        ]}
      />
      <article className="mx-auto max-w-reading px-4 pb-20 pt-8 md:pt-14">
        <nav aria-label="Breadcrumb" className="text-small text-ink-2">
          <Link href="/blog" className="underline-offset-4 hover:underline">Blog</Link> <span aria-hidden>/</span> {a.topic}
        </nav>
        <h1 className="mt-3 text-h1 font-bold md:text-h1-lg">{a.title}</h1>
        <p className="mt-4 text-small text-ink-2">
          <Link href="/editorial-policy" className="font-medium text-ink underline-offset-4 hover:underline">GeeksFinder Desk</Link>
          {!a.auto_published && `, reviewed by ${a.reviewer_name}`} · {longDate(a.published_at)}
          {a.updated_at && ` · Updated ${longDate(a.updated_at)}`}
        </p>

        <div className="article mt-8" dangerouslySetInnerHTML={{ __html: a.body_html /* sanitised on publish (lib/markdown.ts) */ }} />

        {a.freshers_note && (
          <aside className="mt-10 rounded-panel border-l-4 border-highlight bg-paper-2 p-5 md:p-6" aria-labelledby="freshers">
            <h2 id="freshers" className="text-h3 font-semibold">What this means for freshers</h2>
            <div className="article mt-3 !text-body" dangerouslySetInnerHTML={{ __html: a.freshers_note }} />
          </aside>
        )}

        {jobs.length > 0 && (
          <section className="mt-12" aria-labelledby="jobs">
            <h2 id="jobs" className="text-h3 font-semibold">Fresher jobs open right now</h2>
            <div className="mt-2">
              {jobs.map((j) => (
                <JobCard key={j.id} job={j} />
              ))}
            </div>
            <ButtonLink href="/login?next=/onboarding" className="mt-4">See all matches</ButtonLink>
          </section>
        )}

        {browse.length > 0 && (
          <section className="mt-12" aria-labelledby="browse">
            <h2 id="browse" className="text-small font-semibold text-ink-2">Browse fresher jobs</h2>
            <ul className="mt-2 space-y-1">
              {browse.map(({ hub, count }) => (
                <li key={hub.slug}>
                  <Link href={`/jobs/${hub.slug}`} className="text-body text-action underline-offset-4 hover:underline">{hubName(hub)}</Link> <span className="tabular text-small text-ink-3">{count}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {a.sources.length > 0 && (
          <section className="mt-12 border-t border-line pt-6" aria-labelledby="sources">
            <h2 id="sources" className="text-small font-semibold text-ink-2">Sources</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-small text-ink-2">
              {a.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener nofollow" className="text-action underline-offset-2 hover:underline">{s.title}</a>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-small text-ink-3">
              {a.auto_published
                ? "Written by GeeksFinder from the sources above and published after passing our automated checks for copying, facts and quality."
                : "Written by GeeksFinder from the sources above and checked by a person before publishing."}{" "}
              Spot an error?{" "}
              <Link href="/contact" className="text-action underline-offset-2 hover:underline">Tell us</Link> and we&apos;ll add a correction note.
            </p>
          </section>
        )}
      </article>
    </PublicShell>
  );
}
