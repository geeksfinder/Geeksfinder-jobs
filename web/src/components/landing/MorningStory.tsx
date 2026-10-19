"use client";

import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { JobCard } from "@/components/ui/JobCard";
import { TelegramAlertPreview } from "@/components/ui/TelegramAlertPreview";
import { SAMPLE_DIFF } from "@/lib/sample";

/**
 * "Priya's morning" (DESIGN.md Landing): How it works told as one student's morning. Timeline on the left, the real
 * product screen for each moment in a paper-2 stage on the right (sticky crossfade on desktop, stacked on mobile).
 * Times and story lines use Source Serif 4; everything else is the product's own UI with sample data.
 */
const BEATS = [
  {
    time: "6:00 AM",
    title: "While Priya sleeps, we read the job boards.",
    line: "Company career pages, job boards and LinkedIn listings. Every new fresher role is scored against her resume.",
  },
  { time: "7:30 AM", title: "Three matches arrive on Telegram.", line: "No scrolling six job sites. Just the three that fit, each with a reason." },
  {
    time: "7:34 AM",
    title: "She opens the one that fits best.",
    line: "87% match: React, Git and REST APIs are already on her resume. TypeScript is the gap, and we say so.",
  },
  { time: "7:41 AM", title: "Her resume, tuned for this job.", line: "We reorder and rephrase what's already true. We never add a skill she doesn't have." },
  {
    time: "7:45 AM",
    title: "An email to a real person, not “Dear Sir”.",
    line: "We find who hires at Zepto and draft a short note. She changes one word and sends it from her own Gmail.",
  },
  { time: "8:00 AM", title: "Done before her first lecture.", line: "Three applications, each one tailored and tracked. Tomorrow at 7:30 there will be more." },
];

const SAMPLE_JOB = {
  id: "sample",
  title: "Frontend Developer Intern",
  company: "Zepto",
  location: "Bengaluru",
  remote: false,
  fresher_friendly: true,
  skills: ["React", "TypeScript", "Git", "REST APIs"],
  posted_at: null,
};

