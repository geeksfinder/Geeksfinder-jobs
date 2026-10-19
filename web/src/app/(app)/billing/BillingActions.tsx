"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PricingBlock } from "@/components/ui/PricingBlock";
import { PLANS, type PaidPlan } from "@/lib/pricing";
import { useToast } from "@/components/ui/Toast";

declare global {
  interface Window {
    Razorpay: new (opts: Record<string, unknown>) => { open: () => void; on: (e: string, cb: () => void) => void };
  }
}

export function BillingActions({ active, initialPlan, whatsappOnSale }: { active: boolean; initialPlan?: PaidPlan; whatsappOnSale: boolean }) {
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [success, setSuccess] = useState<PaidPlan | null>(null);
  const toast = useToast();
  const router = useRouter();

  async function subscribe(plan: PaidPlan) {
    setBusy(true);
    const res = await fetch("/api/razorpay/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(false); return toast(data.error ?? "Couldn't start checkout.", "error"); }
    const rz = new window.Razorpay({
      key: data.keyId,
      subscription_id: data.subscriptionId,
      name: "GeeksFinder",
      description: `${PLANS[plan].name} — ₹${PLANS[plan].price} ${PLANS[plan].every} after a 7-day free trial`,
      prefill: { email: data.email },
      theme: { color: "#2457D6" },
      handler: () => { setSuccess(plan); setTimeout(() => router.refresh(), 2500); },
      modal: { ondismiss: () => setBusy(false) },
    });
    rz.open();
  }

  async function cancel() {
    setBusy(true);
    const res = await fetch("/api/razorpay/cancel", { method: "POST" });
    setBusy(false);
    setConfirmCancel(false);
    if (res.ok) { toast("Subscription cancelled"); router.refresh(); }
    else toast((await res.json().catch(() => ({}))).error ?? "Couldn't cancel. Try from your UPI app.", "error");
  }

  if (success)
    return (
      <div className="mt-6 flex items-center gap-4 rounded-panel border border-success p-5" role="status">
        <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden className="shrink-0 text-success">
          <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M12 21l5 5 11-12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1} style={{ animation: "draw 450ms cubic-bezier(0.16,1,0.3,1) forwards" }} />
        </svg>
        <div>
          <p className="text-h3 font-semibold">Autopay is set up. Welcome to {PLANS[success].name}!</p>
          <p className="text-body text-ink-2">Your free trial has started. First ₹{PLANS[success].price} is debited in 7 days.</p>
        </div>
      </div>
    );

  return (
    <div className="mt-6">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      {active ? (
        confirmCancel ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="danger" className="border-danger" loading={busy} onClick={cancel}>Yes, cancel my plan</Button>
            <Button variant="secondary" onClick={() => setConfirmCancel(false)}>Keep my plan</Button>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirmCancel(true)}>Cancel subscription</Button>
        )
      ) : (
        <PricingBlock
          freeAction={<p className="text-small text-ink-2">You&apos;re on this plan.</p>}
          onSubscribe={subscribe}
          busy={busy}
          initialPlan={initialPlan}
          whatsappOnSale={whatsappOnSale}
        />
      )}
    </div>
  );
}
