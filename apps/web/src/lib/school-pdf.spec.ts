import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { questionPdf, reportPdf } from "./school-pdf";

describe("school PDF exports", () => {
  it("creates a readable multipage question paper with diagrams and long content", async () => {
    const bytes = await questionPdf("Matematika – Kelas 6", "Sekolah Demo", Array.from({ length: 30 }, (_, i) => ({
      question_type: "MULTIPLE_CHOICE" as const, prompt: `${i + 1}. Perhatikan jumlah buku pada diagram. `.repeat(8),
      options: ["Dua", "Empat", "Enam", "Delapan"], answer: "Empat", explanation: "Teacher-only explanation",
      difficulty: "MEDIUM" as const, review_status: "APPROVED",
      diagram: { type: "bar" as const, title: "Jumlah buku", labels: ["Kelas A", "Kelas B"], values: [4, 8], unit: "buku" },
    })));
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBeGreaterThan(1);
    expect(document.getTitle()).toBe("Matematika – Kelas 6");
  });
  it("exports an empty filtered report without creating a blank or invalid document", async () => {
    const document = await PDFDocument.load(await reportPdf("Laporan", "September 2026", ["Tidak ada transaksi"], []));
    expect(document.getPageCount()).toBe(1);
    expect(document.getAuthor()).toBe("OSEKOLA");
  });
});
