import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/landing/LegalPage";

export const metadata: Metadata = {
  title: "Editorial policy",
  description: "How GeeksFinder writes hiring news and career guides with AI, the checks every article must pass, when a person reviews it, and how bylines work.",
  alternates: { canonical: "/editorial-policy" },
};

export default function EditorialPolicy() {
  return (
    <LegalPage title="Editorial policy" updated="19 Oct 2026">
      <p>GeeksFinder publishes short hiring news and career guides for final-year students and freshers. Here is exactly how each article is made.</p>
      <h2>How news is written</h2>
      <ol>
        <li>We collect news from Indian tech and business outlets, company newsrooms and news feeds.</li>
        <li>We only write about an event when at least two independent outlets have reported it.</li>
        <li>We extract the facts (who, what, numbers, dates) and keep a link to where each fact came from.</li>
        <li>An AI language model, currently Google Gemini, writes the article from that fact list only. It never sees or rewrites a single source article.</li>
      </ol>
      <h2>How guides are written</h2>
      <p>Guides on resumes, interviews and job searching are written by the same AI model from a topic we choose. When a guide quotes a number, such as how many openings ask for a skill, the number comes from GeeksFinder&apos;s own live job listings.</p>
      <h2>Checks every article must pass</h2>
      <ul>
        <li>No run of 8 or more words copied from any source.</li>
        <li>No number or name that isn&apos;t in the fact list.</li>
        <li>No filler phrases, and a clear structure: an honest title, a summary, subheadings and short paragraphs.</li>
        <li>No near-duplicate of an article we have already published.</li>
        <li>A second AI model reads it as a strict editor and scores how useful and accurate it is for students. Low scores, or any risk of inaccuracy, fail.</li>
      </ul>
      <h2>When a person reviews</h2>
      <p>An article that passes every check is published automatically. Any article that fails a check is held back for a person on our team, who checks it against the sources, edits it and approves it, or rejects it.</p>
      <h2>Bylines</h2>
      <p>Articles published automatically are credited to &quot;GeeksFinder Desk&quot;. Articles a person approved are credited to &quot;GeeksFinder Desk, reviewed by&quot; that person. Both show the date.</p>
      <h2>Sources and corrections</h2>
      <p>Every news article lists and links its sources at the end. If we get something wrong, <Link href="/contact">tell us</Link>. We fix it and add a dated correction note to the article.</p>
      <h2>Independence</h2>
      <p>We don&apos;t accept payment for coverage. Job listings shown under articles are chosen by matching skills, not by payment.</p>
    </LegalPage>
  );
}
