import {
  Body,
  Controller,
  Param,
  Get,
  Post,
  Req,
  UseGuards,
  Patch,
  Delete,
} from "@nestjs/common";
import { Request } from "express";
import { AuthGuard } from "../auth/guards/auth.guard";
import { PermissionGuard } from "../../common/authorization/guards/permission.guard";
import { RequirePermission } from "../../common/authorization/decorators/require-permission.decorator";
import { CalendarService } from "./calendar.service";
import { CreateCalendarDto } from "./dto/create-calendar.dto";
import { UpdateCalendarDto } from "./dto/update-calendar.dto";

@Controller("calendars")
export class CalendarController {
  constructor(
    private readonly calendarService: CalendarService,
  ) {}

  @Post()
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission("calendar.create")
  async create(
    @Req() request: Request,
    @Body() dto: CreateCalendarDto,
  ) {
    const user = request.user;

    if (!user) {
      throw new Error("Authenticated user is missing");
    }

    return this.calendarService.create(
      user.id,
      dto,
    );
  }

  @Get()
@UseGuards(AuthGuard, PermissionGuard)
@RequirePermission("calendar.read")
async findAll(@Req() request: Request) {
  const user = request.user;

  if (!user) {
    throw new Error("Authenticated user is missing");
  }

  return this.calendarService.findAll(user.id);
}

@Get(":id")
@UseGuards(AuthGuard, PermissionGuard)
@RequirePermission("calendar.read")
async findOne(
  @Req() request: Request,
  @Param("id") id: string,
) {
  const user = request.user;

  if (!user) {
    throw new Error("Authenticated user is missing");
  }

  return this.calendarService.findOne(
    user.id,
    id,
  );
}

@Patch(":id")
@UseGuards(AuthGuard, PermissionGuard)
@RequirePermission("calendar.update")
async update(
  @Req() request: Request,
  @Param("id") id: string,
  @Body() dto: UpdateCalendarDto,
) {
  const user = request.user;

  if (!user) {
    throw new Error("Authenticated user is missing");
  }

  return this.calendarService.update(
    user.id,
    id,
    dto,
  );
}

@Delete(":id")
@UseGuards(AuthGuard, PermissionGuard)
@RequirePermission("calendar.delete")
async remove(
  @Req() request: Request,
  @Param("id") id: string,
) {
  const user = request.user;

  if (!user) {
    throw new Error("Authenticated user is missing");
  }

  return this.calendarService.remove(
    user.id,
    id,
  );
}
}