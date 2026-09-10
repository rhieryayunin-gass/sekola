import { Injectable } from "@nestjs/common";
import { SupabaseService } from "../../common/supabase/supabase.service";
import { RecordsService } from "../../common/data/records.service";

@Injectable()
export class LearningService extends RecordsService {
  constructor(supabase: SupabaseService) { super(supabase, "LEARNING"); }
}
