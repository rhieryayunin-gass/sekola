import { Body, Controller, Get, Param, Put, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { AuthGuard } from "../auth/guards/auth.guard";
import { RequirePermission } from "../../common/authorization/decorators/require-permission.decorator";
import { PermissionGuard } from "../../common/authorization/guards/permission.guard";
import { PermissionsService } from "./permissions.service";
import { ReplacePermissionsDto } from "./dto/replace-permissions.dto";

@Controller("permissions")
@UseGuards(AuthGuard, PermissionGuard)
export class PermissionsController {
  constructor(private readonly service: PermissionsService) {}
  @Get() @RequirePermission("permissions.read") list() { return this.service.listPermissions(); }
  @Get("roles") @RequirePermission("roles.read") roles() { return this.service.listRoles(); }
  @Put("roles/:id") @RequirePermission("roles.manage") replace(@Param("id") id: string, @Body() body: ReplacePermissionsDto) { return this.service.replaceRolePermissions(id, body.ids); }
  @Put("users/:id/roles") @RequirePermission("users.roles.manage") assign(@Req() request: Request, @Param("id") id: string, @Body() body: ReplacePermissionsDto) { return this.service.replaceUserRoles(request.user!.id, id, body.ids); }
}
