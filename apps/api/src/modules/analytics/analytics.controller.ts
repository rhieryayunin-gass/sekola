import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { RequirePermission } from "../../common/authorization/decorators/require-permission.decorator";
import { PermissionGuard } from "../../common/authorization/guards/permission.guard";
import { AuthGuard } from "../auth/guards/auth.guard";
import { AnalyticsService } from "./analytics.service";

@Controller("analytics")
@UseGuards(AuthGuard, PermissionGuard)
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}
  private userId(request: Request) { if (!request.user) throw new Error("Authenticated user is missing"); return request.user.id; }
  @Get("academic") @RequirePermission("academic_analytics.read") academic(@Req() request: Request) { return this.service.academic(this.userId(request)); }
  @Get("attendance") @RequirePermission("attendance_analytics.read") attendance(@Req() request: Request) { return this.service.attendance(this.userId(request)); }
  @Get("finance") @RequirePermission("finance_analytics.read") finance(@Req() request: Request) { return this.service.finance(this.userId(request)); }
  @Get("executive") @RequirePermission("executive_dashboard.read") executive(@Req() request: Request) { return this.service.executive(this.userId(request)); }
}
