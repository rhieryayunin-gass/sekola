import { Injectable } from "@nestjs/common";
import { SupabaseService } from "../../common/supabase/supabase.service";
import { RecordsService } from "../../common/data/records.service";
import { databaseError } from "../../common/data/database-error";

export type FinanceResource = "finance_accounts" | "finance_categories" | "finance_periods" | "student_bills" | "payments";
@Injectable()
export class FinanceService extends RecordsService {
  constructor(supabase: SupabaseService) { super(supabase, "FINANCE"); }
  async dashboard(userId: string) {
    const tenantId = await this.tenant(userId);
    const { data, error } = await this.client.from("finance_dashboard").select("*").eq("tenant_id", tenantId);
    if (error) databaseError(error);
    return data ?? [];
  }
}
