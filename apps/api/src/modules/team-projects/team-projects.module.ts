import { AuthModule } from "../auth/auth.module";
import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../../common/authorization/authorization.module";
import { SupabaseModule } from "../../common/supabase/supabase.module";
import { AuditModule } from "../audit/audit.module";
import { TeamProjectsController } from "./team-projects.controller";
import { TeamProjectsService } from "./team-projects.service";

@Module({
  imports: [AuthModule, SupabaseModule, AuthorizationModule, AuditModule],
  controllers: [TeamProjectsController],
  providers: [TeamProjectsService],
})
export class TeamProjectsModule {}
