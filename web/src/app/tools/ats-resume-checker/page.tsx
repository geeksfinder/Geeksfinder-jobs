import type { Metadata } from "next";
import { PublicShell } from "@/components/landing/PublicShell";
import { ToolCta } from "@/components/landing/ToolCta";
import { JsonLd, faqSchema, webAppSchema } from "@/lib/seo";
import { AtsChecker } from "./AtsChecker";

export const metadata: Metadata = {
  title: "Free ATS resume checker for freshers",
  description: "Check your resume against a job description in seconds. See matched and missing skills and fix what ATS software trips on. Free, no login.",
  alternates: { canonical: "/tools/ats-resume-checker" },
};

const FAQ = [
  { q: "What is an ATS?", a: "An applicant tracking system is software companies use to store and filter applications. It reads your resume as text and looks for the skills and sections the job asks for." },
  { q: "Is my resume uploaded anywhere?", a: "No. This checker runs in your browser. The text you paste never leaves your device." },
  { q: "Should I add every missing skill?", a: "Only the ones you genuinely have. Adding skills you can't explain in an interview does more harm than a lower score." },
];

export default function AtsPage() {
  return (
    <PublicShell>
      <JsonLd data={[faqSchema(FAQ), webAppSchema({ name: "ATS resume checker for freshers", path: "/tools/ats-resume-checker", description: "Check a resume against a job description: matched and missing skills, and what ATS software trips on." })]} />
      <div className="wrap max-w-[56rem] pb-24 pt-10 md:pt-16">
        <h1 className="text-h1 font-bold md:text-h1-lg">ATS resume checker</h1>
        <p className="mt-2 max-w-[60ch] text-body text-ink-2">Paste your resume and the job description. We show which asked skills you have, which are missing, and what to fix. It runs in your browser — nothing is uploaded.</p>
        <AtsChecker />
        <section className="mt-16">
          <h2 className="text-h2 font-semibold">Questions</h2>
          {FAQ.map((f) => (
            <div key={f.q} className="mt-5">
              <h3 className="text-h3 font-semibold">{f.q}</h3>
              <p className="mt-1 max-w-[65ch] text-body text-ink-2">{f.a}</p>
            </div>
          ))}
        </section>
        <ToolCta />
      </div>
    </PublicShell>
  );
}
