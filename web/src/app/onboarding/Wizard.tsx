"use client";

import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import { FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertFields, type AlertValues } from "@/components/app/AlertFields";
import { TagInput } from "@/components/app/TagInput";
import { Button, ButtonLink } from "@/components/ui/Button";
import { SkillChip } from "@/components/ui/Highlighter";
import { JobCard } from "@/components/ui/JobCard";
import { EmptyState, useToast } from "@/components/ui/Toast";
import { firstMatches, saveAlerts, savePreferences, saveSkills, type FirstMatch } from "./actions";

type Initial = {
  skills: string[];
  roles: string[];
  locations: string[];
  jobType: "full-time" | "internship" | "both";
  frequency: string;
  channels: string[];
  alertHour: number;
  telegramConnected: boolean;
  plan: "free" | "pro";
};

const STEPS = ["Upload resume", "Preferences", "Alerts", "Done"];
const ROLE_SUGGESTIONS = ["Frontend Developer", "Software Engineer", "Data Analyst", "Full Stack Developer", "Python Developer"];
const CITY_SUGGESTIONS = ["Remote", "Bengaluru", "Pune", "Hyderabad", "Mumbai"];

export function Wizard({ initial, review = false, startAtUpload = false }: { initial: Initial; review?: boolean; startAtUpload?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(initial.skills.length && !startAtUpload ? 1 : 0);
  const [skills, setSkills] = useState(initial.skills);
  const [roles, setRoles] = useState(initial.roles);
  const [locations, setLocations] = useState(initial.locations.length ? initial.locations : ["Remote"]);
  const [jobType, setJobType] = useState(initial.jobType);
  const [alerts, setAlerts] = useState<AlertValues>({ frequency: initial.frequency, channels: initial.channels, alertHour: initial.alertHour, quietStart: 22, quietEnd: 7 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => { heading.current?.focus(); }, [step]);

  async function next(action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError("");
    try {
      const r = await action();
      if (!r.ok) return setError(r.error ?? "Something went wrong.");
      setStep((s) => s + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-8">
        <div className="flex justify-between text-small text-ink-2">
          <span>Step {step + 1} of 4</span>
          <span>{STEPS[step]}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-chip bg-paper-2" role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step + 1} aria-label="Onboarding progress">
          <div className="h-full bg-action transition-[width] duration-[280ms] ease-quick" style={{ width: `${((step + 1) / 4) * 100}%` }} />
        </div>
      </div>

      {step === 0 && (
        <section>
          <h1 ref={heading} tabIndex={-1} className="text-h1 font-bold outline-none md:text-h1-lg">Upload your resume</h1>
          <p className="mt-2 text-body text-ink-2">We read your skills, projects and education in seconds. You can edit everything.</p>
          <UploadStep skills={skills} setSkills={setSkills} />
          {error && <p className="mt-3 text-small text-danger" role="alert">{error}</p>}
          <div className="mt-8 flex gap-3">
            <Button disabled={!skills.length} loading={busy} onClick={() => next(() => saveSkills(skills))}>Continue</Button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-6">
          <div>
            <h1 ref={heading} tabIndex={-1} className="text-h1 font-bold outline-none md:text-h1-lg">{review ? "Welcome back. Still looking for these?" : "What jobs do you want?"}</h1>
            <p className="mt-2 text-body text-ink-2">
              {review ? "It's been a while. Check your roles and cities are still right, or go straight to your matches." : "We use this to score every new job against you."}
            </p>
            {review && (
              <Button variant="text" className="mt-2" onClick={() => router.replace("/dashboard")}>Looks right, go to dashboard</Button>
            )}
          </div>
          <TagInput label="Roles" values={roles} onChange={setRoles} placeholder="Frontend Developer" suggestions={ROLE_SUGGESTIONS} max={10} />
          <TagInput label="Cities" hint="Add Remote to include remote jobs." values={locations} onChange={setLocations} placeholder="Pune" suggestions={CITY_SUGGESTIONS} max={10} />
          <fieldset>
            <legend className="label">Job type</legend>
            <div className="flex rounded-control border border-line p-1">
              {(["full-time", "internship", "both"] as const).map((t) => (
                <label key={t} className={`flex h-10 flex-1 cursor-pointer items-center justify-center rounded-chip text-small font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-action ${jobType === t ? "bg-ink text-white" : "text-ink-2"}`}>
                  <input type="radio" name="job-type" className="sr-only" checked={jobType === t} onChange={() => setJobType(t)} />
                  {t === "full-time" ? "Full-time" : t === "internship" ? "Internship" : "Both"}
                </label>
              ))}
            </div>
          </fieldset>
          {error && <p className="text-small text-danger" role="alert">{error}</p>}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(0)}>Back</Button>
            <Button loading={busy} onClick={() => next(() => savePreferences({ preferred_roles: roles, locations, job_type: jobType }))}>Continue</Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section>
          <h1 ref={heading} tabIndex={-1} className="text-h1 font-bold outline-none md:text-h1-lg">Get your matches every morning</h1>
          <p className="mb-6 mt-2 text-body text-ink-2">Connect Telegram so new jobs reach you where you already are.</p>
          <AlertFields value={alerts} onChange={setAlerts} plan={initial.plan} telegramConnected={initial.telegramConnected} />
          {error && <p className="mt-3 text-small text-danger" role="alert">{error}</p>}
          <div className="mt-8 flex gap-3">
            <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
            <Button
              loading={busy}
              disabled={!alerts.channels.length}
              onClick={() =>
                next(() =>
                  saveAlerts({ frequency: alerts.frequency as "daily", channels: alerts.channels as "telegram"[], alert_hour: alerts.alertHour, quiet_start: 22, quiet_end: 7 }),
                )
              }
            >
              Save and see matches
            </Button>
          </div>
        </section>
      )}

      {step === 3 && <DoneStep headingRef={heading} />}
    </div>
  );
}

function UploadStep({ skills, setSkills }: { skills: string[]; setSkills: (s: string[]) => void }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [detected, setDetected] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const toast = useToast();
  const reduce = useReducedMotion();

  function upload(file: File) {
    setErr("");
    setDetected([]);
    if (file.size > 2 * 1024 * 1024) return setErr("Your PDF is over 2 MB. Export a smaller PDF and try again.");
    const fd = new FormData();
    fd.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/resume/parse");
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 60));
    xhr.upload.onload = () => setProgress(70);
    xhr.onload = () => {
      setProgress(null);
      let data: { skills?: string[]; error?: string } = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status !== 200) return setErr(data.error ?? "Upload failed. Try again.");
      setDetected(data.skills ?? []);
      setSkills(data.skills ?? []);
      toast("Resume read");
    };
    xhr.onerror = () => { setProgress(null); setErr("Upload failed. Check your connection and try again."); };
    xhr.send(fd);
  }

  return (
    <div className="mt-6 space-y-6">
      <label className="flex cursor-pointer flex-col items-center rounded-panel border border-dashed border-line bg-paper-2 px-6 py-10 text-center hover:border-ink-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-action">
        <FileUp size={24} strokeWidth={1.5} className="text-ink-2" aria-hidden />
        <span className="mt-2 text-body font-semibold">{skills.length ? "Upload a different PDF" : "Choose your resume PDF"}</span>
        <span className="text-small text-ink-2">Text-based PDF, up to 2 MB</span>
        <input type="file" accept="application/pdf,.pdf" className="sr-only" disabled={progress !== null} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </label>

      {progress !== null && (
        <div aria-live="polite">
          <p className="mb-2 text-small text-ink-2">{progress < 70 ? "Uploading…" : "Reading your skills…"}</p>
          <div className="h-1.5 overflow-hidden rounded-chip bg-paper-2">
            <div className="h-full bg-action transition-[width] duration-[280ms]" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {err && <p className="text-small text-danger" role="alert">{err}</p>}

      {detected.length > 0 && (
        <LazyMotion features={domAnimation}>
          <div>
            <p className="mb-2 text-small font-medium">We found {detected.length} skills</p>
            <ul className="flex flex-wrap gap-1.5">
              {detected.map((s, i) => (
                <m.li key={s} initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.18 }}>
                  <SkillChip name={s} matched />
                </m.li>
              ))}
            </ul>
          </div>
        </LazyMotion>
      )}

      {(skills.length > 0 || detected.length > 0) && (
        <TagInput label="Edit skills" hint="Remove anything wrong and add what we missed." values={skills} onChange={setSkills} placeholder="Add a skill" />
      )}
    </div>
  );
}

