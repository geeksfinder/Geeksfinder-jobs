/** Pure helpers safe to import from client components. */

/** Open-redirect guard: only allow internal relative paths. */
export function safeNext(next: string | null | undefined, fallback = "/dashboard") {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || /[\r\n]/.test(next)) return fallback;
  try {
    const u = new URL(next, "http://x");
    return u.host === "x" ? u.pathname + u.search : fallback;
  } catch {
    return fallback;
  }
}

/** Uploaded file really is a PDF (magic bytes %PDF-), not a renamed .exe. Browser-safe (free tools check uploads too). */
export function isPdf(bytes: Uint8Array) {
  return bytes.length > 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}
