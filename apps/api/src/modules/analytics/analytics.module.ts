import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../../common/authorization/authorization.module";
import { SupabaseModule } from "../../common/supabase/supabase.module";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";

@Module({ imports: [SupabaseModule, AuthorizationModule], controllers: [AnalyticsController], providers: [AnalyticsService] })
export class AnalyticsModule {}
