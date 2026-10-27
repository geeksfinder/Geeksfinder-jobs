import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { SITE } from "./site";

/**
 * SSRF guard for the careers-page scraper and news fetcher (plan §7):
 * http/https only, public IPs only (no localhost, 169.254.x.x, private ranges),
 * redirects re-checked hop by hop, timeout and response size cap.
 */

export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) || a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  return v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") || v6.startsWith("ff");
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("blocked: scheme");
  if (url.username || url.password) throw new Error("blocked: credentials in url");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new Error("blocked: local host");
  }
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("blocked: private address");
  return url;
}

export async function safeFetch(
  raw: string,
  { timeoutMs = 6000, maxBytes = 1_000_000, maxRedirects = 3, headers = {} as Record<string, string> } = {},
): Promise<{ status: number; url: string; text: string; bytes: Uint8Array; truncated: boolean; contentType: string }> {
  let current = raw;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertPublicUrl(current);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": `GeeksFinderBot/1.0 (+${SITE.url}/about)`, ...headers },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, url).toString();
      continue;
    }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    let truncated = false;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) { truncated = true; await reader.cancel(); break; }
        chunks.push(value);
      }
    }
    // Bytes for files (PDF notices); text for pages
    const bytes = new Uint8Array(Buffer.concat(chunks));
    const text = new TextDecoder().decode(bytes);
    return { status: res.status, url: url.toString(), text, bytes, truncated, contentType: res.headers.get("content-type") ?? "" };
  }
  throw new Error("blocked: too many redirects");
}
