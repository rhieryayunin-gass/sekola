import { PageDto } from "../../common/data/page.dto";
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { RequirePermission } from "../../common/authorization/decorators/require-permission.decorator";
import { PermissionGuard } from "../../common/authorization/guards/permission.guard";
import { AuthGuard } from "../auth/guards/auth.guard";
import {
  AddTeamProjectMemberDto,
  CreateTeamProjectDto,
  UpdateTeamProjectDto,
  UpdateTeamProjectMemberDto,
  UpdateTeamProjectSettingsDto,
} from "./dto/team-project.dto";
import { TeamProjectsService } from "./team-projects.service";
import { CreateTeamCommentDto, CreateTeamTaskDto, MoveTeamTaskDto, UpdateTeamTaskDto } from "./dto/team-task.dto";
import { CreateProjectInvoiceDto, CreateProjectPaymentDto } from "./dto/team-finance.dto";

@Controller("team/projects")
@UseGuards(AuthGuard, PermissionGuard)
export class TeamProjectsController {
  constructor(private readonly service: TeamProjectsService) {}

  private userId(request: Request) {
    if (!request.user) throw new Error("Authenticated user is missing");
    return request.user.id;
  }

  private input(body: object): Record<string, unknown> {
    return { ...body };
  }

  @Get()
  @RequirePermission("team_projects.read")
  list(@Req() request: Request, @Query() page: PageDto) {
    return this.service.list(this.userId(request), page);
  }

  @Post()
  @RequirePermission("team_projects.create")
  create(@Req() request: Request, @Body() body: CreateTeamProjectDto) {
    return this.service.create(this.userId(request), this.input(body));
  }

  @Patch(":projectId")
  @RequirePermission("team_projects.update")
  update(@Req() request: Request, @Param("projectId") projectId: string, @Body() body: UpdateTeamProjectDto) {
    return this.service.update(this.userId(request), projectId, this.input(body));
  }

  @Delete(":projectId")
  @RequirePermission("team_projects.delete")
  remove(@Req() request: Request, @Param("projectId") projectId: string) {
    return this.service.remove(this.userId(request), projectId);
  }

  @Get(":projectId/members")
  @RequirePermission("team_projects.read")
  listMembers(@Req() request: Request, @Param("projectId") projectId: string) {
    return this.service.listMembers(this.userId(request), projectId);
  }

  @Post(":projectId/members")
  @RequirePermission("team_projects.update")
  addMember(@Req() request: Request, @Param("projectId") projectId: string, @Body() body: AddTeamProjectMemberDto) {
    return this.service.addMember(this.userId(request), projectId, this.input(body));
  }

  @Patch(":projectId/members/:memberId")
  @RequirePermission("team_projects.update")
  updateMember(@Req() request: Request, @Param("projectId") projectId: string, @Param("memberId") memberId: string, @Body() body: UpdateTeamProjectMemberDto) {
    return this.service.updateMember(this.userId(request), projectId, memberId, this.input(body));
  }

  @Delete(":projectId/members/:memberId")
  @RequirePermission("team_projects.update")
  removeMember(@Req() request: Request, @Param("projectId") projectId: string, @Param("memberId") memberId: string) {
    return this.service.removeMember(this.userId(request), projectId, memberId);
  }

  @Get(":projectId/settings")
  @RequirePermission("team_projects.read")
  getSettings(@Req() request: Request, @Param("projectId") projectId: string) {
    return this.service.getSettings(this.userId(request), projectId);
  }

  @Patch(":projectId/settings")
  @RequirePermission("team_projects.update")
  updateSettings(@Req() request: Request, @Param("projectId") projectId: string, @Body() body: UpdateTeamProjectSettingsDto) {
    return this.service.updateSettings(this.userId(request), projectId, this.input(body));
  }

  @Get(":projectId/tasks")
  @RequirePermission("team_tasks.read")
  listTasks(@Req() request: Request, @Param("projectId") projectId: string, @Query() page: PageDto) {
    return this.service.listTasks(this.userId(request), projectId, page);
  }

  @Post(":projectId/tasks")
  @RequirePermission("team_tasks.create")
  createTask(@Req() request: Request, @Param("projectId") projectId: string, @Body() body: CreateTeamTaskDto) {
    return this.service.createTask(this.userId(request), projectId, this.input(body));
  }

  @Patch(":projectId/tasks/:taskId")
  @RequirePermission("team_tasks.update")
  updateTask(@Req() request: Request, @Param("projectId") projectId: string, @Param("taskId") taskId: string, @Body() body: UpdateTeamTaskDto) {
    return this.service.updateTask(this.userId(request), projectId, taskId, this.input(body));
  }

  @Delete(":projectId/tasks/:taskId")
  @RequirePermission("team_tasks.delete")
  removeTask(@Req() request: Request, @Param("projectId") projectId: string, @Param("taskId") taskId: string) {
    return this.service.removeTask(this.userId(request), projectId, taskId);
  }

  @Post(":projectId/tasks/:taskId/move")
  @RequirePermission("team_workflow.manage")
  moveTask(@Req() request: Request, @Param("projectId") projectId: string, @Param("taskId") taskId: string, @Body() body: MoveTeamTaskDto) {
    return this.service.moveTask(this.userId(request), projectId, taskId, this.input(body));
  }

  @Get(":projectId/tasks/:taskId/comments")
  @RequirePermission("team_collaboration.read")
  listComments(@Req() request: Request, @Param("projectId") projectId: string, @Param("taskId") taskId: string) {
    return this.service.listComments(this.userId(request), projectId, taskId);
  }

  @Post(":projectId/tasks/:taskId/comments")
  @RequirePermission("team_collaboration.create")
  addComment(@Req() request: Request, @Param("projectId") projectId: string, @Param("taskId") taskId: string, @Body() body: CreateTeamCommentDto) {
    return this.service.addComment(this.userId(request), projectId, taskId, this.input(body));
  }

  @Delete(":projectId/tasks/:taskId/comments/:commentId")
  @RequirePermission("team_collaboration.delete")
  removeComment(@Req() request: Request, @Param("projectId") projectId: string, @Param("taskId") taskId: string, @Param("commentId") commentId: string) {
    return this.service.removeComment(this.userId(request), projectId, taskId, commentId);
  }

  @Get(":projectId/activity")
  @RequirePermission("team_collaboration.read")
  listActivity(@Req() request: Request, @Param("projectId") projectId: string) {
    return this.service.listActivity(this.userId(request), projectId);
  }

  @Get(":projectId/finance")
  @RequirePermission("team_finance.read")
  projectFinance(@Req() request: Request, @Param("projectId") projectId: string) {
    return this.service.projectFinance(this.userId(request), projectId);
  }

  @Post(":projectId/finance/invoices")
  @RequirePermission("team_finance.create")
  createProjectInvoice(@Req() request: Request, @Param("projectId") projectId: string, @Body() body: CreateProjectInvoiceDto) {
    return this.service.createProjectInvoice(this.userId(request), projectId, this.input(body));
  }

  @Post(":projectId/finance/payments")
  @RequirePermission("team_finance.create")
  createProjectPayment(@Req() request: Request, @Param("projectId") projectId: string, @Body() body: CreateProjectPaymentDto) {
    return this.service.createProjectPayment(this.userId(request), projectId, this.input(body));
  }
}
