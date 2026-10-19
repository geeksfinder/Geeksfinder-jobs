import Link from "next/link";
import { Wordmark } from "@/components/ui/Wordmark";
import { SITE } from "@/lib/site";

const LINKS = [
  { href: "/jobs", label: "Fresher jobs" },
  { href: "/jobs/internship-fresher-jobs", label: "Internships" },
  { href: "/companies", label: "Companies hiring" },
  { href: "/tools", label: "Free tools" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/refund-policy", label: "Refund policy" },
  { href: "/about", label: "About" },
  { href: "/editorial-policy", label: "Editorial policy" },
  { href: "/contact", label: "Contact" },
  { href: "/hr-opt-out", label: "For recruiters" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="wrap flex flex-col gap-6 py-10 md:flex-row md:items-start md:justify-between">
        <div>
          <Wordmark />
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-1">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="flex min-h-11 items-center text-small text-ink-2 hover:text-ink">
              {l.label}
            </Link>
          ))}
          <a href={`https://t.me/${SITE.channel}`} target="_blank" rel="noopener" className="flex min-h-11 items-center text-small text-ink-2 hover:text-ink">
            Telegram channel
          </a>
        </nav>
      </div>
    </footer>
  );
}
