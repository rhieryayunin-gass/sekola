import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../../common/authorization/authorization.module";
import { SupabaseModule } from "../../common/supabase/supabase.module";
import { AuditModule } from "../audit/audit.module";
import { OperationsController } from "./operations.controller";
import { OperationsService } from "./operations.service";

@Module({ imports: [SupabaseModule, AuthorizationModule, AuditModule], controllers: [OperationsController], providers: [OperationsService] })
export class OperationsModule {}
