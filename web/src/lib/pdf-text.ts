import { isPdf } from "./security-client";

/**
 * A resume PDF's text, read where this runs. The free tools call it in the browser, so the file never leaves the
 * student's device. The PDF library is loaded only when a file is picked, so tool pages stay light.
 */
export const RESUME_PDF_MAX_BYTES = 2 * 1024 * 1024;
export const RESUME_PDF_MAX_PAGES = 6;

export type PdfTextResult = { ok: true; text: string; words: number } | { ok: false; error: string };

export async function resumePdfText(file: { size: number; arrayBuffer: () => Promise<ArrayBuffer> }): Promise<PdfTextResult> {
  if (file.size > RESUME_PDF_MAX_BYTES) return { ok: false, error: "Your PDF is over 2 MB. Export a smaller PDF and try again." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isPdf(bytes)) return { ok: false, error: "This file isn't a PDF. Choose your resume as a PDF." };
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    if (pdf.numPages > RESUME_PDF_MAX_PAGES) return { ok: false, error: "Your resume is over 6 pages. Choose a 1–2 page resume." };
    const text = (await extractText(pdf, { mergePages: true })).text.replace(/[ \t]+\n/g, "\n").trim();
    const words = text ? text.split(/\s+/).length : 0;
    if (words < 30) return { ok: false, error: "This PDF has no readable text (it may be a scanned image). Paste your resume text instead." };
    return { ok: true, text, words };
  } catch {
    return { ok: false, error: "We couldn't read this PDF. Re-export it from Word or Google Docs, or paste the text instead." };
  }
}
