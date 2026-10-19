import type { Metadata } from "next";
import Link from "next/link";
import { AlertsDemo } from "@/components/landing/AlertsDemo";
import { HeroVisual } from "@/components/landing/HeroVisual";
import { HiringStrip } from "@/components/landing/HiringStrip";
import { MorningStory } from "@/components/landing/MorningStory";
import { Navbar } from "@/components/landing/Navbar";
import { OldVsNew } from "@/components/landing/OldVsNew";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { ButtonLink } from "@/components/ui/Button";
import { PricingBlock } from "@/components/ui/PricingBlock";
import { landingStats } from "@/lib/landing-stats";
import { JsonLd, faqSchema, orgSchema, websiteSchema } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { whatsappOnSale } from "@/lib/whatsapp/on-sale";
import { FAQ } from "@/lib/sample";

export const metadata: Metadata = {
  title: { absolute: "GeeksFinder — Fresher jobs matched to your resume, on Telegram" },
  alternates: { canonical: "/" },
};

// Live numbers refresh hourly; the page itself stays static between refreshes
export const revalidate = 3600;

const UPLOAD = "/login?next=/onboarding";

/** Landing, story version (DESIGN.md Landing, approved 19 Oct 2026). Light only; real numbers only. */
export default async function Landing() {
  const stats = await landingStats();
  const live = [
    stats.liveFresher !== null && stats.liveFresher > 0 && `${stats.liveFresher.toLocaleString("en-IN")} fresher jobs live`,
    stats.companies.length > 0 && `${stats.companies.length} companies hiring`,
  ].filter(Boolean) as string[];

  return (
    <>
      <JsonLd data={[orgSchema(), websiteSchema(), faqSchema(FAQ)]} />
      <Navbar />
      <main>
        <section className="wrap grid gap-12 pb-20 pt-12 md:grid-cols-12 md:items-center md:pb-28 md:pt-20">
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
            {live.length > 0 && (
              <p className="mt-6 flex items-baseline gap-2 text-small text-ink-2">
                <span aria-hidden className="size-2 shrink-0 translate-y-[-1px] rounded-full bg-success" />
                <span>
                  <span className="tabular">{live.join(" · ")}</span> <span className="text-ink-3">· updated every morning at 6</span>
                </span>
              </p>
            )}
          </div>
          <div id="sample-alert" className="scroll-mt-24 md:col-span-6">
            <HeroVisual />
          </div>
        </section>

        <HiringStrip companies={stats.companies} />

        <section id="how-it-works" className="scroll-mt-16 section-pad">
          <div className="wrap">
            <h2 className="text-h2 font-semibold md:text-h2-lg">A morning with GeeksFinder</h2>
            <p className="mt-2 max-w-[60ch] font-serif text-h3 italic text-ink-2">Meet Priya, a final-year CSE student in Kolhapur. Here&apos;s her Tuesday.</p>
            <MorningStory newToday={stats.newToday} />
          </div>
        </section>

        <section className="border-t border-line section-pad">
          <div className="wrap">
            <h2 className="text-h2 font-semibold md:text-h2-lg">Job hunting, without the busywork.</h2>
            <p className="mb-8 mt-2 max-w-[60ch] text-body text-ink-2">Same goal, fewer tabs. Here&apos;s what changes.</p>
            <OldVsNew />
          </div>
        </section>

        <section className="bg-paper-2 section-pad">
          <div className="wrap grid gap-8 md:grid-cols-12 md:items-center">
            <div className="md:col-span-4">
              <h2 className="text-h2 font-semibold md:text-h2-lg">Alerts your way</h2>
              <p className="mt-2 max-w-[40ch] text-body text-ink-2">Choose how often and where. Change it any time, and pause from the bot with /stop.</p>
            </div>
            <div className="md:col-span-8">
              <AlertsDemo />
            </div>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-16 section-pad">
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
            <div className="md:col-span-4">
              <h2 className="text-h2 font-semibold md:text-h2-lg">Questions students ask</h2>
              <p className="mt-3 max-w-[32ch] text-body text-ink-2">
                Something else?{" "}
                <Link href={`https://t.me/${SITE.channel}`} className="text-action underline-offset-4 hover:underline">Ask us on Telegram</Link> or{" "}
                <Link href="/contact" className="text-action underline-offset-4 hover:underline">send a message</Link>.
              </p>
            </div>
            <div className="mt-6 md:col-span-8 md:mt-0">
              {FAQ.map((f) => (
                <details key={f.q} className="group border-b border-line">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-h3 font-semibold transition-colors duration-[180ms] hover:text-action [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-ink-2 transition-transform duration-[280ms] group-open:rotate-45">+</span>
                  </summary>
                  <p className="max-w-[65ch] pb-6 text-body text-ink-2">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-paper-2 section-pad">
          <div className="wrap text-center">
            <p className="font-serif text-h3 italic text-action">Tomorrow, 7:30 AM.</p>
            <h2 className="mx-auto mt-2 max-w-[24ch] text-h2 font-semibold md:text-h2-lg">Your next interview could start with tomorrow&apos;s alert.</h2>
            <ButtonLink href={UPLOAD} className="mt-8">Upload your resume</ButtonLink>
            <p className="mt-3 text-small text-ink-3">Free to start. No card needed.</p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
