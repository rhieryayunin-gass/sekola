import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const migration=(file:string)=>readFileSync(resolve(process.cwd(),`database/migrations/${file}`),"utf8");

describe("Analytics Phase 47-50 migrations",()=>{
  it("provides student, teacher, classroom, and subject academic views",()=>{const sql=migration("0052_academic_analytics.sql");for(const view of ["academic_student_analytics","academic_teacher_analytics","academic_classroom_analytics","academic_subject_analytics"])expect(sql).toContain(`view public.${view}`);});
  it("provides attendance and finance indicators",()=>{expect(migration("0053_attendance_analytics.sql")).toContain("attendance_rate");const finance=migration("0054_finance_analytics.sql");for(const metric of ["revenue","receivable","payment_count","outstanding_amount"])expect(finance).toContain(metric);});
  it("combines all roadmap domains in the executive snapshot",()=>{const sql=migration("0055_executive_dashboard.sql");for(const metric of ["average_exam_score","attendance_rate","finance_revenue","published_lessons","active_projects","pending_approvals"])expect(sql).toContain(metric);expect(sql).toContain("executive_dashboard.read");});
});
