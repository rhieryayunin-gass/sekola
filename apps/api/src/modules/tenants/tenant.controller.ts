import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";

import { AuthGuard } from "../auth/guards/auth.guard";
import { PermissionGuard } from "../../common/authorization/guards/permission.guard";
import { RequirePermission } from "../../common/authorization/decorators/require-permission.decorator";

import { TenantService } from "./tenant.service";
import { CreateTenantDto } from "./dto/create-tenant.dto";
import {
  UpdateOwnTenantDto,
  UpdateTenantDto,
} from "./dto/update-tenant.dto";

@Controller("tenants")
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
  ) {}

  @Get()
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission("tenants.read_all")
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

  @Patch("me")
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission("tenants.update_own")
  async updateMe(
    @Body() dto: UpdateOwnTenantDto,
    @Req() request: Request,
  ) {
    const user = request.user;

    if (!user) {
      throw new Error("Authenticated user is missing");
    }

    return this.tenantService.updateForUser(user.id, dto);
  }

  @Post()
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission("tenants.create")
  async create(@Body() dto: CreateTenantDto) {
    return this.tenantService.create(dto);
  }

  @Get(":id")
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission("tenants.read_all")
  async findOne(
    @Param("id") id: string,
  ) {
    return this.tenantService.findOne(id);
  }

  @Patch(":id")
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission("tenants.update_all")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantService.update(id, dto);
  }

  @Delete(":id")
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission("tenants.deactivate")
  async deactivate(@Param("id") id: string) {
    return this.tenantService.deactivate(id);
  }
}
