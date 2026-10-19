import { AdminNav, type AdminNavGroup } from "@/components/admin/AdminNav";
import { ToastProvider } from "@/components/ui/Toast";
import { requireAdmin } from "@/lib/admin/auth";
import { AREA_ROLES, type AdminRole } from "@/lib/admin/constants";

export const metadata = { title: "Admin", robots: { index: false, follow: false } };

// Sidebar groups from DESIGN.md Admin. Groups with no page built yet, or none this role may open, are left out.
const GROUPS: { title: string; links: { href: string; label: string; roles: readonly AdminRole[] }[] }[] = [
  { title: "Overview", links: [{ href: "/admin", label: "Overview", roles: AREA_ROLES.overview }] },
  {
    title: "Operations",
    links: [
      { href: "/admin/users", label: "Users", roles: AREA_ROLES.users },
      { href: "/admin/contacts", label: "HR contacts", roles: AREA_ROLES.contacts },
      { href: "/admin/dnc", label: "Do not contact", roles: AREA_ROLES.dnc },
    ],
  },
  { title: "Money", links: [{ href: "/admin/payments", label: "Payments", roles: AREA_ROLES.payments }] },
  { title: "Content", links: [{ href: "/admin/drafts", label: "Review queue", roles: AREA_ROLES.drafts }] },
  { title: "System", links: [{ href: "/admin/system", label: "System and security", roles: AREA_ROLES.system }] },
];

/** Server-side role check on every admin request; anyone else gets a 404. Each page checks its own roles again. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requireAdmin();
  const groups: AdminNavGroup[] = GROUPS.map((g) => ({ title: g.title, links: g.links.filter((l) => l.roles.includes(role)).map(({ href, label }) => ({ href, label })) })).filter(
    (g) => g.links.length,
  );
  return (
    <ToastProvider>
      <AdminNav groups={groups} role={role} />
      <div className="md:pl-60">
        <main className="mx-auto max-w-[72rem] px-4 py-8 md:px-8">{children}</main>
      </div>
    </ToastProvider>
  );
}
