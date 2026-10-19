import { AdminAction } from "@/components/admin/AdminAction";
import { AdminTable, PAGE_SIZE, Pager, Th, readQuery, type TableQuery } from "@/components/admin/Table";
import { Badge } from "@/components/ui/Highlighter";
import { requireAdmin } from "@/lib/admin/auth";
import { AREA_ROLES } from "@/lib/admin/constants";
import { shortDate } from "@/lib/format";

/** A9 HR outreach, do-not-contact part: flagged addresses are hidden from every student. */
export default async function DoNotContact({ searchParams }: { searchParams: Promise<TableQuery> }) {
  const { admin } = await requireAdmin(AREA_ROLES.dnc);
  const sp = await searchParams;
  const { page, from, to } = readQuery(sp, ["email"] as const, "email");
  const q = (sp.q ?? "").replace(/[%,()*\\]/g, " ").trim().slice(0, 80);

  let query = admin.from("company_contacts").select("id, email, company_domain, source, opted_out_at").eq("do_not_contact", true).order("opted_out_at", { ascending: false, nullsFirst: false }).range(from, to + 1);
  if (q) query = query.or(`email.ilike.%${q}%,company_domain.ilike.%${q}%`);
  const { data } = await query;
  const rows = (data ?? []).slice(0, PAGE_SIZE);
  const fromRecruiter = (source: string | null, optedOut: string | null) => !!optedOut || source === "hr opt-out" || source === "hr removal request";

  return (
    <>
      <h1 className="text-h1 font-bold">Do not contact</h1>
      <p className="mb-6 mt-1 text-body text-ink-2">These addresses never appear to students. Addresses a recruiter asked us to remove can&apos;t be allowed again from here.</p>

      <div className="panel mb-8 p-4">
        <h2 className="mb-2 text-body font-semibold">Add an address</h2>
        <AdminAction
          action="/api/admin/dnc"
          label="Add to do-not-contact"
          success="Added to do-not-contact"
          extra={{ action: "add" }}
          fields={[
            { name: "email", label: "Email", type: "email", placeholder: "hr@company.com", required: true },
            { name: "from_recruiter", label: "The recruiter asked us to remove it", type: "checkbox" },
          ]}
        />
      </div>

      <form className="mb-4 flex gap-2">
        <label htmlFor="dq" className="sr-only">Search</label>
        <input id="dq" name="q" defaultValue={q} placeholder="Search email or company domain" className="input max-w-sm" />
        <button className="h-11 rounded-control border border-line px-4 text-small font-medium hover:border-ink-3">Search</button>
      </form>
      <AdminTable head={<><Th>Email</Th><Th>Company</Th><Th>Why</Th><Th /></>} empty={!rows.length && (q ? `Nothing matches "${q}".` : "No flagged addresses yet.")}>
        {rows.map((c) => (
          <tr key={c.id}>
            <td>{c.email}</td>
            <td className="text-ink-2">{c.company_domain}</td>
            <td>{fromRecruiter(c.source, c.opted_out_at) ? <Badge tone="warning">Recruiter request{c.opted_out_at ? ` ${shortDate(c.opted_out_at)}` : ""}</Badge> : <Badge>Flagged by admin</Badge>}</td>
            <td className="text-right">
              {/* A recruiter's own request is never undone from here */}
              {!fromRecruiter(c.source, c.opted_out_at) && (
                <AdminAction action="/api/admin/dnc" label="Allow again" success="Allowed again" variant="text" extra={{ action: "remove", email: c.email }} inline />
              )}
            </td>
          </tr>
        ))}
      </AdminTable>
      <Pager base="/admin/dnc" sp={sp} page={page} hasMore={(data ?? []).length > PAGE_SIZE} />
    </>
  );
}