function DoneStep({ headingRef }: { headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  const [matches, setMatches] = useState<FirstMatch[] | null>(null);
  const router = useRouter();
  useEffect(() => { firstMatches().then(setMatches).catch(() => setMatches([])); }, []);

  return (
    <section>
      <h1 ref={headingRef} tabIndex={-1} className="text-h1 font-bold outline-none md:text-h1-lg">You&apos;re set up</h1>
      <p className="mt-2 text-body text-ink-2">
        {matches === null ? "Finding your first matches…" : matches.length ? `Here are your top ${matches.length} matches right now.` : "Your first matches arrive with tomorrow morning's alert."}
      </p>
      <div className="mt-6">
        {matches === null ? (
          <div className="space-y-3" aria-hidden>
            {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-panel bg-paper-2" />)}
          </div>
        ) : matches.length ? (
          <div className="panel px-4">
            {matches.map((j) => (
              <JobCard key={j.id} job={j} score={j.score} reasons={j.reasons} href={`/apply/${j.id}`} actions={<ButtonLink href={`/apply/${j.id}?tab=tailor`} size="sm">Tailor resume</ButtonLink>} />
            ))}
          </div>
        ) : (
          <EmptyState text="We add new jobs every morning at 6. Add more skills or cities to widen your results." action={<ButtonLink href="/resumes" variant="secondary">Edit skills</ButtonLink>} />
        )}
      </div>
      {/* replace: Back from the dashboard shouldn't reopen the setup steps */}
      <Button className="mt-8" variant="secondary" onClick={() => router.replace("/dashboard")}>Go to dashboard</Button>
    </section>
  );
}
