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

import { CalendarEventsService } from "./calendar-events.service";
import { CreateCalendarEventDto } from "./dto/create-calendar-event.dto";
import { UpdateCalendarEventDto } from "./dto/update-calendar-event.dto";
import { InviteCalendarParticipantDto } from "./dto/invite-calendar-participant.dto";
import { RespondCalendarInviteDto } from "./dto/respond-calendar-invite.dto";
import { ReviewCalendarApprovalDto } from "./dto/review-calendar-approval.dto";

@Controller("calendars/:calendarId/events")
@UseGuards(AuthGuard, PermissionGuard)
export class CalendarEventsController {
  constructor(
    private readonly calendarEventsService: CalendarEventsService,
  ) {}

  @Get()
  @RequirePermission("calendar.read")
  async findAll(
    @Req() request: Request,
    @Param("calendarId") calendarId: string,
  ) {
    const user = request.user;

    if (!user) {
      throw new Error("Authenticated user is missing");
    }

    return this.calendarEventsService.findAll(
      user.id,
      calendarId,
    );
  }

  @Get(":eventId")
  @RequirePermission("calendar.read")
  async findOne(
    @Req() request: Request,
    @Param("calendarId") calendarId: string,
    @Param("eventId") eventId: string,
  ) {
    const user = request.user;

    if (!user) {
      throw new Error("Authenticated user is missing");
    }

    return this.calendarEventsService.findOne(
      user.id,
      calendarId,
      eventId,
    );
  }

  @Post()
  @RequirePermission("calendar.create")
  async create(
    @Req() request: Request,
    @Param("calendarId") calendarId: string,
    @Body() dto: CreateCalendarEventDto,
  ) {
    const user = request.user;

    if (!user) {
      throw new Error("Authenticated user is missing");
    }

    return this.calendarEventsService.create(
      user.id,
      calendarId,
      dto,
    );
  }

  @Patch(":eventId")
  @RequirePermission("calendar.update")
  async update(
    @Req() request: Request,
    @Param("calendarId") calendarId: string,
    @Param("eventId") eventId: string,
    @Body() dto: UpdateCalendarEventDto,
  ) {
    const user = request.user;

    if (!user) {
      throw new Error("Authenticated user is missing");
    }

    return this.calendarEventsService.update(
      user.id,
      calendarId,
      eventId,
      dto,
    );
  }

  @Delete(":eventId")
  @RequirePermission("calendar.delete")
  async remove(
    @Req() request: Request,
    @Param("calendarId") calendarId: string,
    @Param("eventId") eventId: string,
  ) {
    const user = request.user;

    if (!user) {
      throw new Error("Authenticated user is missing");
    }

    return this.calendarEventsService.remove(
      user.id,
      calendarId,
      eventId,
    );
  }

  @Post(":eventId/participants")
  @RequirePermission("calendar.update")
  async invite(@Req() request: Request, @Param("calendarId") calendarId: string, @Param("eventId") eventId: string, @Body() dto: InviteCalendarParticipantDto) {
    if (!request.user) throw new Error("Authenticated user is missing");
    return this.calendarEventsService.invite(request.user.id, calendarId, eventId, dto.user_id);
  }

  @Patch(":eventId/invitation")
  @RequirePermission("calendar.read")
  async respond(@Req() request: Request, @Param("eventId") eventId: string, @Body() dto: RespondCalendarInviteDto) {
    if (!request.user) throw new Error("Authenticated user is missing");
    return this.calendarEventsService.respond(request.user.id, eventId, dto.response);
  }

  @Patch(":eventId/approval")
  @RequirePermission("calendar.update")
  async review(@Req() request: Request, @Param("calendarId") calendarId: string, @Param("eventId") eventId: string, @Body() dto: ReviewCalendarApprovalDto) {
    if (!request.user) throw new Error("Authenticated user is missing");
    return this.calendarEventsService.review(request.user.id, calendarId, eventId, dto.status, dto.note);
  }
}
