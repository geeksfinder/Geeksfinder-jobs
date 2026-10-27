import { StyleSheet } from "@react-pdf/renderer";

/**
 * One look for every PDF a student downloads (tailored resume, cover letter): single column, standard fonts, so ATS
 * parsers read it cleanly. PDF colours are document values, not UI tokens.
 */
export const pdf = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Times-Roman", lineHeight: 1.4, color: "#14213D" },
  name: { fontSize: 18, fontFamily: "Times-Bold" },
  contact: { marginTop: 2, color: "#4A5568" },
  h: { marginTop: 12, marginBottom: 4, fontSize: 10.5, fontFamily: "Helvetica-Bold", borderBottom: "0.75 solid #7A8494", paddingBottom: 2 },
  bold: { fontFamily: "Times-Bold" },
  item: { marginBottom: 6 },
  letter: { fontSize: 11, lineHeight: 1.5 },
  para: { marginBottom: 10 },
});

/** "Priya_Sharma_Bosch" style file names: letters and digits only. */
export const fileName = (...parts: string[]) => parts.map((p) => p.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "")).filter(Boolean).join("_");
