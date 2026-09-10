import { PageDto } from "../../common/data/page.dto";
import { Body, Controller, Delete, Get,Query, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { RequirePermission } from "../../common/authorization/decorators/require-permission.decorator";
import { PermissionGuard } from "../../common/authorization/guards/permission.guard";
import { AuthGuard } from "../auth/guards/auth.guard";
import { CreateApprovalRequestDto, CreateLeaveRequestDto, CreateRoomBookingDto, CreateRoomDto, CreateScheduleChangeDto, DecideApprovalDto, UpdateRoomDto } from "./dto/operations.dto";
import { OperationsService } from "./operations.service";

@Controller("operations")
@UseGuards(AuthGuard, PermissionGuard)
export class OperationsController {
  constructor(private readonly service: OperationsService) {}
  private userId(request: Request) { if (!request.user) throw new Error("Authenticated user is missing"); return request.user.id; }
  private input(body: object): Record<string, unknown> { return { ...body }; }

  @Get("rooms") @RequirePermission("rooms.read") rooms(@Req() request: Request, @Query() page: PageDto) { return this.service.list(this.userId(request), "rooms", page); }
  @Post("rooms") @RequirePermission("rooms.create") createRoom(@Req() request: Request, @Body() body: CreateRoomDto) { return this.service.createRoom(this.userId(request), this.input(body)); }
  @Patch("rooms/:id") @RequirePermission("rooms.update") updateRoom(@Req() request: Request, @Param("id") id: string, @Body() body: UpdateRoomDto) { return this.service.updateRoom(this.userId(request), id, this.input(body)); }
  @Delete("rooms/:id") @RequirePermission("rooms.delete") deleteRoom(@Req() request: Request, @Param("id") id: string) { return this.service.deleteRoom(this.userId(request), id); }

  @Get("room-bookings") @RequirePermission("room_bookings.read") bookings(@Req() request: Request, @Query() page: PageDto) { return this.service.list(this.userId(request), "room_bookings", page); }
  @Post("room-bookings") @RequirePermission("room_bookings.create") createBooking(@Req() request: Request, @Body() body: CreateRoomBookingDto) { return this.service.createBooking(this.userId(request), this.input(body)); }
  @Post("room-bookings/:id/cancel") @RequirePermission("room_bookings.delete") cancelBooking(@Req() request: Request, @Param("id") id: string) { return this.service.cancel(this.userId(request), "room_bookings", id); }

  @Get("approvals") @RequirePermission("approvals.read") approvals(@Req() request: Request, @Query() page: PageDto) { return this.service.approvals(this.userId(request), page); }
  @Get("approvers") @RequirePermission("approvals.read") approvers(@Req() request: Request, @Query() page: PageDto) { return this.service.approvers(this.userId(request), page); }
  @Post("approvals") @RequirePermission("approvals.create") createApproval(@Req() request: Request, @Body() body: CreateApprovalRequestDto) { return this.service.createGenericApproval(this.userId(request), this.input(body)); }
  @Post("approvals/:id/decision") @RequirePermission("approvals.decide") decide(@Req() request: Request, @Param("id") id: string, @Body() body: DecideApprovalDto) { return this.service.decide(this.userId(request), id, body.decision, body.note); }

  @Get("leave-requests") @RequirePermission("leave_requests.read") leaves(@Req() request: Request, @Query() page: PageDto) { return this.service.list(this.userId(request), "leave_requests", page); }
  @Post("leave-requests") @RequirePermission("leave_requests.create") createLeave(@Req() request: Request, @Body() body: CreateLeaveRequestDto) { return this.service.createLeave(this.userId(request), this.input(body)); }
  @Post("leave-requests/:id/cancel") @RequirePermission("leave_requests.cancel") cancelLeave(@Req() request: Request, @Param("id") id: string) { return this.service.cancel(this.userId(request), "leave_requests", id); }

  @Get("schedule-changes") @RequirePermission("schedule_changes.read") scheduleChanges(@Req() request: Request, @Query() page: PageDto) { return this.service.list(this.userId(request), "schedule_change_requests", page); }
  @Post("schedule-changes") @RequirePermission("schedule_changes.create") createScheduleChange(@Req() request: Request, @Body() body: CreateScheduleChangeDto) { return this.service.createScheduleChange(this.userId(request), this.input(body)); }
  @Post("schedule-changes/:id/cancel") @RequirePermission("schedule_changes.cancel") cancelScheduleChange(@Req() request: Request, @Param("id") id: string) { return this.service.cancel(this.userId(request), "schedule_change_requests", id); }
}
