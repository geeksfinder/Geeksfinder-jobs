"use client";

import { Check } from "lucide-react";
import { useId, useState } from "react";
import { FREE_PLAN, PERIODS, PERIOD_LABEL, PLANS, isPaidPlan, planCode, whatsappExtra, type PaidPlan, type Period } from "@/lib/pricing";
import { Button, ButtonLink } from "./Button";

const FREE = ["Weekly job alerts", "1 tailored resume", "Application tracker"];
const PAID = ["Daily alerts on Telegram and email", "10 tailored resumes every 15 days", "HR email finder and drafts", "Follow-up reminders after 5 days"];

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-5 space-y-2.5">
      {items.map((i) => (
        <li key={i} className="flex gap-2 text-body text-ink-2">
          <Check size={20} strokeWidth={1.5} className="mt-0.5 shrink-0 text-success" aria-hidden />
          {i}
        </li>
      ))}
    </ul>
  );
}

type Props = {
  freeAction: React.ReactNode;
  /** Billing page: start checkout for the chosen plan. Without it (landing page) the button links to sign-in. */
  onSubscribe?: (plan: PaidPlan) => void;
  busy?: boolean;
  initialPlan?: PaidPlan;
  /** WhatsApp alerts can be bought (server decides); otherwise the row shows "Coming soon" and can't be ticked */
  whatsappOnSale?: boolean;
};

/**
 * Fresher (free) beside one framed panel for Hustle (DESIGN.md PricingBlock + WhatsApp): pick every 15 days or
 * monthly, and tick "Add WhatsApp alerts" to switch to the WhatsApp price.
 */
export function PricingBlock({ freeAction, onSubscribe, busy, initialPlan, whatsappOnSale = false }: Props) {
  const start = isPaidPlan(initialPlan) ? PLANS[initialPlan] : null;
  const [period, setPeriod] = useState<Period>(start?.period ?? "15d");
  const [whatsapp, setWhatsapp] = useState(whatsappOnSale && !!start?.whatsapp);
  const id = useId();
  const chosen = planCode(period, whatsappOnSale && whatsapp);
  const p = PLANS[chosen];

  return (
    <div className="grid gap-4 md:grid-cols-5">
      <div className="panel flex flex-col p-6 md:col-span-2 md:p-8">
        <h3 className="text-h3 font-semibold">{FREE_PLAN.name}</h3>
        <p className="mt-1 text-small text-ink-2">Free while you look around</p>
        <p className="mt-3">
          <span className="tabular text-h1 font-bold md:text-h1-lg">₹0</span>
        </p>
        <List items={FREE} />
        <div className="mt-auto pt-8">{freeAction}</div>
      </div>

      <div className="flex flex-col rounded-panel border-2 border-action bg-paper p-6 md:col-span-3 md:p-8">
        <fieldset>
          <legend className="text-h3 font-semibold">Hustle</legend>
          <p className="mt-1 text-small text-ink-2">Same features either way. Pick how often you pay.</p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            {PERIODS.map((per) => {
              const on = period === per;
              const plan = PLANS[planCode(per, whatsappOnSale && whatsapp)];
              return (
                <label
                  key={per}
                  className={`flex cursor-pointer flex-col rounded-control border p-3 transition-colors duration-[180ms] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-action ${on ? "border-action bg-paper-2" : "border-line hover:border-ink-3"}`}
                >
                  <input type="radio" name={`${id}-period`} value={per} checked={on} onChange={() => setPeriod(per)} className="sr-only" />
                  <span className="text-small font-semibold text-ink">{PERIOD_LABEL[per]}</span>
                  <span className="tabular mt-1 text-h3 font-semibold text-ink">₹{plan.price}</span>
                  <span className="text-small text-ink-2">{plan.every}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <label
          htmlFor={`${id}-wa`}
          className={`mt-3 flex min-h-11 items-center gap-3 rounded-control border border-line px-3 py-2 ${whatsappOnSale ? "cursor-pointer hover:border-ink-3" : "cursor-not-allowed opacity-60"}`}
        >
          <input
            id={`${id}-wa`}
            type="checkbox"
            checked={whatsappOnSale && whatsapp}
            disabled={!whatsappOnSale}
            onChange={(e) => setWhatsapp(e.target.checked)}
            className="size-4 accent-action"
          />
          <span className="text-body text-ink">
            Add WhatsApp alerts · <span className="tabular">+₹{whatsappExtra(period)}</span>
          </span>
          {!whatsappOnSale && <span className="ml-auto text-small text-ink-3">Coming soon</span>}
        </label>

        <p className="mt-5 flex items-baseline gap-2" aria-live="polite">
          <span className="tabular text-h1 font-bold md:text-h1-lg">₹{p.price}</span>
          <span className="text-body text-ink-2">{p.every}</span>
        </p>
        <List items={p.whatsapp ? [...PAID, "Your morning matches on WhatsApp too"] : PAID} />
        <div className="mt-auto pt-8">
          {onSubscribe ? (
            <Button className="w-full" loading={busy} onClick={() => onSubscribe(chosen)}>
              Start 7-day free trial · {p.name}
            </Button>
          ) : (
            <ButtonLink href={`/login?next=${encodeURIComponent(`/billing?plan=${chosen}`)}`} className="w-full">
              Start 7-day free trial · {p.name}
            </ButtonLink>
          )}
          <p className="mt-3 text-small text-ink-2">7-day free trial · Autopay via UPI · Cancel anytime from your UPI app</p>
        </div>
      </div>
    </div>
  );
}
