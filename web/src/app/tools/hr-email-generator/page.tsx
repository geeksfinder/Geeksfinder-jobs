import type { Metadata } from "next";
import { PublicShell } from "@/components/landing/PublicShell";
import { JsonLd, webAppSchema } from "@/lib/seo";
import { ToolCta } from "@/components/landing/ToolCta";
import { HrEmailTool } from "./HrEmailTool";

export const metadata: Metadata = {
  title: "Free HR email generator for freshers",
  description: "Write a short, personal email to HR for a fresher job in seconds — under 150 words, plus a 300-character LinkedIn note. Free, no login.",
  alternates: { canonical: "/tools/hr-email-generator" },
};

export default function HrEmailPage() {
  return (
    <PublicShell>
      <JsonLd data={webAppSchema({ name: "HR email generator for freshers", path: "/tools/hr-email-generator", description: "Write a short, personal email to HR for a fresher job, plus a 300-character LinkedIn note." })} />
      <div className="wrap max-w-[56rem] pb-24 pt-10 md:pt-16">
        <h1 className="text-h1 font-bold md:text-h1-lg">HR email generator</h1>
        <p className="mt-2 max-w-[60ch] text-body text-ink-2">Paste your resume and the job. We write a short email to HR that mentions two things you&apos;ve actually done, plus a LinkedIn connection note.</p>
        <HrEmailTool />
        <section className="mt-16 max-w-[65ch]">
          <h2 className="text-h2 font-semibold">How to email HR as a fresher</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-body text-ink-2">
            <li>Keep it under 150 words. Recruiters skim on their phone.</li>
            <li>Name the exact role and where you saw it.</li>
            <li>Mention one or two projects that match the job, with the tech you used.</li>
            <li>Attach a one-page PDF resume tailored to the job.</li>
            <li>If there&apos;s no reply in 5 working days, send one short, polite follow-up. Then move on.</li>
          </ol>
        </section>
        <ToolCta />
      </div>
    </PublicShell>
  );
}
