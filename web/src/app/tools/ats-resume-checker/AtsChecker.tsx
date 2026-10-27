"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";
import { ResumeUpload } from "@/components/app/ResumeUpload";
import { Button } from "@/components/ui/Button";
import { SkillChip } from "@/components/ui/Highlighter";
import { checkAts, type AtsResult } from "@/lib/ats";

export function AtsChecker() {
  const [resume, setResume] = useState("");
  const [job, setJob] = useState("");
  const [result, setResult] = useState<AtsResult | null>(null);
  const [err, setErr] = useState("");

  function run() {
    if (resume.trim().split(/\s+/).length < 50) return setErr("Choose your resume PDF, or paste your full resume text.");
    if (job.trim().split(/\s+/).length < 20) return setErr("Paste the full job description.");
    setErr("");
    setResult(checkAts(resume, job));
  }

  return (
    <div className="mt-8">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <ResumeUpload onText={setResume} note="Read on your phone or laptop. Your resume is never uploaded." />
          <label htmlFor="ats-resume" className="label mt-4">Your resume text</label>
          <textarea id="ats-resume" rows={14} className="input h-auto py-2 font-serif text-resume" value={resume} onChange={(e) => setResume(e.target.value)} placeholder="Choose your PDF above, or paste your resume text here" />
        </div>
        <div>
          <label htmlFor="ats-job" className="label">Job description</label>
          <textarea id="ats-job" rows={14} className="input h-auto py-2" value={job} onChange={(e) => setJob(e.target.value)} placeholder="Paste the full job description" />
        </div>
      </div>
      {err && <p className="mt-3 text-small text-danger" role="alert">{err}</p>}
      <Button className="mt-4" onClick={run}>Check my resume</Button>

      {result && (
        <section className="mt-10 panel p-5 md:p-6" aria-live="polite">
          <p className="text-small text-ink-2">ATS score</p>
          <p className={`tabular text-h1 font-bold md:text-h1-lg ${result.score >= 80 ? "text-success" : ""}`}>{result.score}<span className="text-h3 text-ink-3">/100</span></p>
          {result.matched.length + result.missing.length > 0 && (
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <h2 className="text-small font-semibold">You have {result.matched.length} of {result.matched.length + result.missing.length} asked skills</h2>
                <div className="mt-2 flex flex-wrap gap-1.5">{result.matched.map((s) => <SkillChip key={s} name={s} matched />)}</div>
              </div>
              {result.missing.length > 0 && (
                <div>
                  <h2 className="text-small font-semibold">Missing from your resume</h2>
                  <div className="mt-2 flex flex-wrap gap-1.5">{result.missing.map((s) => <SkillChip key={s} name={s} />)}</div>
                  <p className="mt-2 text-small text-ink-2">Add only the ones you genuinely have.</p>
                </div>
              )}
            </div>
          )}
          <ul className="mt-6 divide-y divide-line border-t border-line">
            {result.checks.map((c) => (
              <li key={c.label} className="flex gap-3 py-3">
                {c.ok ? <Check size={20} strokeWidth={2} className="shrink-0 text-success" aria-label="Pass" /> : <X size={20} strokeWidth={2} className="shrink-0 text-danger" aria-label="Fix" />}
                <div>
                  <p className="text-body font-medium">{c.label}</p>
                  {!c.ok && <p className="text-small text-ink-2">{c.tip}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
