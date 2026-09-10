import { Injectable } from "@nestjs/common";
import { SupabaseService } from "../../common/supabase/supabase.service";
import { RecordsService } from "../../common/data/records.service";
import { databaseError } from "../../common/data/database-error";
import { PageDto, pageRange } from "../../common/data/page.dto";

@Injectable()
export class AssessmentService extends RecordsService {
  constructor(supabase: SupabaseService) { super(supabase, "ASSESSMENT"); }
  async analytics(userId: string, page = new PageDto()) {
    const tenantId = await this.tenant(userId);
    const { data, error } = await this.client.from("exam_analytics").select("*").eq("tenant_id", tenantId).order("exam_id").range(...pageRange(page));
    if (error) databaseError(error);
    return data ?? [];
  }
}
