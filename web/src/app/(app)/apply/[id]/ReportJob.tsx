"use client";

import { ChevronDown, Flag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { REPORT_REASONS, type ReportReason } from "@/lib/job-reports";
import { reportJob } from "./actions";

/** Quiet disclosure at the foot of the job page: pick a reason, the job leaves your matches, we check it. */
export function ReportJob({ jobId }: { jobId: string }) {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState<ReportReason | null>(null);
  const [, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const send = (reason: ReportReason) => {
    setBusy(reason);
    start(async () => {
      try {
        await reportJob(jobId, reason);
        setDone(true);
        toast("Job reported");
        router.refresh();
      } catch {
        toast("Couldn't report the job. Try again in a minute.", "error");
      } finally {
        setBusy(null);
      }
    });
  };

  return (
    <details className="group mt-8 border-t border-line pt-6">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-chip text-small font-medium text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action [&::-webkit-details-marker]:hidden">
        <Flag size={20} strokeWidth={1.5} aria-hidden />
        Report this job
        <ChevronDown size={20} strokeWidth={1.5} aria-hidden className="transition-transform duration-[180ms] group-open:rotate-180" />
      </summary>
      {done ? (
        <p className="mt-3 text-small text-ink-2" role="status">Thanks. This job is gone from your matches, and we&apos;ll check it.</p>
      ) : (
        <div className="mt-3">
          <p id="report-hint" className="text-small text-ink-2">What&apos;s wrong with it? It leaves your matches straight away.</p>
          <div className="mt-3 flex flex-wrap gap-2" aria-describedby="report-hint">
            {REPORT_REASONS.map((r) => (
              <Button key={r.id} variant="secondary" size="sm" loading={busy === r.id} disabled={busy !== null} onClick={() => send(r.id)}>
                {r.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </details>
  );
}
