import { Module } from "@nestjs/common";

import { SupabaseModule } from "../../common/supabase/supabase.module";
import { AuthModule } from "../auth/auth.module";
import { AuthorizationModule } from "../../common/authorization/authorization.module";

import { TenantController } from "./tenant.controller";
import { TenantService } from "./tenant.service";

@Module({
  imports: [
    SupabaseModule,
    AuthModule,
    AuthorizationModule,
  ],
  controllers: [TenantController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}
