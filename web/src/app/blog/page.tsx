import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/landing/PublicShell";
import { ButtonLink } from "@/components/ui/Button";
import { longDate } from "@/lib/format";
import { publicClient, type Article } from "@/lib/public-data";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Fresher hiring news and career guides",
  description: "Hiring drives, off-campus openings, resume and interview guides, and the skills companies ask for — fact-checked for final-year students in India.",
  alternates: { canonical: "/blog" },
};

export default async function BlogIndex() {
  const db = publicClient();
  const { data } = db
    ? await db.from("articles").select("slug, title, summary, topic, published_at").order("published_at", { ascending: false }).limit(40)
    : { data: [] };
  const [featured, ...rest] = (data ?? []) as Pick<Article, "slug" | "title" | "summary" | "topic" | "published_at">[];

  return (
    <PublicShell>
      <div className="wrap max-w-[50rem] pb-24 pt-10 md:pt-16">
        <h1 className="text-h1 font-bold md:text-h1-lg">GeeksFinder Blog</h1>
        <p className="mt-2 max-w-[60ch] text-body text-ink-2">Hiring news and career guides for final-year students and freshers. Every article is checked for copying and for facts its sources don&apos;t support before it goes live.</p>

        {!featured ? (
          <div className="mt-10 rounded-panel bg-paper-2 p-6">
            <p className="text-body text-ink-2">The first articles are on their way. Meanwhile, get matched jobs every morning.</p>
            <ButtonLink href="/login?next=/onboarding" className="mt-4">Upload your resume</ButtonLink>
          </div>
        ) : (
          <>
            <article className="mt-10 border-b border-line pb-8">
              <p className="text-small text-ink-2">{featured.topic} · {longDate(featured.published_at)}</p>
              <h2 className="mt-1 text-h2 font-semibold md:text-h2-lg">
                <Link href={`/blog/${featured.slug}`} className="underline-offset-4 hover:underline">{featured.title}</Link>
              </h2>
              <p className="mt-2 line-clamp-2 max-w-[65ch] text-body text-ink-2">{featured.summary}</p>
            </article>
            <ul>
              {rest.map((a) => (
                <li key={a.slug} className="border-b border-line py-5">
                  <h2 className="text-h3 font-semibold">
                    <Link href={`/blog/${a.slug}`} className="underline-offset-4 hover:underline">{a.title}</Link>
                  </h2>
                  <p className="mt-1 line-clamp-1 text-body text-ink-2">{a.summary}</p>
                  <p className="mt-1 text-small text-ink-3">
                    <span className="rounded-chip border border-line px-1.5 py-0.5">{a.topic}</span> · {longDate(a.published_at)}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </PublicShell>
  );
}
