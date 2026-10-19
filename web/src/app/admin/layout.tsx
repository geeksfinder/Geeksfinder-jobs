import Link from "next/link";
import { Wordmark } from "@/components/ui/Wordmark";
import { requireAdmin } from "@/lib/admin/auth";
import { AREA_ROLES } from "@/lib/admin/constants";

export const metadata = { title: "Admin", robots: { index: false, follow: false } };

const LINKS = [
  { href: "/admin", label: "Overview", roles: AREA_ROLES.overview },
  { href: "/admin/drafts", label: "Review queue", roles: AREA_ROLES.drafts },
  { href: "/admin/contacts", label: "HR contacts", roles: AREA_ROLES.contacts },
] as const;

/** Server-side role check on every admin request; non-admins get a 404. Each page checks its own roles again. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requireAdmin();
  return (
    <div>
      <header className="border-b border-line">
        <div className="wrap flex h-16 items-center gap-6">
          <Wordmark href="/dashboard" />
          <nav className="flex gap-4 text-small">
            {LINKS.filter((l) => (l.roles as readonly string[]).includes(role)).map((l) => (
              <Link key={l.href} href={l.href} className="text-ink-2 hover:text-ink">{l.label}</Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="wrap py-8">{children}</main>
    </div>
  );
}
