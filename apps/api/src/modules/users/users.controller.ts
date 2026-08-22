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

import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

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
  async findAll() {
    return this.usersService.findAll();
  }

  @Get(":id")
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission("users.read")
  async findOne(
    @Param("id") id: string,
  ) {
    return this.usersService.findOne(id);
  }

  @Post()
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission("users.create")
  async create(
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.create(dto);
  }

  @Patch(":id")
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission("users.update")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(
      id,
      dto,
    );
  }

  @Delete(":id")
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission("users.deactivate")
  async deactivate(
    @Param("id") id: string,
  ) {
    return this.usersService.deactivate(id);
  }
}