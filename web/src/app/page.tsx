import type { Metadata } from "next";
import { AlertsDemo } from "@/components/landing/AlertsDemo";
import { HeroVisual } from "@/components/landing/HeroVisual";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Navbar } from "@/components/landing/Navbar";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { ButtonLink } from "@/components/ui/Button";
import { PricingBlock } from "@/components/ui/PricingBlock";
import { ResumeDiff } from "@/components/ui/ResumeDiff";
import { JsonLd, faqSchema, orgSchema, websiteSchema } from "@/lib/seo";
import { whatsappOnSale } from "@/lib/whatsapp/on-sale";
import { FAQ, SAMPLE_DIFF } from "@/lib/sample";

export const metadata: Metadata = {
  title: { absolute: "GeeksFinder — Fresher jobs matched to your resume, on Telegram" },
  alternates: { canonical: "/" },
};

const UPLOAD = "/login?next=/onboarding";

export default function Landing() {
  return (
    <>
      <JsonLd data={[orgSchema(), websiteSchema(), faqSchema(FAQ)]} />
      <Navbar />
      <main>
        <section className="wrap grid gap-12 pb-24 pt-12 md:grid-cols-12 md:items-center md:pt-20 md:pb-32">
          <div className="md:col-span-6">
            <h1 className="max-w-[16ch] text-display font-bold md:text-display-lg">Wake up to jobs that fit your resume.</h1>
            <p className="mt-5 max-w-[52ch] text-body text-ink-2 md:text-h3 md:font-normal">
              Every morning, get fresher jobs matched to your skills on Telegram. Tailor your resume and email HR in one click.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href={UPLOAD}>Upload your resume</ButtonLink>
              <ButtonLink href="#sample-alert" variant="secondary">See a sample alert</ButtonLink>
            </div>
            <p className="mt-3 text-small text-ink-3">Free to start. No card needed.</p>
          </div>
          <div id="sample-alert" className="scroll-mt-24 md:col-span-6">
            <HeroVisual />
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-16 border-t border-line section-pad">
          <div className="wrap">
            <h2 className="text-h2 font-semibold md:text-h2-lg">How it works</h2>
            <HowItWorks />
          </div>
        </section>

        <section className="bg-paper-2 section-pad">
          <div className="wrap">
            <h2 className="text-h2 font-semibold md:text-h2-lg">Same you. Better fit for every job.</h2>
            <p className="mt-2 max-w-[60ch] text-body text-ink-2">We only rephrase what&apos;s already true. We never add skills you don&apos;t have.</p>
            <div className="mt-8">
              <ResumeDiff lines={SAMPLE_DIFF} readOnly />
            </div>
          </div>
        </section>

        <section className="section-pad">
          <div className="wrap">
            <h2 className="text-h2 font-semibold md:text-h2-lg">Alerts your way</h2>
            <p className="mt-2 mb-8 max-w-[60ch] text-body text-ink-2">Choose how often and where. Change it any time.</p>
            <AlertsDemo />
          </div>
        </section>

        <section id="pricing" className="scroll-mt-16 border-t border-line section-pad">
          <div className="wrap">
            <h2 className="mb-8 text-h2 font-semibold md:text-h2-lg">Less than a cup of chai every two weeks.</h2>
            <PricingBlock
              freeAction={<ButtonLink href={UPLOAD} variant="secondary" className="w-full">Start free</ButtonLink>}
              whatsappOnSale={whatsappOnSale()}
            />
          </div>
        </section>

        <section id="faq" className="scroll-mt-16 border-t border-line section-pad">
          <div className="wrap md:grid md:grid-cols-12 md:gap-6">
            <h2 className="text-h2 font-semibold md:col-span-4 md:text-h2-lg">Questions students ask</h2>
            <div className="mt-6 md:col-span-8 md:mt-0">
              {FAQ.map((f) => (
                <details key={f.q} className="group border-b border-line">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-h3 font-semibold [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span aria-hidden className="text-ink-3 transition-transform duration-[280ms] group-open:rotate-45">+</span>
                  </summary>
                  <p className="max-w-[65ch] pb-5 text-body text-ink-2">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-paper-2 section-pad">
          <div className="wrap text-center">
            <h2 className="mx-auto max-w-[24ch] text-h2 font-semibold md:text-h2-lg">Your next interview could start with tomorrow&apos;s alert.</h2>
            <ButtonLink href={UPLOAD} className="mt-8">Upload your resume</ButtonLink>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
