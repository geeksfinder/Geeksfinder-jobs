import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";

/** Admin tables (DESIGN.md Admin): flat rows, 1 px borders, sticky header, sortable columns, 50 rows per page. */
export const PAGE_SIZE = 50;

export type TableQuery = { sort?: string; dir?: string; page?: string; q?: string };

/** Reads ?sort=&dir=&page= safely, allowing only known columns. */
export function readQuery<C extends string>(sp: TableQuery, columns: readonly C[], fallback: C) {
  const sort = (columns as readonly string[]).includes(sp.sort ?? "") ? (sp.sort as C) : fallback;
  const asc = sp.dir === "asc";
  const page = Math.max(1, Math.min(1000, Number.parseInt(sp.page ?? "1", 10) || 1));
  return { sort, asc, page, from: (page - 1) * PAGE_SIZE, to: page * PAGE_SIZE - 1 };
}

const href = (base: string, sp: TableQuery, patch: Partial<TableQuery>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, String(v));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
};

export function SortTh({ base, sp, column, label, current, asc }: { base: string; sp: TableQuery; column: string; label: string; current: string; asc: boolean }) {
  const on = current === column;
  const Icon = asc ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={on ? (asc ? "ascending" : "descending") : undefined} className="px-4 py-3 font-medium">
      <Link href={href(base, sp, { sort: column, dir: on && !asc ? "asc" : "desc", page: undefined })} className="inline-flex items-center gap-1 hover:text-ink">
        {label}
        {on && <Icon size={14} strokeWidth={1.5} aria-hidden />}
      </Link>
    </th>
  );
}

export function Th({ children }: { children?: React.ReactNode }) {
  return <th scope="col" className="px-4 py-3 font-medium">{children}</th>;
}

export function AdminTable({ head, children, empty }: { head: React.ReactNode; children: React.ReactNode; empty?: string | false }) {
  return (
    <div className="panel max-h-[70vh] overflow-auto">
      <table className="w-full text-left text-small">
        <thead className="sticky top-0 z-10 border-b border-line bg-paper text-ink-2">
          <tr>{head}</tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-line [&>tr:last-child]:border-0 [&_td]:px-4 [&_td]:py-3 [&_td]:align-top">{children}</tbody>
      </table>
      {empty && <p className="p-6 text-body text-ink-2">{empty}</p>}
    </div>
  );
}

export function Pager({ base, sp, page, hasMore }: { base: string; sp: TableQuery; page: number; hasMore: boolean }) {
  if (page === 1 && !hasMore) return null;
  return (
    <nav aria-label="Pages" className="mt-3 flex items-center gap-4 text-small">
      {page > 1 && <Link href={href(base, sp, { page: String(page - 1) })} className="text-action underline-offset-4 hover:underline">Previous 50</Link>}
      <span className="text-ink-3">Page {page}</span>
      {hasMore && <Link href={href(base, sp, { page: String(page + 1) })} className="text-action underline-offset-4 hover:underline">Next 50</Link>}
    </nav>
  );
}
