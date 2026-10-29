import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/landing/LegalPage";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy policy", description: "What GeeksFinder collects, why we need it, how it is stored and who it is shared with, and how to edit your profile or delete your account and data.", alternates: { canonical: "/privacy" } };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy" updated="15 Oct 2026">
      {/* Have a lawyer review before launch. */}
      <p>GeeksFinder processes your personal data under India&apos;s Digital Personal Data Protection Act, 2023, only with your consent and only for the purposes below.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Account details: name, email, phone (optional), and your Telegram chat ID if you connect Telegram.</li>
        <li>Your resume PDF and the profile we read from it: skills, education, projects, experience.</li>
        <li>Your job preferences, matches, tailored resumes, tracker and HR email history.</li>
        <li>Subscription and payment status from Razorpay. We never see your UPI PIN or bank details.</li>
      </ul>
      <h2>Why</h2>
      <p>To match you with jobs, send alerts, tailor your resume, draft emails to HR, and manage your subscription. Resume text is sent to our AI providers (Google Gemini and Groq) only to do these tasks.</p>
      <h2>Cookies</h2>
      <p>A sign-in cookie keeps you logged in. A second cookie, gf_attr, remembers for 30 days which link or site first brought you here (for example an Instagram post or a college ambassador&apos;s link), so we know which channels help students. It holds no name, email or resume data, and it&apos;s saved with your account only if you sign up. We use no advertising or tracking cookies from other companies.</p>
      <h2>Storage and security</h2>
      <p>Resumes are stored in a private bucket. Links to view them expire after 10 minutes. Each account can only read its own data. Secrets and keys never reach your browser.</p>
      <h2>Sharing</h2>
      <p>We never sell your data or our HR contact list. We share data only with the providers needed to run GeeksFinder: Supabase, Vercel, Google, Groq, Telegram, Brevo and Razorpay.</p>
      <h2>Recruiter contact details</h2>
      <p>To help students reach the right person, we hold work email addresses of company HR and talent teams, with a name and job title where known. They come from job posts, company websites, Hunter.io and HR contact lists compiled from public sources. We never store recruiters&apos; phone numbers or personal email addresses, never publish or export the list, and show a student one address only when they apply to that company&apos;s job. Recruiters can stop this at any time on the <Link href="/hr-opt-out">recruiter opt-out page</Link>.</p>
      <h2>Your rights</h2>
      <p>View and edit your profile any time on the Resumes page. Delete your account from <Link href="/alerts">Alerts → Delete my account</Link> — this removes your profile, resumes, matches and HR email history. To withdraw consent or raise a complaint, email <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.</p>
    </LegalPage>
  );
}
