import { BadRequestException } from "@nestjs/common";
import { isISO8601, isUUID } from "class-validator";

type Rule = { kind: "text" | "uuid" | "date" | "number" | "boolean" | "json"; required?: boolean; min?: number; max?: number; values?: string[] };
const text = (required = false, max = 200): Rule => ({ kind: "text", required, max });
const uuid = (required = false): Rule => ({ kind: "uuid", required });
const date = (required = false): Rule => ({ kind: "date", required });
const number = (required = false, min = 0, max = 999999999999): Rule => ({ kind: "number", required, min, max });
const boolean: Rule = { kind: "boolean" };
const json: Rule = { kind: "json" };
const choice = (...values: string[]): Rule => ({ kind: "text", values });

export const schemas: Record<string, Record<string, Rule>> = {
  academic_years: { name: text(true,120), starts_on: date(true), ends_on: date(true), is_active: boolean },
  semesters: { academic_year_id: uuid(true), name: text(true,120), starts_on: date(true), ends_on: date(true), is_active: boolean },
  classrooms: { academic_year_id: uuid(true), name: text(true,120), capacity: number(false,0,1000), homeroom_teacher_user_id: uuid(), is_active: boolean },
  subjects: { code: text(true,32), name: text(true,160), description: text(false,2000), is_active: boolean },
  teachers: { user_id: uuid(true), employee_number: text(), employment_status: choice("ACTIVE", "INACTIVE") },
  students: { user_id: uuid(), student_number: text(true), admission_date: date(), enrollment_status: choice("ACTIVE", "INACTIVE", "GRADUATED", "WITHDRAWN") },
  teacher_assignments: { teacher_id: uuid(true), subject_id: uuid(true), classroom_id: uuid(true), academic_year_id: uuid(true), semester_id: uuid(true), is_active: boolean },
  student_assignments: { student_id: uuid(true), classroom_id: uuid(true), academic_year_id: uuid(true), semester_id: uuid(true), is_active: boolean },
  courses: { subject_id: uuid(true), teacher_id: uuid(true), classroom_id: uuid(true), academic_year_id: uuid(true), semester_id: uuid(true), name: text(true), description: text(false, 4000), is_active: boolean },
  lessons: { course_id: uuid(true), title: text(true), material: text(false, 20000), attachment_url: text(false, 2000), scheduled_at: date(), is_published: boolean },
  assignments: { course_id: uuid(true), title: text(true), instructions: text(false, 20000), due_at: date(), max_score: number(), is_published: boolean },
  submissions: { assignment_id: uuid(true), student_id: uuid(true), content: text(false, 20000), attachment_url: text(false, 2000), submitted_at: date(), reviewed_by_teacher_id: uuid(), reviewed_at: date(), feedback: text(false, 4000), score: number() },
  attendance_records: { classroom_id: uuid(true), student_id: uuid(), teacher_id: uuid(), attendance_date: date(true), status: { ...choice("PRESENT", "LATE", "EXCUSED", "ABSENT"), required: true }, note: text(false, 4000) },
  attendance_qr_sessions: { classroom_id: uuid(true), token_hash: text(true, 128), opens_at: date(true), expires_at: date(true), is_active: boolean },
  exams: { course_id: uuid(true), title: text(true), description: text(false, 4000), starts_at: date(), ends_at: date(), status: choice("DRAFT", "PUBLISHED", "CLOSED") },
  exam_questions: { subject_id: uuid(true), question_type: { ...choice("MULTIPLE_CHOICE", "ESSAY", "TRUE_FALSE"), required: true }, prompt: text(true, 10000), options: json, answer_key: json, explanation: text(false, 10000), difficulty: choice("EASY", "MEDIUM", "HARD"), source: choice("MANUAL", "AI_DRAFT"), review_status: choice("DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED") },
  exam_sessions: { exam_id: uuid(true), classroom_id: uuid(true), student_id: uuid(), starts_at: date(true), ends_at: date(true), status: choice("SCHEDULED", "OPEN", "CLOSED") },
  exam_results: { exam_session_id: uuid(true), student_id: uuid(true), score: number(false, 0, 100), status: choice("PENDING", "GRADED", "PUBLISHED"), graded_at: date() },
  finance_accounts: { name: text(true), account_type: { ...choice("CASH", "BANK", "RECEIVABLE"), required: true }, is_active: boolean },
  finance_categories: { name: text(true), category_type: choice("INCOME", "EXPENSE"), is_active: boolean },
  finance_periods: { name: text(true), starts_on: date(true), ends_on: date(true), is_closed: boolean },
  student_bills: { student_id: uuid(true), category_id: uuid(true), period_id: uuid(), invoice_number: text(true), amount: number(true, 0.01), due_date: date(true), status: choice("DRAFT", "OPEN", "PARTIAL", "PAID", "VOID", "OVERDUE") },
  payments: { student_bill_id: uuid(true), account_id: uuid(true), receipt_number: text(true), amount: number(true, 0.01), paid_at: date(), status: choice("PENDING", "CONFIRMED", "VOID", "REFUNDED"), reference: text(false, 1000) },
};

export const relationTables: Record<string, string> = {
  user_id: "users", homeroom_teacher_user_id: "users", teacher_id: "teachers", reviewed_by_teacher_id: "teachers", student_id: "students", subject_id: "subjects", classroom_id: "classrooms", academic_year_id: "academic_years", semester_id: "semesters", course_id: "courses", assignment_id: "assignments", exam_id: "exams", exam_session_id: "exam_sessions", category_id: "finance_categories", period_id: "finance_periods", student_bill_id: "student_bills", account_id: "finance_accounts",
};

export function validateRecord(resource: string, body: unknown, update = false): Record<string, unknown> {
  const schema = schemas[resource];
  if (!schema || !body || typeof body !== "object" || Array.isArray(body)) throw new BadRequestException("Expected a record object");
  const values: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(body)) {
    const rule = schema[key];
    if (!Object.prototype.hasOwnProperty.call(schema, key)) throw new BadRequestException(`Field ${key} cannot be written`);
    if (raw === undefined) continue;
    if (raw === null) { if (rule.required) throw new BadRequestException(`${key} is required`); values[key] = null; continue; }
    const value = typeof raw === "string" ? raw.trim() : raw;
    const valid = rule.kind === "text" ? typeof value === "string" && (!rule.required || value.length > 0) && value.length <= (rule.max ?? 200) && (!rule.values || rule.values.includes(value))
      : rule.kind === "uuid" ? typeof value === "string" && isUUID(value)
      : rule.kind === "date" ? typeof value === "string" && isISO8601(value, { strict: true })
      : rule.kind === "number" ? typeof value === "number" && Number.isFinite(value) && value >= (rule.min ?? 0) && value <= (rule.max ?? Infinity)
      : rule.kind === "boolean" ? typeof value === "boolean"
      : typeof value === "object" && JSON.stringify(value).length <= 20000;
    if (!valid) throw new BadRequestException(`Invalid ${key}`);
    if (key.endsWith("_url") && value && (typeof value !== "string" || !/^https?:\/\//.test(value))) throw new BadRequestException(`Invalid ${key}`);
    values[key] = value;
  }
  if (!update) for (const [key, rule] of Object.entries(schema)) if (rule.required && values[key] == null) throw new BadRequestException(`${key} is required`);
  if (!Object.keys(values).length) throw new BadRequestException("At least one field is required");
  return values;
}
