import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/landing/LegalPage";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "About", description: "Why GeeksFinder exists, who runs it, and what it won't do: no applying on your behalf, no LinkedIn scraping, no job promises and no selling your data.", alternates: { canonical: "/about" } };

export default function About() {
  return (
    <LegalPage title="About GeeksFinder">
      <p>
        GeeksFinder helps final-year students and freshers in India find jobs that fit what they can actually do, apply with a resume that fits each job, and reach the person hiring.
      </p>
      <p>
        Most job portals show the same generic listings to everyone. Students at colleges with few campus drives spend hours searching, rewriting resumes and guessing whom to email. We do the searching every morning, score each job against your resume, and send the best ones to Telegram.
      </p>
      {/* TODO(founder): replace this paragraph with your real founder story, name, city and photo — plan §8 trust signals. */}
      <p>
        GeeksFinder is built and run by a small team in India. Paid plans start at ₹10 every 15 days because students told us that&apos;s what they can pay without thinking twice — and because a small, fair price keeps us honest about delivering value every morning.
      </p>
      <h2>What we don&apos;t do</h2>
      <ul>
        <li>We don&apos;t apply to jobs for you. You click Apply and apply yourself.</li>
        <li>We don&apos;t scrape LinkedIn or send automated LinkedIn messages.</li>
        <li>We don&apos;t promise jobs or placements.</li>
        <li>We don&apos;t sell your data or our HR contact list.</li>
      </ul>
      <h2>Contact</h2>
      <p>
        Email <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> or message us on <a href={`https://t.me/${SITE.channel}`}>Telegram</a>. Read how our news articles are made in the <Link href="/editorial-policy">editorial policy</Link>.
      </p>
    </LegalPage>
  );
}
