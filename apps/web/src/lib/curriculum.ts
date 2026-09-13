export type CurriculumOption = { id: string; name: string };
export type CurriculumProgram = CurriculumOption & { framework: string; version: string; source_url?: string };
export type CurriculumOutcome = CurriculumOption & { code: string; program_id: string; curriculum_subject_id: string; kind: string; strand?: string; description: string; sequence: number; activity_type: string };
export type CurriculumScale = CurriculumOption & { program_id: string; kind: "NUMERIC" | "RUBRIC" | "LETTER" | "DESCRIPTOR"; minimum: number | null; maximum: number | null; labels: string[]; criteria?: string };
export type CurriculumAlignment = { id: string; outcome_id: string; purpose: string; lesson_id?: string; assignment_id?: string; question_set_id?: string; exam_id?: string; notes?: string };
export type CurriculumEvidence = { id: string; course_id: string; student_id: string; outcome_id: string; scale_id: string; assignment_id?: string; exam_id?: string; score: number | null; descriptor: string | null; feedback: string; assessed_at: string; status: "DRAFT" | "PUBLISHED"; assessment_context: { program: CurriculumProgram; outcome: CurriculumOutcome; scale: CurriculumScale; subject: CurriculumOption } };
export type CurriculumLearningData = { can_manage: boolean; programs: CurriculumProgram[]; subjects: CurriculumOption[]; outcomes: CurriculumOutcome[]; scales: CurriculumScale[]; students: CurriculumOption[]; lessons: CurriculumOption[]; assignments: CurriculumOption[]; question_sets: CurriculumOption[]; exams: CurriculumOption[]; alignments: CurriculumAlignment[]; evidence: CurriculumEvidence[] };
export function evidenceValue(e: CurriculumEvidence) {
 const s = e.assessment_context.scale;
 return e.score == null ? e.descriptor ?? "—" : `${e.score} (${s.minimum}–${s.maximum})`;
}
export function curriculumCsv(rows: CurriculumEvidence[], students: CurriculumOption[]) {
 const cell = (value: unknown) => `"${String(value ?? "").replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""')}"`;
 return [["Student", "Programme", "Version", "Subject", "Outcome", "Scale", "Result", "Feedback", "Assessed", "Status"], ...rows.map(e => [students.find(s => s.id === e.student_id)?.name ?? "Student", e.assessment_context.program.name, e.assessment_context.program.version, e.assessment_context.subject.name, e.assessment_context.outcome.code, e.assessment_context.scale.name, evidenceValue(e), e.feedback, e.assessed_at, e.status])].map(row => row.map(cell).join(",")).join("\r\n");
}