function Sources({ newToday }: { newToday: number | null }) {
  const rows = ["Company career pages", "Job boards", "LinkedIn listings, through licensed job data"];
  return (
    <div className="panel w-full max-w-md p-6">
      {newToday !== null ? (
        <>
          <p className="tabular text-display font-bold text-ink md:text-display-lg">{newToday.toLocaleString("en-IN")}</p>
          <p className="text-body text-ink-2">new jobs read in the last 24 hours</p>
        </>
      ) : (
        <p className="text-h3 font-semibold">Fresh jobs, every morning at 6</p>
      )}
      <ul className="mt-5 space-y-2 border-t border-line pt-4">
        {rows.map((r) => (
          <li key={r} className="flex items-center gap-2 text-small text-ink-2">
            <Check size={20} strokeWidth={1.5} className="shrink-0 text-success" aria-hidden />
            {r}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResumeLines() {
  const lines = SAMPLE_DIFF.slice(0, 2);
  return (
    <div className="w-full max-w-md rounded-panel border border-line bg-paper p-6 font-serif text-resume">
      {lines.map((l) => (
        <div key={l.id} className="border-b border-line py-3 first:pt-0 last:border-0 last:pb-0">
          <p className="font-sans text-tiny font-medium text-ink-3">{l.section}</p>
          <p className="mt-1 text-ink-3 line-through">{l.before}</p>
          <p className="mt-1 text-ink">
            <span className="rounded-chip bg-highlight px-0.5">{l.after}</span>
          </p>
        </div>
      ))}
    </div>
  );
}

function HrEmail() {
  return (
    <div className="panel w-full max-w-md p-6">
      <p className="text-small text-ink-2">
        To <span className="font-semibold text-ink">Ananya Rao</span>, Talent Acquisition, Zepto
      </p>
      <p className="mt-1 text-small text-ink-2">
        Subject: <span className="text-ink">Frontend Developer Intern: B.Tech 2026, React projects</span>
      </p>
      <div className="mt-4 space-y-2 border-t border-line pt-4 text-small text-ink">
        <p>Hi Ananya,</p>
        <p>I&apos;m a final-year CSE student and I&apos;d love to apply for the Frontend Developer Intern role. I built a React dashboard that pulls live data from a REST API, which is close to what your team ships.</p>
        <p>My resume, tailored to this role, is attached. Thank you for considering it.</p>
        <p>Priya</p>
      </div>
      <span aria-hidden className={buttonClass("primary", "sm", "mt-5 pointer-events-none")}>Open in Gmail</span>
    </div>
  );
}

function Tracker() {
  const cols = [
    { stage: "Saved", n: 2 },
    { stage: "Applied", n: 3 },
    { stage: "Interview", n: 0 },
    { stage: "Offer", n: 0 },
  ];
  return (
    <div className="w-full max-w-md">
      <dl className="grid grid-cols-4 gap-2">
        {cols.map((c) => (
          <div key={c.stage} className={`rounded-control border p-3 ${c.stage === "Applied" ? "border-action bg-paper" : "border-line bg-paper"}`}>
            <dt className="text-tiny text-ink-2">{c.stage}</dt>
            <dd className="tabular text-h2 font-semibold">{c.n}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-small text-ink-2">We remind her to follow up if HR hasn&apos;t replied in 5 days.</p>
    </div>
  );
}

function Visual({ beat, newToday }: { beat: number; newToday: number | null }) {
  if (beat === 0) return <Sources newToday={newToday} />;
  if (beat === 1) return <TelegramAlertPreview className="mx-auto" />;
  if (beat === 2)
    return (
      <div className="panel w-full px-5">
        <JobCard job={SAMPLE_JOB} score={87} mySkills={["React", "Git", "REST APIs"]} reasons={{ matched_skills: ["React", "Git", "REST APIs"], missing_skills: ["TypeScript"], fresher_friendly: true, location_fit: 1 }} />
      </div>
    );
  if (beat === 3) return <ResumeLines />;
  if (beat === 4) return <HrEmail />;
  return <Tracker />;
}

export function MorningStory({ newToday }: { newToday: number | null }) {
  const [beat, setBeat] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);
  const reduce = useReducedMotion();

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setBeat(Number((e.target as HTMLElement).dataset.beat))),
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((r) => r && io.observe(r));
    return () => io.disconnect();
  }, []);

  return (
    <LazyMotion features={domAnimation}>
      <div className="mt-10 grid gap-10 md:grid-cols-12">
        <ol className="relative md:col-span-5">
          {/* the timeline rail */}
          <span aria-hidden className="absolute bottom-6 left-[5px] top-6 w-px bg-line" />
          {BEATS.map((b, i) => {
            const on = beat === i;
            return (
              <li
                key={b.time}
                ref={(el) => { refs.current[i] = el; }}
                data-beat={i}
                className="relative py-6 pl-8 md:flex md:min-h-[16rem] md:flex-col md:justify-center"
              >
                <span aria-hidden className={`absolute left-0 top-8 size-[11px] rounded-full border-2 transition-colors duration-[280ms] md:top-1/2 md:-translate-y-1/2 ${on ? "border-action bg-action" : "border-line bg-paper"}`} />
                <p className={`font-serif text-h3 italic transition-colors duration-[280ms] ${on ? "text-action" : "text-ink-3"}`}>{b.time}</p>
                <h3 className={`mt-1 text-h3 font-semibold transition-colors duration-[280ms] md:text-h2 ${on ? "text-ink" : "text-ink-2"}`}>{b.title}</h3>
                <p className="mt-2 max-w-[44ch] font-serif text-body text-ink-2">{b.line}</p>
                <div className="mt-5 flex justify-center rounded-panel bg-paper-2 p-5 md:hidden">
                  <Visual beat={i} newToday={newToday} />
                </div>
              </li>
            );
          })}
        </ol>
        <div className="hidden md:col-span-7 md:block">
          <div className="sticky top-24">
            <div className="flex min-h-[30rem] items-center justify-center rounded-panel bg-paper-2 p-8 lg:p-12">
              <AnimatePresence mode="wait">
                <m.div
                  key={beat}
                  className="flex w-full justify-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduce ? 0.12 : 0.28, ease: [0.2, 0, 0, 1] }}
                >
                  <Visual beat={beat} newToday={newToday} />
                </m.div>
              </AnimatePresence>
            </div>
            <p className="tabular mt-3 text-small text-ink-3" aria-live="polite">
              {BEATS[beat].time} · moment {beat + 1} of {BEATS.length}
            </p>
          </div>
        </div>
      </div>
      <p className="mt-8 text-small text-ink-3">Priya is an example student. The screens above use sample data; job counts are live.</p>
    </LazyMotion>
  );
}
