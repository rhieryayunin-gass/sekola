import { Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { SupabaseService } from "../../common/supabase/supabase.service";
import { BoundedCache } from "../../common/data/bounded-cache";
import { PageDto, pageRange } from "../../common/data/page.dto";

@Injectable()
export class AnalyticsService {
  private readonly cache = new BoundedCache<Record<string, Record<string, unknown>[]>>();
  constructor(private readonly supabase: SupabaseService) {}
  private async rows(userId: string, views: Record<string, string>, page: PageDto = new PageDto()) {
    const client = this.supabase.getClient();
    const { data: user, error } = await client.from("users").select("tenant_id,is_active").eq("id", userId).single();
    if (error || !user?.tenant_id || !user.is_active) throw new NotFoundException("Active tenant user not found");
    const range = pageRange(page);
    const key = JSON.stringify([user.tenant_id, userId, Object.keys(views), range]);
    return this.cache.get(key, async () => {
      const results = await Promise.all(Object.entries(views).map(([view, order]) => client.from(view).select("*").eq("tenant_id", user.tenant_id).order(order).range(...range)));
      if (results.some(result => result.error)) throw new InternalServerErrorException("Unable to load analytics");
      return Object.fromEntries(Object.keys(views).map((view, index) => [view, results[index].data ?? []]));
    });
  }
  academic(userId: string, page?: PageDto) { return this.rows(userId, { academic_student_analytics: "student_id", academic_teacher_analytics: "teacher_id", academic_classroom_analytics: "classroom_id", academic_subject_analytics: "subject_id" }, page); }
  attendance(userId: string, page?: PageDto) { return this.rows(userId, { attendance_student_analytics: "student_id", attendance_classroom_analytics: "classroom_id", attendance_teacher_analytics: "teacher_id" }, page); }
  async finance(userId: string) { return (await this.rows(userId, { finance_analytics: "tenant_id" })).finance_analytics[0] ?? {}; }
  async executive(userId: string) { return (await this.rows(userId, { executive_dashboard: "tenant_id" })).executive_dashboard[0] ?? {}; }
}
