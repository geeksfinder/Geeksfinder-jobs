import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";
import { resumePdfText } from "@/lib/pdf-text";

const fileOf = (bytes: Uint8Array, size = bytes.length) => ({ size, arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer });

describe("reading a resume PDF for the free tools", () => {
  it("refuses files over 2 MB before reading them", async () => {
    expect(await resumePdfText(fileOf(new Uint8Array(10), 3 * 1024 * 1024))).toEqual({ ok: false, error: expect.stringContaining("over 2 MB") });
  });
  it("refuses a renamed file that isn't a PDF", async () => {
    expect(await resumePdfText(fileOf(new TextEncoder().encode("MZ not a pdf")))).toEqual({ ok: false, error: expect.stringContaining("isn't a PDF") });
  });
  it("reads the text of a real PDF", async () => {
    const words = "SolidWorks CATIA AutoCAD GD&T ANSYS gearbox design project at COEP Pune with stress checks and weight savings ".repeat(3);
    const buf = await renderToBuffer(h(Document, null, h(Page, { size: "A4" }, h(Text, null, `Priya Sharma ${words}`))));
    const r = await resumePdfText(fileOf(new Uint8Array(buf)));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain("SolidWorks");
      expect(r.words).toBeGreaterThan(30);
    }
  }, 30_000);
  it("says so when a PDF has almost no text (a scanned image)", async () => {
    const buf = await renderToBuffer(h(Document, null, h(Page, { size: "A4" }, h(Text, null, "Priya"))));
    expect(await resumePdfText(fileOf(new Uint8Array(buf)))).toEqual({ ok: false, error: expect.stringContaining("no readable text") });
  }, 30_000);
});
