import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { AuthGuard } from "../auth/guards/auth.guard";
import { PermissionGuard } from "../../common/authorization/guards/permission.guard";
import { RequirePermission } from "../../common/authorization/decorators/require-permission.decorator";
import { SupabaseService } from "../../common/supabase/supabase.service";
@Controller("audit-logs") @UseGuards(AuthGuard,PermissionGuard)
export class AuditController { constructor(private readonly supabase:SupabaseService){}
 @Get() @RequirePermission("audit.read") async all(@Req() request:Request){const user=request.user!;const {data,error}=await this.supabase.getClient().from("users").select("tenant_id").eq("id",user.id).single();if(error||!data)throw error;const result=await this.supabase.getClient().from("audit_logs").select("*").eq("tenant_id",data.tenant_id).order("created_at",{ascending:false}).limit(100);if(result.error)throw result.error;return result.data??[];}
}
