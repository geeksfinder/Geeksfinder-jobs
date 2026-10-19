"use client";

import { Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { setStage } from "@/app/(app)/tracker/actions";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ResumeDiff, type DiffLine } from "@/components/ui/ResumeDiff";
import { useToast } from "@/components/ui/Toast";

type Draft = { contact: { email: string; name?: string; role?: string; source: string } | null; subject: string; email: string; linkedin_note: string };
type Err = { msg: string; upgrade?: boolean } | null;

export function JobActions({ jobId, applyUrl, plan, initialTab }: { jobId: string; applyUrl: string | null; plan: "free" | "pro"; initialTab: "tailor" | "email" }) {
  const [tab, setTab] = useState(initialTab);
  return (
    <section className="mt-6">
      <div role="tablist" aria-label="Actions" className="mb-6 inline-flex rounded-control border border-line p-1">
        {(["tailor", "email"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            onClick={() => setTab(t)}
            className={`h-10 rounded-chip px-4 text-small font-medium transition-colors duration-[180ms] ${tab === t ? "bg-ink text-white" : "text-ink-2 hover:text-ink"}`}
          >
            {t === "tailor" ? "Tailor resume" : "Email HR"}
          </button>
        ))}
      </div>
      <div id={`panel-${tab}`} role="tabpanel">
        {tab === "tailor" ? <Tailor jobId={jobId} applyUrl={applyUrl} /> : <EmailHR jobId={jobId} plan={plan} />}
      </div>
    </section>
  );
}

function ErrorMsg({ err }: { err: Err }) {
  if (!err) return null;
  return (
    <p className="mt-3 text-small text-danger" role="alert">
      {err.msg}{" "}
      {err.upgrade && <Link href="/billing" className="text-action underline-offset-4 hover:underline">See plans</Link>}
    </p>
  );
}

function Tailor({ jobId, applyUrl }: { jobId: string; applyUrl: string | null }) {
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const [result, setResult] = useState<{ id: string; lines: DiffLine[] } | null>(null);
  const toast = useToast();

  async function run() {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/tailor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr({ msg: data.error ?? "Something went wrong.", upgrade: data.upgrade });
    setResult(data);
    toast("Resume tailored");
  }

  async function download(accepted: Record<string, string>) {
    if (!result) return;
    setDownloading(true);
    const res = await fetch(`/api/tailor/${result.id}/pdf`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accepted }) });
    setDownloading(false);
    if (!res.ok) return toast("Couldn't create the PDF. Try again.", "error");
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "resume.pdf";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("PDF downloaded");
  }

  if (!result)
    return (
      <div className="rounded-panel bg-paper-2 p-6">
        <h2 className="text-h3 font-semibold">Tailor your resume to this job</h2>
        <p className="mt-1 max-w-[60ch] text-body text-ink-2">We rephrase and reorder what&apos;s already on your resume. We never add skills, companies or numbers you don&apos;t have.</p>
        <Button className="mt-5" loading={busy} onClick={run}>Tailor resume</Button>
        {busy && <p className="mt-2 text-small text-ink-2">This takes about 15 seconds.</p>}
        <ErrorMsg err={err} />
      </div>
    );

  return (
    <div>
      <p className="mb-4 text-body text-ink-2">Review every change. Use Undo on any line you don&apos;t want, then download.</p>
      <ResumeDiff lines={result.lines} onDownload={download} downloading={downloading} />
      {applyUrl && (
        <a
          href={applyUrl}
          target="_blank"
          rel="noopener nofollow"
          onClick={() => setStage(jobId, "applied").catch(() => {})}
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-body font-medium text-action underline-offset-4 hover:underline"
        >
          Apply with this resume <ExternalLink size={16} strokeWidth={1.5} aria-hidden />
        </a>
      )}
    </div>
  );
}

