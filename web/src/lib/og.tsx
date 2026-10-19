import { ImageResponse } from "next/og";
import { SITE } from "./site";

export const OG_SIZE = { width: 1200, height: 630 };

/** Shared OG card: white paper, navy ink, one highlighter stroke (DESIGN.md). Shown in WhatsApp/Telegram previews. */
export function ogCard({ eyebrow, title, footer }: { eyebrow: string; title: string; footer?: string }) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#FFFFFF", padding: 72, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 36, fontWeight: 700, color: "#14213D", letterSpacing: -1 }}>
          Geeks
          <span style={{ display: "flex", position: "relative" }}>
            <span style={{ position: "absolute", left: 0, right: 0, bottom: 4, height: 14, background: "#FFE45C", borderRadius: 4 }} />
            <span style={{ position: "relative" }}>Finder</span>
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 28, color: "#4A5568", marginBottom: 16 }}>{eyebrow}</div>
          <div style={{ fontSize: title.length > 70 ? 54 : 64, lineHeight: 1.1, fontWeight: 700, color: "#14213D", letterSpacing: -1.5 }}>{title}</div>
        </div>
        <div style={{ fontSize: 26, color: "#4A5568", borderTop: "2px solid #E3E7ED", paddingTop: 24 }}>{footer ?? `Fresher jobs matched to your resume · ${new URL(SITE.url).host}`}</div>
      </div>
    ),
    OG_SIZE,
  );
}
