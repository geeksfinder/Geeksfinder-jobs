"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import { Turnstile } from "@/components/app/Turnstile";
import { ResumeUpload } from "@/components/app/ResumeUpload";
import { Button } from "@/components/ui/Button";

type Out = { subject: string; email: string; linkedin_note: string };

export function HrEmailTool() {
  const [resume, setResume] = useState("");
  const [job, setJob] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [out, setOut] = useState<Out | null>(null);
  const [copied, setCopied] = useState("");

  async function run() {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/tools/hr-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resume, job, turnstile: token }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(data.error ?? "Something went wrong.");
    setOut(data);
  }

  const copy = (label: string, text: string) => { navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(""), 2000); };

  return (
    <div className="mt-8">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <ResumeUpload onText={(t) => setResume(t.slice(0, 15000))} note="We read the PDF on your device and send only its text to write the email." />
          <label htmlFor="hr-resume" className="label mt-4">Your resume text</label>
          <textarea id="hr-resume" rows={12} className="input h-auto py-2 font-serif text-resume" value={resume} onChange={(e) => setResume(e.target.value)} maxLength={15000} />
        </div>
        <div>
          <label htmlFor="hr-job" className="label">Job description</label>
          <textarea id="hr-job" rows={12} className="input h-auto py-2" value={job} onChange={(e) => setJob(e.target.value)} maxLength={8000} />
        </div>
      </div>
      <div className="mt-4"><Turnstile onToken={setToken} /></div>
      {err && <p className="mt-3 text-small text-danger" role="alert">{err}</p>}
      <Button className="mt-4" loading={busy} disabled={resume.length < 200 || job.length < 100} onClick={run}>Write my email</Button>

      {out && (
        <section className="mt-10 space-y-6" aria-live="polite">
          <div className="panel p-5">
            <p className="text-small text-ink-2">Subject</p>
            <p className="text-body font-semibold">{out.subject}</p>
            <p className="mt-4 whitespace-pre-line text-body">{out.email}</p>
            <Button variant="secondary" className="mt-4" onClick={() => copy("email", `${out.subject}\n\n${out.email}`)}>
              <Copy size={16} strokeWidth={1.5} aria-hidden /> {copied === "email" ? "Copied" : "Copy email"}
            </Button>
          </div>
          <div className="panel p-5">
            <p className="text-small text-ink-2">LinkedIn note · <span className="tabular">{out.linkedin_note.length}/300</span></p>
            <p className="mt-2 text-body">{out.linkedin_note}</p>
            <Button variant="secondary" className="mt-4" onClick={() => copy("note", out.linkedin_note)}>
              <Copy size={16} strokeWidth={1.5} aria-hidden /> {copied === "note" ? "Copied" : "Copy note"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
