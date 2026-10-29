import { AdminAction } from "@/components/admin/AdminAction";
import { AdminTable, Th } from "@/components/admin/Table";
import { Badge } from "@/components/ui/Highlighter";
import { requireAdmin } from "@/lib/admin/auth";
import { AREA_ROLES } from "@/lib/admin/constants";
import { SITE } from "@/lib/site";
import { allRows } from "@/lib/supabase/all-rows";

export const metadata = { title: "Ambassadors" };

type Amb = { code: string; name: string; college: string; city: string; active: boolean; created_at: string };

/**
 * A13 Ambassadors (SPEC.md §4): each campus ambassador's link (/r/<code>) and what it brought in: signups, students
 * who turned alerts on, and paid students. Counts come from attributions (first touch) and funnel events.
 */
export default async function Ambassadors() {
  const { admin } = await requireAdmin(AREA_ROLES.ambassadors);
  const [{ data }, attrs, events] = await Promise.all([
    admin.from("ambassadors").select("code, name, college, city, active, created_at").order("created_at", { ascending: false }),
    allRows<{ user_id: string; ref_code: string | null }>((a, b) => admin.from("attributions").select("user_id, ref_code").not("ref_code", "is", null).order("user_id").range(a, b)),
    allRows<{ name: string; user_id: string }>((a, b) => admin.from("events").select("name, user_id").in("name", ["channel_connected", "paid_first"]).order("id").range(a, b)),
  ]);
  const ambassadors = (data ?? []) as Amb[];
  const usersByCode = new Map<string, Set<string>>();
  for (const a of attrs) if (a.ref_code) (usersByCode.get(a.ref_code) ?? usersByCode.set(a.ref_code, new Set()).get(a.ref_code)!).add(a.user_id);
  const did = (name: string) => new Set(events.filter((e) => e.name === name).map((e) => e.user_id));
  const connected = did("channel_connected");
  const paid = did("paid_first");
  const count = (code: string, set?: Set<string>) => [...(usersByCode.get(code) ?? [])].filter((u) => !set || set.has(u)).length;

  return (
    <>
      <h1 className="text-h1 font-bold">Ambassadors</h1>
      <p className="mb-6 mt-1 text-body text-ink-2">Each ambassador shares their own link. A student counts for the first link that brought them, within 30 days.</p>

      <div className="panel mb-8 p-4">
        <h2 className="mb-2 text-body font-semibold">Add an ambassador</h2>
        <AdminAction
          action="/api/admin/ambassadors"
          label="Add ambassador"
          success="Ambassador added"
          extra={{ action: "add" }}
          fields={[
            { name: "name", label: "Name", type: "text", placeholder: "Priya Sharma", required: true },
            { name: "college", label: "College", type: "text", placeholder: "COEP Pune", required: true },
            { name: "city", label: "City", type: "text", placeholder: "Pune", required: true },
            { name: "code", label: "Link code", type: "text", placeholder: "PUNE-AMB-07", required: true },
          ]}
        />
      </div>

      <AdminTable head={<><Th>Ambassador</Th><Th>Link</Th><Th>Signups</Th><Th>Alerts on</Th><Th>Paid</Th><Th>Status</Th><Th /></>} empty={!ambassadors.length && "No ambassadors yet. Add the first one above."}>
        {ambassadors.map((a) => (
          <tr key={a.code}>
            <td>
              <span className="font-medium">{a.name}</span>
              <span className="block text-small text-ink-2">{a.college} · {a.city}</span>
            </td>
            <td className="text-small text-ink-2">{`${SITE.url.replace(/^https?:\/\//, "")}/r/${a.code}`}</td>
            <td className="tabular">{count(a.code)}</td>
            <td className="tabular">{count(a.code, connected)}</td>
            <td className="tabular">{count(a.code, paid)}</td>
            <td>{a.active ? <Badge tone="success">Active</Badge> : <Badge>Paused</Badge>}</td>
            <td className="text-right">
              <AdminAction action="/api/admin/ambassadors" label={a.active ? "Pause" : "Resume"} success={a.active ? "Ambassador paused" : "Ambassador resumed"} variant="text" extra={{ action: a.active ? "pause" : "resume", code: a.code }} inline />
            </td>
          </tr>
        ))}
      </AdminTable>
    </>
  );
}
