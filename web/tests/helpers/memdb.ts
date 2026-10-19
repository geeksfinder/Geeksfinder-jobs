/**
 * In-memory stand-in for the Supabase query builder, enough for route tests that need real state between calls
 * (codes, contacts, webhook idempotency). Unique rules mimic the database's unique indexes and return 23505.
 */
type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;
type Unique = (row: Row, existing: Row[]) => boolean;

const UNIQUE: Record<string, Unique> = {
  webhook_events: (r, xs) => xs.some((x) => x.id === r.id),
  wa_inbound: (r, xs) => xs.some((x) => x.meta_message_id === r.meta_message_id),
  wa_messages: (r, xs) =>
    (r.meta_message_id != null && xs.some((x) => x.meta_message_id === r.meta_message_id)) ||
    (r.kind === "digest" && xs.some((x) => x.kind === "digest" && x.user_id === r.user_id && x.send_date === r.send_date)),
  whatsapp_contacts: (r, xs) => xs.some((x) => x.user_id === r.user_id) || (r.status === "verified" && xs.some((x) => x.status === "verified" && x.phone_e164 === r.phone_e164)),
  events: (r, xs) => xs.some((x) => x.user_id === r.user_id && x.name === r.name),
};

let seq = 0;

export function memDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  const t = (name: string) => (tables[name] ??= []);

  function from(table: string) {
    const filters: Filter[] = [];
    let mode: "select" | "insert" | "update" | "delete" | "upsert" = "select";
    let payload: Row[] = [];
    let patch: Row = {};
    let conflictCol: string | null = null;
    let orderBy: { col: string; asc: boolean } | null = null;
    let lim: number | null = null;
    let one: "single" | "maybe" | null = null;

    const run = () => {
      const rows = t(table);
      if (mode === "insert" || mode === "upsert") {
        const out: Row[] = [];
        for (const r of payload) {
          const row: Row = { id: r.id ?? `id-${++seq}`, created_at: new Date().toISOString(), ...r };
          if (mode === "upsert" && conflictCol) {
            const hit = rows.find((x) => x[conflictCol!] === row[conflictCol!]);
            if (hit) {
              Object.assign(hit, r);
              out.push(hit);
              continue;
            }
          }
          if (UNIQUE[table]?.(row, rows)) return { data: null, error: { code: "23505", message: "duplicate key" } };
          rows.push(row);
          out.push(row);
        }
        return { data: one ? (out[0] ?? null) : out, error: null };
      }
      const hits = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === "update") {
        for (const h of hits) {
          const next = { ...h, ...patch };
          if (UNIQUE[table]?.(next, rows.filter((x) => x !== h))) return { data: null, error: { code: "23505", message: "duplicate key" } };
          Object.assign(h, patch);
        }
        return { data: hits, error: null };
      }
      if (mode === "delete") {
        tables[table] = rows.filter((r) => !hits.includes(r));
        return { data: hits, error: null };
      }
      let out = [...hits];
      if (orderBy) {
        const { col, asc } = orderBy;
        out.sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : 1) * (asc ? 1 : -1));
      }
      if (lim != null) out = out.slice(0, lim);
      // Like the real client, reads return copies: a later update must not change rows already read
      out = out.map((r) => ({ ...r }));
      if (one) return { data: out[0] ?? null, error: null };
      return { data: out, error: null };
    };

    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
      gt: (c: string, v: string) => (filters.push((r) => String(r[c]) > v), q),
      gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), q),
      lt: (c: string, v: string) => (filters.push((r) => String(r[c]) < v), q),
      lte: (c: string, v: string) => (filters.push((r) => String(r[c]) <= v), q),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
      ilike: (c: string, v: string) => (filters.push((r) => String(r[c] ?? "").toLowerCase() === v.toLowerCase()), q),
      order: (col: string, o?: { ascending?: boolean }) => ((orderBy = { col, asc: o?.ascending !== false }), q),
      limit: (n: number) => ((lim = n), q),
      maybeSingle: async () => ((one = "maybe"), run()),
      single: async () => ((one = "single"), run()),
      insert: (r: Row | Row[]) => ((mode = "insert"), (payload = Array.isArray(r) ? r : [r]), q),
      upsert: (r: Row | Row[], o?: { onConflict?: string }) => ((mode = "upsert"), (payload = Array.isArray(r) ? r : [r]), (conflictCol = o?.onConflict ?? null), q),
      update: (p: Row) => ((mode = "update"), (patch = p), q),
      delete: () => ((mode = "delete"), q),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    };
    return q;
  }

  return { from, tables, rpc: async () => ({ data: null, error: null }) };
}
