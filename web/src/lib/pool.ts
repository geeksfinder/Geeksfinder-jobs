/**
 * Run `fn` over every item with at most `limit` running at once, results in input order. Used to send alerts a few
 * at a time: fast enough for thousands of students, slow enough for Telegram's and Brevo's rate limits.
 * One item failing doesn't stop the rest: its result is the error.
 */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<(R | Error)[]> {
  const out: (R | Error)[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i], i);
      } catch (e) {
        out[i] = e instanceof Error ? e : new Error(String(e));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}
