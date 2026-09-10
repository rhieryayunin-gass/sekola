import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { RequirePermission } from "../../common/authorization/decorators/require-permission.decorator";
import { PermissionGuard } from "../../common/authorization/guards/permission.guard";
import { PageDto } from "../../common/data/page.dto";
import { AuthGuard } from "../auth/guards/auth.guard";
import { LearningService } from "./learning.service";

function learningController(resource: string) {
  @Controller(resource)
  @UseGuards(AuthGuard, PermissionGuard)
  class ResourceController {
    constructor(public readonly service: LearningService) {}
    user(request: Request) { if (!request.user) throw new Error("Authenticated user missing"); return request.user.id; }
    @Get() @RequirePermission(`${resource}.read`)
    list(@Req() request: Request, @Query() page: PageDto) { return this.service.list(this.user(request), resource, page); }
    @Post() @RequirePermission(`${resource}.create`)
    create(@Req() request: Request, @Body() body: unknown) { return this.service.save(this.user(request), resource, body); }
    @Patch(":id") @RequirePermission(`${resource}.update`)
    update(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) { return this.service.save(this.user(request), resource, body, id); }
  }
  return ResourceController;
}
export const CoursesController = learningController("courses");
export const LessonsController = learningController("lessons");
export const AssignmentsController = learningController("assignments");
export const SubmissionsController = learningController("submissions");
