import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import type { QuestionContent } from "./question-schema";

// PDF generation stays in the browser; school records never leave the session.
const ink = rgb(.09, .14, .22);
const blue = rgb(.004, .494, 1);
const printable = (value: unknown) => String(value ?? "").replace(/[−×÷≤≥≠√π∞]/g, char => ({ "−": "-", "×": "x", "÷": "/", "≤": "<=", "≥": ">=", "≠": "!=", "√": "sqrt", "π": "pi", "∞": "infinity" })[char]!).replace(/[\u2010-\u2015]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\u2026/g, "...").replace(/[^\x20-\x7e\xa0-\xff\n]/g, " ");

async function writer(title: string, subtitle: string) {
  const doc = await PDFDocument.create();
  doc.setTitle(title); doc.setAuthor("OSEKOLA");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage; let y = 0;
  function newPage() {
    page = doc.addPage([595.28, 841.89]); y = 748;
    page.drawText("OSEKOLA", { x: 44, y: 795, size: 12, font: bold, color: blue });
    page.drawLine({ start: { x: 44, y: 781 }, end: { x: 551, y: 781 }, color: rgb(.8, .86, .91), thickness: 1 });
  }
  function ensure(height: number) { if (y - height < 54) newPage(); }
  function lines(value: string, font: PDFFont, size: number, width: number) {
    const result: string[] = [];
    for (const paragraph of printable(value).split("\n")) {
      let line = "";
      for (const char of paragraph) {
        if (line && font.widthOfTextAtSize(line + char, size) > width) { result.push(line); line = ""; }
        line += char;
      }
      result.push(line);
    }
    return result;
  }
  function text(value: string, size = 11, strong = false, indent = 0) {
    const font = strong ? bold : regular;
    for (const line of lines(value, font, size, 507 - indent)) {
      ensure(size + 7); page.drawText(line, { x: 44 + indent, y, size, font, color: ink }); y -= size + 7;
    }
    y -= 5;
  }
  function diagram(data: NonNullable<QuestionContent["diagram"]>) {
    ensure(200); text(data.title, 11, true);
    const top = y; const max = Math.max(...data.values, 1);
    const rowHeight = 18;
    data.labels.forEach((label, i) => {
      const baseline = top - i * rowHeight;
      page.drawText(printable(label).slice(0, 22), { x: 52, y: baseline, size: 8, font: regular, color: ink });
      page.drawRectangle({ x: 168, y: baseline - 2, width: Math.max(1, data.values[i] / max * 280), height: 10, color: blue });
      page.drawText(printable(`${data.values[i]} ${data.unit}`), { x: 459, y: baseline, size: 8, font: regular, color: ink });
    });
    y = top - data.labels.length * rowHeight - 16;
  }
  async function finish() {
    for (const [i, p] of doc.getPages().entries()) p.drawText(`${i + 1} / ${doc.getPageCount()}`, { x: 505, y: 30, size: 8, font: regular, color: ink });
    return doc.save();
  }
  newPage(); text(title, 20, true); text(subtitle, 10);
  return { text, diagram, finish };
}

export async function questionPdf(title: string, school: string, questions: (QuestionContent & { review_status?: string })[]) {
  const pdf = await writer(title, school);
  for (const [index, question] of questions.entries()) {
    pdf.text(`${index + 1}. ${question.prompt}`, 12, true);
    if (question.review_status !== "APPROVED") pdf.text("DRAFT / DRAF - Teacher review required / Perlu tinjauan guru", 9);
    if (question.diagram) pdf.diagram(question.diagram);
    for (const [optionIndex, option] of question.options.entries()) pdf.text(`${String.fromCharCode(65 + optionIndex)}. ${option}`, 11, false, 12);
    if (question.question_type === "ESSAY") pdf.text("________________________________________________________________\n________________________________________________________________", 10);
  }
  // Deliberately excludes answer keys and explanations from the student copy.
  return pdf.finish();
}

export async function reportPdf(title: string, subtitle: string, summary: string[], rows: string[][]) {
  const pdf = await writer(title, subtitle);
  summary.forEach(line => pdf.text(line, 11, true));
  rows.forEach((cells, i) => { pdf.text(`${i + 1}. ${cells.slice(0, 2).join(" | ")}`, 11, true); pdf.text(cells.slice(2).join(" | "), 10); });
  return pdf.finish();
}

export function downloadPdf(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
