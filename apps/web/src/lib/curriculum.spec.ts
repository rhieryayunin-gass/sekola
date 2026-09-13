import { describe, expect, it } from "vitest";
import { curriculumCsv, evidenceValue, type CurriculumEvidence } from "./curriculum";
const evidence = { student_id: "student", score: 6, descriptor: null, feedback: '=HYPERLINK("malicious")', assessed_at: "2026-09-13", status: "PUBLISHED", assessment_context: { program: { name: "Cambridge school programme", version: "2025–2027" }, subject: { name: "Mathematics" }, outcome: { code: "LO1" }, scale: { name: "School rubric", minimum: 0, maximum: 8 } } } as CurriculumEvidence;
describe("Curriculum progress export", () => {
 it("keeps programme scale and historical version without converting to percentage", () => {
  expect(evidenceValue(evidence)).toBe("6 (0–8)");
  const csv = curriculumCsv([evidence], [{ id: "student", name: "Student A" }]);
  expect(csv).toContain('"2025–2027"'); expect(csv).toContain('"6 (0–8)"'); expect(csv).not.toContain("75%");
 });
 it("escapes quotes, line breaks and spreadsheet formulas in school-entered text", () => {
  const csv = curriculumCsv([evidence], [{ id: "student", name: "+Formula\nName" }]);
  expect(csv).toContain('"\'+Formula\nName"'); expect(csv).toContain('"\'=HYPERLINK(""malicious"")"');
 });
 it("preserves a descriptor without manufacturing a numeric grade", () => expect(evidenceValue({ ...evidence, score: null, descriptor: "Secure" })).toBe("Secure"));
});
