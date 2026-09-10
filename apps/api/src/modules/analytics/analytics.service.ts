import { Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { SupabaseService } from "../../common/supabase/supabase.service";

@Injectable()
export class AnalyticsService {
  constructor(private readonly supabase: SupabaseService) {}
  private get client() { return this.supabase.getClient(); }
  private async tenant(userId: string) { const { data } = await this.client.from("users").select("tenant_id,is_active").eq("id", userId).single(); if (!data?.tenant_id || !data.is_active) throw new NotFoundException("Active tenant user not found"); return data.tenant_id as string; }
  private async rows(userId: string, views: string[]) { const tenantId = await this.tenant(userId); const results = await Promise.all(views.map((view) => this.client.from(view).select("*").eq("tenant_id", tenantId))); const failed = results.find((result) => result.error); if (failed?.error) throw new InternalServerErrorException("Unable to load analytics"); return Object.fromEntries(views.map((view, index) => [view, results[index].data ?? []])); }
  academic(userId: string) { return this.rows(userId, ["academic_student_analytics", "academic_teacher_analytics", "academic_classroom_analytics", "academic_subject_analytics"]); }
  attendance(userId: string) { return this.rows(userId, ["attendance_student_analytics", "attendance_classroom_analytics", "attendance_teacher_analytics"]); }
  async finance(userId: string) { const data = await this.rows(userId, ["finance_analytics"]); return data.finance_analytics[0] ?? {}; }
  async executive(userId: string) { const data = await this.rows(userId, ["executive_dashboard"]); return data.executive_dashboard[0] ?? {}; }
}
