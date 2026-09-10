import { AuthModule } from "../auth/auth.module";
import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../../common/authorization/authorization.module";
import { SupabaseModule } from "../../common/supabase/supabase.module";
import { PermissionsController } from "./permissions.controller";
import { PermissionsService } from "./permissions.service";
@Module({ imports: [AuthModule, SupabaseModule, AuthorizationModule], controllers: [PermissionsController], providers: [PermissionsService] })
export class PermissionsModule {}
