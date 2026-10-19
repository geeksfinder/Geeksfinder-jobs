"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/ui/Wordmark";

export type AdminNavGroup = { title: string; links: { href: string; label: string }[] };

/**
 * Admin shell (DESIGN.md Admin): 240 px sidebar grouped Overview, Operations, Money, Growth, Content, System.
 * Desktop-first; from 768 px it is fixed, below that it stacks above the page (no mobile tabs).
 * The server passes only the groups this admin's role may open.
 */
export function AdminNav({ groups, role }: { groups: AdminNavGroup[]; role: string }) {
  const path = usePathname();
  const active = (href: string) => (href === "/admin" ? path === href : path === href || path.startsWith(`${href}/`));
  return (
    <aside className="border-b border-line bg-paper px-4 py-5 md:fixed md:inset-y-0 md:left-0 md:w-60 md:overflow-y-auto md:border-b-0 md:border-r">
      <Wordmark href="/dashboard" className="px-2" />
      <nav aria-label="Admin" className="mt-6 flex flex-wrap gap-x-6 gap-y-4 md:flex-col md:flex-nowrap">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="px-3 text-tiny font-medium text-ink-3">{g.title}</p>
            <ul className="mt-1">
              {g.links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={active(l.href) ? "page" : undefined}
                    className={`flex h-10 items-center rounded-control px-3 text-small transition-colors duration-[180ms] ${active(l.href) ? "bg-paper-2 font-semibold text-ink" : "text-ink-2 hover:text-ink"}`}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <p className="mt-6 px-3 text-tiny text-ink-3 md:absolute md:bottom-5">
        Signed in as <span className="font-medium text-ink-2">{role}</span> ·{" "}
        <Link href="/dashboard" className="text-action underline-offset-4 hover:underline">Back to app</Link>
      </p>
    </aside>
  );
}
