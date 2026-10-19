import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/LegalPage";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Refund policy", description: "How the GeeksFinder free trial, UPI Autopay billing, cancelling a plan and refunds work, in plain words.", alternates: { canonical: "/refund-policy" } };

export default function RefundPolicy() {
  return (
    <LegalPage title="Refund policy" updated="15 Oct 2026">
      {/* Have a lawyer review before launch. */}
      <h2>Free trial</h2>
      <p>Every paid plan (Hustle, with or without WhatsApp alerts) starts with a 7-day free trial. You set up UPI Autopay on day 1; nothing is charged until day 8. Cancel before day 8 and you pay nothing.</p>
      <h2>Billing</h2>
      <p>Hustle costs ₹10 every 15 days or ₹20 a month. With WhatsApp alerts it costs ₹29 every 15 days or ₹59 a month. Debits are made by UPI Autopay through Razorpay. Your bank sends a notice 24 hours before every debit.</p>
      <h2>Cancelling</h2>
      <p>Cancel any time from the Billing page or from your UPI app (Autopay or Mandates section). Your plan stays active until the end of the period you already paid for (15 days, 3 months or a year). No further debits happen after you cancel.</p>
      <h2>Refunds</h2>
      <p>Because each period is small and you can cancel at any time, payments already made are not refunded. If you were charged by mistake — for example, a debit after you cancelled, or a double debit — email <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> within 7 days and we refund the full amount to your original payment method within 5–7 working days.</p>
    </LegalPage>
  );
}
