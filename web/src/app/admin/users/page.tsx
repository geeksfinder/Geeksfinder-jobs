import Link from "next/link";
import { AdminTable, PAGE_SIZE, Pager, SortTh, Th, readQuery, type TableQuery } from "@/components/admin/Table";
import { Badge } from "@/components/ui/Highlighter";
import { requireAdmin } from "@/lib/admin/auth";
import { AREA_ROLES } from "@/lib/admin/constants";
import { shortDate } from "@/lib/format";

const COLUMNS = ["created_at", "name", "email", "plan"] as const;

/** A2 Users: search by email or name. No phone numbers or resume text here; the detail page masks the phone. */
export default async function Users({ searchParams }: { searchParams: Promise<TableQuery> }) {
  const { admin } = await requireAdmin(AREA_ROLES.users);
  const sp = await searchParams;
  const { sort, asc, page, from, to } = readQuery(sp, COLUMNS, "created_at");
  const q = (sp.q ?? "").replace(/[%,()*\\]/g, " ").trim().slice(0, 80);

  let query = admin.from("users").select("id, name, email, plan, telegram_chat_id, disabled_at, created_at").order(sort, { ascending: asc, nullsFirst: false }).range(from, to + 1);
  if (q) query = query.or(`email.ilike.%${q}%,name.ilike.%${q}%`);
  const { data } = await query;
  const rows = (data ?? []).slice(0, PAGE_SIZE);
  const ids = rows.map((r) => r.id);
  const { data: grants } = ids.length ? await admin.from("pro_grants").select("user_id").in("user_id", ids).lte("starts_at", new Date().toISOString()).gt("ends_at", new Date().toISOString()) : { data: [] };
  const granted = new Set((grants ?? []).map((g) => g.user_id));
  const base = "/admin/users";

  return (
    <>
      <h1 className="text-h1 font-bold">Users</h1>
      <p className="mb-6 mt-1 text-body text-ink-2">Open a student to see their plan, usage and channels, and to grant Pro days or turn a channel off.</p>
      <form className="mb-4 flex gap-2">
        <label htmlFor="uq" className="sr-only">Search users</label>
        <input id="uq" name="q" defaultValue={q} placeholder="Search email or name" className="input max-w-sm" />
        <button className="h-11 rounded-control border border-line px-4 text-small font-medium hover:border-ink-3">Search</button>
      </form>
      <AdminTable
        head={
          <>
            <SortTh base={base} sp={sp} column="name" label="Name" current={sort} asc={asc} />
            <SortTh base={base} sp={sp} column="email" label="Email" current={sort} asc={asc} />
            <SortTh base={base} sp={sp} column="plan" label="Plan" current={sort} asc={asc} />
            <Th>Telegram</Th>
            <SortTh base={base} sp={sp} column="created_at" label="Joined" current={sort} asc={asc} />
          </>
        }
        empty={!rows.length && (q ? `No student matches "${q}".` : "No students yet.")}
      >
        {rows.map((u) => (
          <tr key={u.id}>
            <td>
              <Link href={`/admin/users/${u.id}`} className="font-medium text-action underline-offset-4 hover:underline">{u.name || "No name"}</Link>
              {u.disabled_at && <span className="ml-2"><Badge tone="warning">Disabled</Badge></span>}
            </td>
            <td className="text-ink-2">{u.email}</td>
            <td>{u.plan === "free" ? (granted.has(u.id) ? "Pro (granted)" : "Free") : "Paid"}</td>
            <td className="text-ink-2">{u.telegram_chat_id ? "Connected" : "—"}</td>
            <td className="tabular text-ink-2">{shortDate(u.created_at)}</td>
          </tr>
        ))}
      </AdminTable>
      <Pager base={base} sp={sp} page={page} hasMore={(data ?? []).length > PAGE_SIZE} />
    </>
  );
}
