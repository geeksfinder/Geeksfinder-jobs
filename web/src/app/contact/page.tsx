import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/LegalPage";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Contact", description: "Email or message the GeeksFinder team on Telegram, report a wrong job listing or article, or reach our grievance officer under the DPDP Act 2023.", alternates: { canonical: "/contact" } };

export default function Contact() {
  return (
    <LegalPage title="Contact">
      <p>We read every message and usually reply within two working days.</p>
      <h2>Email</h2>
      <p><a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> — billing, data deletion, corrections to articles, or anything else.</p>
      <h2>Telegram</h2>
      <p>Daily fresher jobs on our channel: <a href={`https://t.me/${SITE.channel}`}>t.me/{SITE.channel}</a></p>
      <h2>Grievance officer (DPDP Act 2023)</h2>
      {/* TODO: add the grievance officer's name before launch */}
      <p>For privacy complaints or to withdraw consent, email <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> with the subject &quot;Privacy&quot;.</p>
    </LegalPage>
  );
}
