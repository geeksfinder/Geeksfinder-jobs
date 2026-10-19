import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/landing/LegalPage";

export const metadata: Metadata = { title: "Terms of service", description: "The rules for using GeeksFinder: third-party job listings, tailored resumes, sending HR emails yourself, paid plans on UPI Autopay, and fair use.", alternates: { canonical: "/terms" } };

export default function Terms() {
  return (
    <LegalPage title="Terms of service" updated="15 Oct 2026">
      {/* Have a lawyer review before launch. */}
      <ol>
        <li>GeeksFinder shows job listings from third-party sources. We don&apos;t guarantee any listing is accurate or still open, or that you&apos;ll be hired.</li>
        <li>We never apply on your behalf. The Apply button opens the original listing.</li>
        <li>Tailored resumes only rephrase your own content. Review every change; you&apos;re responsible for what you submit.</li>
        <li>You send HR emails yourself, from your own email account. Don&apos;t spam recruiters. We limit you to 15 HR emails a day.</li>
        <li>Paid plans are billed by UPI Autopay after a 7-day free trial: Hustle ₹10 every 15 days, Season ₹59 every 3 months, Year Pass ₹199 a year. See the <Link href="/refund-policy">refund policy</Link> for cancellation and refunds.</li>
        <li>Don&apos;t misuse the service — for example by harvesting HR contacts, automating requests, or uploading files that aren&apos;t your resume. We may suspend accounts that do.</li>
      </ol>
    </LegalPage>
  );
}
