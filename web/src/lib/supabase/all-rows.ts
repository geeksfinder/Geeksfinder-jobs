/**
 * Supabase (PostgREST) returns at most 1,000 rows per request whatever .limit() says. For tables that can grow past
 * that (companies, contacts, jobs) read page by page. `page(from, to)` must return the query with .range(from, to).
 */
const PAGE = 1000;

export async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, max = 100_000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}
