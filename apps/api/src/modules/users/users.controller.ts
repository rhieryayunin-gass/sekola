import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";

import { AuthGuard } from "../auth/guards/auth.guard";
import { PermissionGuard } from "../../common/authorization/guards/permission.guard";
import { RequirePermission } from "../../common/authorization/decorators/require-permission.decorator";

import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { ListUsersDto } from "./dto/list-users.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto";

@Controller("users")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
  ) {}

  @Get("me")
  @UseGuards(AuthGuard)
  async findMe(@Req() request: Request) {
    const user = request.user;

    if (!user) {
      throw new Error("Authenticated user is missing");
    }

    return this.usersService.findMe(user.id);
  }

  @Get()
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission("users.read")
  async findAll(
    @Req() request: Request,
    @Query() filters: ListUsersDto,
  ) {
    const user = request.user;

    if (!user) {
      throw new Error("Authenticated user is missing");
    }

    return this.usersService.findAll(user.id, filters);
  }

  @Get("meta/user-levels")
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission("users.read")
  async findUserLevels(@Req() request: Request) {
    const user = request.user;

    if (!user) {
      throw new Error("Authenticated user is missing");
    }

    return this.usersService.findUserLevels(user.id);
  }

  @Get(":id")
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission("users.read")
  async findOne(
    @Param("id") id: string,
    @Req() request: Request,
  ) {
    const user = request.user;

    if (!user) {
      throw new Error("Authenticated user is missing");
    }

    return this.usersService.findOne(
      id,
      user.id,
    );
  }

  @Post()
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission("users.create")
  async create(
    @Body() dto: CreateUserDto,
    @Req() request: Request,
  ) {
    const user = request.user;

    if (!user) {
      throw new Error("Authenticated user is missing");
    }

    return this.usersService.create(dto, user.id);
  }

  @Patch(":id")
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission("users.update")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
    @Req() request: Request,
  ) {
    const user = request.user;

    if (!user) {
      throw new Error("Authenticated user is missing");
    }

    return this.usersService.update(
      id,
      dto,
      user.id,
    );
  }

  @Patch(":id/status")
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission("users.status")
  async setStatus(
    @Param("id") id: string,
    @Body() dto: UpdateUserStatusDto,
    @Req() request: Request,
  ) {
    const user = request.user;

    if (!user) {
      throw new Error("Authenticated user is missing");
    }

    return this.usersService.setStatus(
      id,
      dto.is_active,
      user.id,
    );
  }

  @Delete(":id")
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission("users.status")
  async deactivate(
    @Param("id") id: string,
    @Req() request: Request,
  ) {
    const user = request.user;

    if (!user) {
      throw new Error("Authenticated user is missing");
    }

    return this.usersService.deactivate(
      id,
      user.id,
    );
  }
}
