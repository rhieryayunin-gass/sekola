import {
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";

import { AuthGuard } from "../auth/guards/auth.guard";
import { PermissionGuard } from "../../common/authorization/guards/permission.guard";
import { RequirePermission } from "../../common/authorization/decorators/require-permission.decorator";

import { TenantService } from "./tenant.service";

@Controller("tenants")
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
  ) {}

  @Get()
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission("users.read")
  async findAll() {
    return this.tenantService.findAll();
  }

  @Get("me")
  @UseGuards(AuthGuard)
  async findMe(@Req() request: Request) {
    const user = request.user;

    if (!user) {
      throw new Error("Authenticated user is missing");
    }

    return this.tenantService.findByUserId(user.id);
  }

  @Get(":id")
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission("users.read")
  async findOne(
    @Param("id") id: string,
  ) {
    return this.tenantService.findOne(id);
  }
}