function EmailHR({ jobId, plan }: { jobId: string; plan: "free" | "pro" }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const [d, setD] = useState<Draft | null>(null);
  const toast = useToast();

  if (plan === "free")
    return (
      <div className="rounded-panel bg-paper-2 p-6">
        <h2 className="text-h3 font-semibold">Email HR in one click</h2>
        <p className="mt-1 max-w-[60ch] text-body text-ink-2">We find the recruiter&apos;s email and draft a short, personal note plus a LinkedIn message. Part of every paid plan, from ₹10 every 15 days.</p>
        <ButtonLink href="/billing" className="mt-5">Start 7-day free trial</ButtonLink>
      </div>
    );

  async function run() {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/outreach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr({ msg: data.error ?? "Something went wrong.", upgrade: data.upgrade });
    setD(data);
    toast("Email draft ready");
  }

  async function markSent(channel: "email" | "linkedin") {
    const res = await fetch("/api/outreach/sent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, channel, contactEmail: d?.contact?.email ?? null }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error ?? "Couldn't log this.", "error"); return false; }
    toast("Added to your tracker");
    return true;
  }

  if (!d)
    return (
      <div className="rounded-panel bg-paper-2 p-6">
        <h2 className="text-h3 font-semibold">Find HR and draft an email</h2>
        <p className="mt-1 text-body text-ink-2">We check the job post, the company&apos;s website and trusted lookups.</p>
        <Button className="mt-5" loading={busy} onClick={run}>Email HR</Button>
        <ErrorMsg err={err} />
      </div>
    );

  const gmail = d.contact
    ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(d.contact.email)}&su=${encodeURIComponent(d.subject.replace(/[\r\n]+/g, " "))}&body=${encodeURIComponent(d.email)}`
    : null;

  return (
    <div className="space-y-6">
      <div className="panel space-y-4 p-5">
        {d.contact ? (
          <p className="text-body">
            To{" "}
            {d.contact.name ? (
              <>
                <span className="font-semibold">{d.contact.name}</span>
                {d.contact.role && <span className="text-ink-2">, {d.contact.role}</span>} <span className="text-ink-2">({d.contact.email})</span>
              </>
            ) : (
              <span className="font-semibold">{d.contact.email}</span>
            )}{" "}
            <span className="text-small text-ink-3">· found via {d.contact.source}</span>
          </p>
        ) : (
          <p className="text-body text-warning">We couldn&apos;t find a verified HR email for this company. Send the LinkedIn note below instead.</p>
        )}
        {d.contact && (
          <>
            <div>
              <label htmlFor="em-subject" className="label">Subject</label>
              <input id="em-subject" className="input" value={d.subject} maxLength={120} onChange={(e) => setD({ ...d, subject: e.target.value.replace(/[\r\n]+/g, " ") })} />
            </div>
            <div>
              <label htmlFor="em-body" className="label">Email</label>
              <textarea id="em-body" rows={10} className="input h-auto py-2" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={async () => {
                  // Open the tab synchronously (popup blockers), then log
                  const w = window.open(gmail!, "_blank", "noopener");
                  if (!(await markSent("email"))) w?.close();
                }}
              >
                Open in Gmail <ExternalLink size={16} strokeWidth={1.5} aria-hidden />
              </Button>
              <Button variant="secondary" onClick={() => { navigator.clipboard.writeText(`${d.subject}\n\n${d.email}`); toast("Email copied"); }}>
                <Copy size={16} strokeWidth={1.5} aria-hidden /> Copy email
              </Button>
            </div>
            <p className="text-small text-ink-2">Attach your tailored PDF in Gmail before you send. We&apos;ll remind you on Telegram in 5 days if there&apos;s no reply.</p>
          </>
        )}
      </div>

      <div className="panel space-y-3 p-5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="li-note" className="label mb-0">LinkedIn note</label>
          <span className={`tabular text-small ${d.linkedin_note.length > 280 ? "text-warning" : "text-ink-3"}`}>{d.linkedin_note.length}/300</span>
        </div>
        <textarea id="li-note" rows={3} maxLength={300} className="input h-auto py-2" value={d.linkedin_note} onChange={(e) => setD({ ...d, linkedin_note: e.target.value })} />
        <Button variant="secondary" onClick={() => { navigator.clipboard.writeText(d.linkedin_note); markSent("linkedin"); }}>
          <Copy size={16} strokeWidth={1.5} aria-hidden /> Copy note
        </Button>
        <p className="text-small text-ink-2">Paste it yourself when you send a connection request on LinkedIn.</p>
      </div>
    </div>
  );
}
