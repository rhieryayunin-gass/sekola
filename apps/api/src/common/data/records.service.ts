import { BadRequestException, ForbiddenException, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.service";
import { databaseError } from "./database-error";
import { PageDto, pageRange } from "./page.dto";
import { relationTables, validateRecord } from "./record-schema";

/** Server-owned fields never reach SQL. All mutations + audit + integrations commit together. */
export class RecordsService {
  constructor(protected readonly supabase: SupabaseService, private readonly moduleName: string) {}
  protected get client() { return this.supabase.getClient(); }
  protected async tenant(userId: string) {
    const { data, error } = await this.client.from("users").select("tenant_id,is_active").eq("id", userId).single();
    if (error || !data?.tenant_id || !data.is_active) throw new NotFoundException("Active tenant user not found");
    return data.tenant_id as string;
  }
  private async learner(userId: string, tenantId: string) {
    const permission = await this.client.rpc("app_has_permission", { actor_id: userId, permission_code: "courses.create" });
    if (permission.error) throw new InternalServerErrorException("Unable to resolve submission access");
    if (permission.data === true) return undefined;
    const { data, error } = await this.client.from("students").select("id").eq("user_id", userId).eq("tenant_id", tenantId).maybeSingle();
    if (error) throw new InternalServerErrorException("Unable to resolve student scope");
    if (!data?.id) throw new ForbiddenException("Student profile required");
    return data.id as string;
  }
  async list(userId: string, resource: string, page = new PageDto()) {
    const tenantId = await this.tenant(userId);
    let query = this.client.from(resource).select("*").eq("tenant_id", tenantId);
    if (resource === "submissions") { const student = await this.learner(userId, tenantId); if (student) query = query.eq("student_id", student); }
    const { data, error } = await query.order("created_at", { ascending: false }).order("id").range(...pageRange(page));
    if (error) databaseError(error);
    return data ?? [];
  }
  async save(userId: string, resource: string, body: unknown, id?: string) {
    const values = validateRecord(resource, body, Boolean(id));
    const tenantId = await this.tenant(userId);
    let before: Record<string, unknown> = {};
    if (id) { const result = await this.client.from(resource).select("*").eq("id", id).eq("tenant_id", tenantId).single(); if (!result.data) throw new NotFoundException("Record not found"); before = result.data; }
    const merged = { ...before, ...values };
    if (merged.academic_year_id) for (const key of ["semester_id", "classroom_id"]) {
      if (!merged[key]) continue;
      const { data } = await this.client.from(relationTables[key]).select("id").eq("id", String(merged[key])).eq("tenant_id", tenantId).eq("academic_year_id", String(merged.academic_year_id)).single();
      if (!data) throw new BadRequestException(`${key} belongs to another academic year`);
    }
    for (const [key, table] of Object.entries(relationTables)) {
      if (!merged[key]) continue;
      const { data, error } = await this.client.from(table).select("id").eq("id", String(merged[key])).eq("tenant_id", tenantId).single();
      if (error || !data) throw new BadRequestException(`${key} does not belong to the current tenant`);
    }
    if (resource === "submissions") {
      const student = await this.learner(userId, tenantId);
      if (student && (merged.student_id !== student || ["score", "feedback", "reviewed_by_teacher_id", "reviewed_at"].some(key => key in values))) throw new ForbiddenException("Students may only submit their own ungraded work");
      if (student) {
        const { data: assignment } = await this.client.from("assignments").select("is_published,courses(classroom_id,semester_id)").eq("id", String(merged.assignment_id)).eq("tenant_id", tenantId).single();
        const course = Array.isArray(assignment?.courses) ? assignment.courses[0] : assignment?.courses;
        if (!assignment?.is_published || !course) throw new ForbiddenException("Assignment is not available");
        const { data: enrollment } = await this.client.from("student_assignments").select("id").eq("tenant_id", tenantId).eq("student_id", student).eq("classroom_id", course.classroom_id).eq("semester_id", course.semester_id).eq("is_active", true).limit(1).maybeSingle();
        if (!enrollment) throw new ForbiddenException("Assignment is outside your classroom");
      }
    }
    if (resource === "exam_questions" && merged.source === "AI_DRAFT") {
      if (!id) { if (values.review_status === "APPROVED") throw new BadRequestException("AI drafts require a separate review"); values.review_status = values.review_status ?? "PENDING_REVIEW"; }
      else if (values.review_status === "APPROVED") { values.reviewed_by_user_id = userId; values.reviewed_at = new Date().toISOString(); }
    }
    for (const [start, end] of [["starts_at", "ends_at"], ["starts_on", "ends_on"], ["opens_at", "expires_at"]]) {
      if (merged[start] && merged[end] && Date.parse(String(merged[end])) <= Date.parse(String(merged[start]))) throw new BadRequestException(`${end} must be after ${start}`);
    }
    if (resource === "attendance_records" && Boolean(merged.student_id) === Boolean(merged.teacher_id)) throw new BadRequestException("Exactly one student or teacher is required");
    const { data, error } = await this.client.rpc("mutate_tenant_record", { actor_id: userId, resource, record_id: id ?? null, operation: id ? "UPDATE" : "CREATE", payload: values, module_name: this.moduleName });
    if (error || !data) databaseError(error);
    return data;
  }
  create(userId: string, resource: string, body: unknown) { return this.save(userId, resource, body); }
  update(userId: string, resource: string, id: string, body: unknown) { return this.save(userId, resource, body, id); }
  async remove(userId: string, resource: string, id: string) {
    await this.tenant(userId);
    const { data, error } = await this.client.rpc("mutate_tenant_record", { actor_id: userId, resource, record_id: id, operation: "DELETE", payload: {}, module_name: this.moduleName });
    if (error) databaseError(error);
    return data;
  }
}
