import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseWs = supabase.replace(/^https:/, "wss:");

// Security headers (plan §7). Razorpay Checkout and Cloudflare Turnstile are the only third-party scripts/frames.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ""} https://checkout.razorpay.com https://cdn.razorpay.com https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabase} ${supabaseWs} https://api.razorpay.com https://lumberjack.razorpay.com https://challenges.cloudflare.com`,
  "frame-src https://api.razorpay.com https://checkout.razorpay.com https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  isDev ? "" : "upgrade-insecure-requests",
]
  .filter(Boolean)
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self \"https://checkout.razorpay.com\"), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["@react-pdf/renderer"],
  // pdfkit loads its built-in fonts (Times, Helvetica) lazily through "#standard-fonts/*", which Vercel's file tracer
  // misses: without this the PDF routes fail on Vercel only ("Couldn't create the PDF"). Check after upgrades with
  // the route's .nft.json after `next build`.
  outputFileTracingIncludes: {
    "/api/tailor/[id]/pdf": ["./node_modules/pdfkit/js/standard-fonts/**/*"],
    "/api/cover-letter/[id]/pdf": ["./node_modules/pdfkit/js/standard-fonts/**/*"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // App and API responses are private
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
  // IndexNow only accepts URLs under the key file's folder, so the key must be served from the site root
  async rewrites() {
    const key = process.env.INDEXNOW_KEY;
    return key && /^[a-zA-Z0-9-]{8,128}$/.test(key) ? [{ source: `/${key}.txt`, destination: "/api/indexnow-key" }] : [];
  },
};

export default nextConfig;
