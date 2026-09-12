import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { AuthGuard } from "../auth/guards/auth.guard";
import { PermissionGuard } from "../../common/authorization/guards/permission.guard";
import { RequirePermission } from "../../common/authorization/decorators/require-permission.decorator";
import { OwnerService } from "./owner.service";
import { OwnerCreateUserDto, OwnerPasswordDto, OwnerStatusDto, OwnerUpdateUserDto } from "./owner.dto";

@Controller("owner/users")
@UseGuards(AuthGuard, PermissionGuard)
@RequirePermission("tenants.update_all")
export class OwnerController {
  constructor(private readonly service: OwnerService) {}
  @Get("capabilities") capabilities() { return { available: true, version: 3 }; }
  @Post() create(@Req() req: Request, @Body() dto: OwnerCreateUserDto) { return this.service.create(req.user!.id, dto); }
  @Patch(":id") update(@Req() req: Request, @Param("id", ParseUUIDPipe) id: string, @Body() dto: OwnerUpdateUserDto) { return this.service.update(req.user!.id, id, dto); }
  @Patch(":id/status") status(@Req() req: Request, @Param("id", ParseUUIDPipe) id: string, @Body() dto: OwnerStatusDto) { return this.service.status(req.user!.id, id, "STATUS", dto.is_active); }
  @Delete(":id") archive(@Req() req: Request, @Param("id", ParseUUIDPipe) id: string) { return this.service.status(req.user!.id, id, "ARCHIVE"); }
  @Post(":id/restore") restore(@Req() req: Request, @Param("id", ParseUUIDPipe) id: string) { return this.service.status(req.user!.id, id, "RESTORE"); }
  @Post(":id/password") password(@Req() req: Request, @Param("id", ParseUUIDPipe) id: string, @Body() dto: OwnerPasswordDto) { return this.service.password(req.user!.id, id, dto.password); }
}
