import { databaseError } from "../../common/data/database-error";
import { PageDto, pageRange } from "../../common/data/page.dto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { SupabaseService } from "../../common/supabase/supabase.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class TeamProjectsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly audit: AuditService,
  ) {}

  private get client() {
    return this.supabase.getClient();
  }

  private async tenant(userId: string) {
    const { data, error } = await this.client
      .from("users")
      .select("tenant_id,is_active")
      .eq("id", userId)
      .single();
    if (error || !data?.tenant_id || !data.is_active) {
      throw new NotFoundException("Active tenant user not found");
    }
    return data.tenant_id as string;
  }

  private async activeTenantUser(tenantId: string, userId: string) {
    const { data } = await this.client
      .from("users")
      .select("id")
      .eq("id", userId)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .single();
    if (!data) throw new BadRequestException("User does not belong to the current tenant");
  }

  private async project(tenantId: string, projectId: string, userId: string, mode: "read" | "write" | "manage" = "read") {
    const { data } = await this.client
      .from("team_projects")
      .select("*")
      .eq("id", projectId)
      .eq("tenant_id", tenantId)
      .single();
    if (!data) throw new NotFoundException("Team+ project not found");
    const [settings, member] = await Promise.all([
      this.client.from("team_project_settings").select("visibility").eq("tenant_id", tenantId).eq("project_id", projectId).maybeSingle(),
      this.client.from("team_project_members").select("member_role").eq("tenant_id", tenantId).eq("project_id", projectId).eq("user_id", userId).maybeSingle(),
    ]);
    if (settings.error || member.error) throw new InternalServerErrorException("Unable to verify project access");
    const owner = data.owner_user_id === userId;
    const role = member.data?.member_role;
    const allowed = mode === "manage" ? owner || role === "MANAGER"
      : mode === "write" ? owner || role === "MANAGER" || role === "MEMBER"
      : owner || Boolean(role) || settings.data?.visibility === "TENANT";
    if (!allowed) throw new ForbiddenException("Project access is not permitted");
    return data;
  }

  private async task(tenantId: string, projectId: string, taskId: string, userId: string) {
    await this.project(tenantId, projectId, userId);
    const { data } = await this.client
      .from("team_tasks")
      .select("*")
      .eq("id", taskId)
      .eq("project_id", projectId)
      .eq("tenant_id", tenantId)
      .single();
    if (!data) throw new NotFoundException("Team+ task not found");
    return data;
  }

  private async activity(
    tenantId: string,
    projectId: string,
    actorUserId: string,
    activityType: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown> = {},
  ) {
    await this.client.from("team_project_activity").insert({
      tenant_id: tenantId,
      project_id: projectId,
      actor_user_id: actorUserId,
      activity_type: activityType,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
    });
  }

  async list(userId: string, page = new PageDto()) {
    await this.tenant(userId);
    const range = pageRange(page);
    const { data, error } = await this.client.rpc("list_visible_projects", { actor_id: userId, page_offset: range[0], page_limit: range[1]-range[0]+1 });
    if (error) throw new InternalServerErrorException("Unable to fetch projects");
    return data ?? [];
  }

  async create(userId: string, input: Record<string, unknown>) {
    const tenantId = await this.tenant(userId);
    await this.activeTenantUser(tenantId, String(input.owner_user_id ?? ""));
    const values = {
      ...input,
      name: String(input.name ?? "").trim(),
      tenant_id: tenantId,
      created_by_user_id: userId,
    };
    const { data, error } = await this.client
      .from("team_projects")
      .insert(values)
      .select("*")
      .single();
    if (error?.code === "23505") throw new ConflictException("Project code already exists");
    if (error || !data) throw new InternalServerErrorException("Unable to create Team+ project");

    const { error: settingsError } = await this.client
      .from("team_project_settings")
      .insert({ project_id: data.id, tenant_id: tenantId });
    if (settingsError) {
      await this.client.from("team_projects").delete().eq("id", data.id).eq("tenant_id", tenantId);
      throw new InternalServerErrorException("Unable to initialize project settings");
    }

    const { error: memberError } = await this.client.from("team_project_members").insert({
      tenant_id: tenantId,
      project_id: data.id,
      user_id: input.owner_user_id,
      member_role: "OWNER",
    });
    if (memberError) {
      await this.client.from("team_project_settings").delete().eq("project_id", data.id).eq("tenant_id", tenantId);
      await this.client.from("team_projects").delete().eq("id", data.id).eq("tenant_id", tenantId);
      throw new InternalServerErrorException("Unable to initialize project owner");
    }
    await this.activity(tenantId, data.id, userId, "PROJECT_CREATED", "team_projects", data.id, { code: data.code });
    await this.audit.record({ tenantId, actorUserId: userId, action: "CREATE", module: "TEAM", resourceType: "team_projects", resourceId: data.id, afterState: data });
    return data;
  }

  async update(userId: string, projectId: string, input: Record<string, unknown>) {
    const tenantId = await this.tenant(userId);
    await this.project(tenantId, projectId, userId, "manage");
    const before = await this.project(tenantId, projectId, userId);
    if (input.owner_user_id) await this.activeTenantUser(tenantId, String(input.owner_user_id));
    const changes = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
    if (typeof changes.name === "string") changes.name = changes.name.trim();
    if (!Object.keys(changes).length) throw new BadRequestException("At least one field is required");
    const { data, error } = await this.client
      .from("team_projects")
      .update(changes)
      .eq("id", projectId)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();
    if (error || !data) throw new InternalServerErrorException("Unable to update Team+ project");
    if (input.owner_user_id && input.owner_user_id !== before.owner_user_id) {
      await this.client.from("team_project_members").update({ member_role: "MANAGER" }).eq("project_id", projectId).eq("user_id", before.owner_user_id).eq("tenant_id", tenantId);
      await this.client.from("team_project_members").upsert({ tenant_id: tenantId, project_id: projectId, user_id: input.owner_user_id, member_role: "OWNER" }, { onConflict: "project_id,user_id" });
    }
    await this.activity(tenantId, projectId, userId, "PROJECT_UPDATED", "team_projects", projectId, { changed_fields: Object.keys(changes) });
    await this.audit.record({ tenantId, actorUserId: userId, action: "UPDATE", module: "TEAM", resourceType: "team_projects", resourceId: projectId, beforeState: before, afterState: data });
    return data;
  }

  async remove(userId: string, projectId: string) {
    const tenantId = await this.tenant(userId);
    await this.project(tenantId, projectId, userId, "manage");
    const before = await this.project(tenantId, projectId, userId);
    const { error } = await this.client.from("team_projects").delete().eq("id", projectId).eq("tenant_id", tenantId);
    if (error) throw new ConflictException("Project cannot be deleted");
    await this.audit.record({ tenantId, actorUserId: userId, action: "DELETE", module: "TEAM", resourceType: "team_projects", resourceId: projectId, beforeState: before });
    return { success: true, id: projectId };
  }

  async listMembers(userId: string, projectId: string) {
    const tenantId = await this.tenant(userId);
    await this.project(tenantId, projectId, userId);
    const { data, error } = await this.client
      .from("team_project_members")
      .select("*, user:user_id(id,full_name,email)")
      .eq("tenant_id", tenantId)
      .eq("project_id", projectId)
      .order("joined_at");
    if (error) throw new InternalServerErrorException("Unable to fetch project members");
    return data ?? [];
  }

  async addMember(userId: string, projectId: string, input: Record<string, unknown>) {
    const tenantId = await this.tenant(userId);
    await this.project(tenantId, projectId, userId, "manage");
    await this.project(tenantId, projectId, userId);
    await this.activeTenantUser(tenantId, String(input.user_id ?? ""));
    const { data, error } = await this.client
      .from("team_project_members")
      .insert({ ...input, tenant_id: tenantId, project_id: projectId })
      .select("*")
      .single();
    if (error?.code === "23505") throw new ConflictException("User is already a project member");
    if (error || !data) throw new InternalServerErrorException("Unable to add project member");
    await this.activity(tenantId, projectId, userId, "MEMBER_ADDED", "team_project_members", data.id, { user_id: data.user_id, role: data.member_role });
    await this.audit.record({ tenantId, actorUserId: userId, action: "CREATE", module: "TEAM", resourceType: "team_project_members", resourceId: data.id, afterState: data });
    return data;
  }

  async updateMember(userId: string, projectId: string, memberId: string, input: Record<string, unknown>) {
    const tenantId = await this.tenant(userId);
    await this.project(tenantId, projectId, userId, "manage");
    const project = await this.project(tenantId, projectId, userId);
    const { data: before } = await this.client.from("team_project_members").select("*").eq("id", memberId).eq("project_id", projectId).eq("tenant_id", tenantId).single();
    if (!before) throw new NotFoundException("Project member not found");
    if (before.user_id === project.owner_user_id) throw new ConflictException("Change the project owner from project settings");
    const { data, error } = await this.client.from("team_project_members").update(input).eq("id", memberId).eq("project_id", projectId).eq("tenant_id", tenantId).select("*").single();
    if (error || !data) throw new InternalServerErrorException("Unable to update project member");
    await this.activity(tenantId, projectId, userId, "MEMBER_UPDATED", "team_project_members", memberId, { role: data.member_role });
    await this.audit.record({ tenantId, actorUserId: userId, action: "UPDATE", module: "TEAM", resourceType: "team_project_members", resourceId: memberId, beforeState: before, afterState: data });
    return data;
  }

  async removeMember(userId: string, projectId: string, memberId: string) {
    const tenantId = await this.tenant(userId);
    await this.project(tenantId, projectId, userId, "manage");
    const project = await this.project(tenantId, projectId, userId);
    const { data: before } = await this.client.from("team_project_members").select("*").eq("id", memberId).eq("project_id", projectId).eq("tenant_id", tenantId).single();
    if (!before) throw new NotFoundException("Project member not found");
    if (before.user_id === project.owner_user_id) throw new ConflictException("Project owner cannot be removed");
    const { error } = await this.client.from("team_project_members").delete().eq("id", memberId).eq("project_id", projectId).eq("tenant_id", tenantId);
    if (error) throw new InternalServerErrorException("Unable to remove project member");
    await this.activity(tenantId, projectId, userId, "MEMBER_REMOVED", "team_project_members", memberId, { user_id: before.user_id });
    await this.audit.record({ tenantId, actorUserId: userId, action: "DELETE", module: "TEAM", resourceType: "team_project_members", resourceId: memberId, beforeState: before });
    return { success: true, id: memberId };
  }

  async getSettings(userId: string, projectId: string) {
    const tenantId = await this.tenant(userId);
    await this.project(tenantId, projectId, userId);
    const { data, error } = await this.client.from("team_project_settings").select("*").eq("project_id", projectId).eq("tenant_id", tenantId).single();
    if (error || !data) throw new NotFoundException("Project settings not found");
    return data;
  }

  async updateSettings(userId: string, projectId: string, input: Record<string, unknown>) {
    const tenantId = await this.tenant(userId);
    await this.project(tenantId, projectId, userId, "manage");
    await this.project(tenantId, projectId, userId);
    if (!Object.keys(input).length) throw new BadRequestException("At least one setting is required");
    const { data: before } = await this.client.from("team_project_settings").select("*").eq("project_id", projectId).eq("tenant_id", tenantId).single();
    const { data, error } = await this.client.from("team_project_settings").update({ ...input, updated_at: new Date().toISOString() }).eq("project_id", projectId).eq("tenant_id", tenantId).select("*").single();
    if (error || !data) throw new InternalServerErrorException("Unable to update project settings");
    await this.activity(tenantId, projectId, userId, "SETTINGS_UPDATED", "team_project_settings", projectId, { changed_fields: Object.keys(input) });
    await this.audit.record({ tenantId, actorUserId: userId, action: "UPDATE", module: "TEAM", resourceType: "team_project_settings", resourceId: projectId, beforeState: before, afterState: data });
    return data;
  }

  async listTasks(userId: string, projectId: string, page = new PageDto()) {
    const tenantId = await this.tenant(userId);
    await this.project(tenantId, projectId, userId);
    const { data, error } = await this.client
      .from("team_tasks")
      .select("*, assignee:assignee_user_id(id,full_name,email)")
      .eq("tenant_id", tenantId)
      .eq("project_id", projectId)
      .order("sort_order")
      .order("created_at").order("id").range(...pageRange(page));
    if (error) throw new InternalServerErrorException("Unable to fetch Team+ tasks");
    return data ?? [];
  }

  async createTask(userId: string, projectId: string, input: Record<string, unknown>) {
    const tenantId = await this.tenant(userId);
    await this.project(tenantId, projectId, userId, "write");
    await this.project(tenantId, projectId, userId);
    if (input.assignee_user_id) { await this.activeTenantUser(tenantId, String(input.assignee_user_id)); await this.project(tenantId, projectId, String(input.assignee_user_id)); }
    const values = {
      ...input,
      title: String(input.title ?? "").trim(),
      tenant_id: tenantId,
      project_id: projectId,
      reporter_user_id: userId,
    };
    const { data, error } = await this.client.from("team_tasks").insert(values).select("*").single();
    if (error || !data) throw new InternalServerErrorException("Unable to create Team+ task");
    await this.activity(tenantId, projectId, userId, "TASK_CREATED", "team_tasks", data.id, { status: data.status, priority: data.priority });
    await this.audit.record({ tenantId, actorUserId: userId, action: "CREATE", module: "TEAM", resourceType: "team_tasks", resourceId: data.id, afterState: data });
    return data;
  }

  async updateTask(userId: string, projectId: string, taskId: string, input: Record<string, unknown>) {
    const tenantId = await this.tenant(userId);
    await this.project(tenantId, projectId, userId, "write");
    const before = await this.task(tenantId, projectId, taskId, userId);
    if (input.assignee_user_id) { await this.activeTenantUser(tenantId, String(input.assignee_user_id)); await this.project(tenantId, projectId, String(input.assignee_user_id)); }
    const changes = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
    if (typeof changes.title === "string") changes.title = changes.title.trim();
    if (!Object.keys(changes).length) throw new BadRequestException("At least one field is required");
    const { data, error } = await this.client.from("team_tasks").update(changes).eq("id", taskId).eq("project_id", projectId).eq("tenant_id", tenantId).select("*").single();
    if (error || !data) throw new InternalServerErrorException("Unable to update Team+ task");
    if (input.status && input.status !== before.status) {
      await this.client.from("team_task_transitions").insert({ tenant_id: tenantId, project_id: projectId, task_id: taskId, from_status: before.status, to_status: input.status, moved_by_user_id: userId });
    }
    await this.activity(tenantId, projectId, userId, "TASK_UPDATED", "team_tasks", taskId, { changed_fields: Object.keys(changes) });
    await this.audit.record({ tenantId, actorUserId: userId, action: "UPDATE", module: "TEAM", resourceType: "team_tasks", resourceId: taskId, beforeState: before, afterState: data });
    return data;
  }

  async moveTask(userId: string, projectId: string, taskId: string, input: Record<string, unknown>) {
    return this.updateTask(userId, projectId, taskId, input);
  }

  async removeTask(userId: string, projectId: string, taskId: string) {
    const tenantId = await this.tenant(userId);
    await this.project(tenantId, projectId, userId, "write");
    const before = await this.task(tenantId, projectId, taskId, userId);
    const { error } = await this.client.from("team_tasks").delete().eq("id", taskId).eq("project_id", projectId).eq("tenant_id", tenantId);
    if (error) throw new InternalServerErrorException("Unable to delete Team+ task");
    await this.activity(tenantId, projectId, userId, "TASK_DELETED", "team_tasks", taskId, { title: before.title });
    await this.audit.record({ tenantId, actorUserId: userId, action: "DELETE", module: "TEAM", resourceType: "team_tasks", resourceId: taskId, beforeState: before });
    return { success: true, id: taskId };
  }

  async listComments(userId: string, projectId: string, taskId: string) {
    const tenantId = await this.tenant(userId);
    await this.task(tenantId, projectId, taskId, userId);
    const { data, error } = await this.client.from("team_task_comments").select("*, author:author_user_id(id,full_name,email)").eq("tenant_id", tenantId).eq("project_id", projectId).eq("task_id", taskId).order("created_at");
    if (error) throw new InternalServerErrorException("Unable to fetch task comments");
    return data ?? [];
  }

  async addComment(userId: string, projectId: string, taskId: string, input: Record<string, unknown>) {
    const tenantId = await this.tenant(userId);
    await this.project(tenantId, projectId, userId, "write");
    const project = await this.project(tenantId, projectId, userId);
    await this.task(tenantId, projectId, taskId, userId);
    const { data: settings } = await this.client.from("team_project_settings").select("allow_member_comments").eq("project_id", projectId).eq("tenant_id", tenantId).single();
    if (settings?.allow_member_comments === false && project.owner_user_id !== userId) {
      throw new ForbiddenException("Project member comments are disabled");
    }
    const { data, error } = await this.client.from("team_task_comments").insert({ tenant_id: tenantId, project_id: projectId, task_id: taskId, author_user_id: userId, body: input.body }).select("*").single();
    if (error || !data) throw new InternalServerErrorException("Unable to add task comment");
    await this.activity(tenantId, projectId, userId, "COMMENT_ADDED", "team_task_comments", data.id, { task_id: taskId });
    await this.audit.record({ tenantId, actorUserId: userId, action: "CREATE", module: "TEAM", resourceType: "team_task_comments", resourceId: data.id, afterState: data });
    return data;
  }

  async removeComment(userId: string, projectId: string, taskId: string, commentId: string) {
    const tenantId = await this.tenant(userId);
    await this.project(tenantId, projectId, userId, "write");
    await this.task(tenantId, projectId, taskId, userId);
    const { data: before } = await this.client.from("team_task_comments").select("*").eq("id", commentId).eq("task_id", taskId).eq("tenant_id", tenantId).single();
    if (!before) throw new NotFoundException("Task comment not found");
    if (before.author_user_id !== userId) await this.project(tenantId, projectId, userId, "manage");
    const { error } = await this.client.from("team_task_comments").delete().eq("id", commentId).eq("task_id", taskId).eq("tenant_id", tenantId);
    if (error) throw new InternalServerErrorException("Unable to delete task comment");
    await this.activity(tenantId, projectId, userId, "COMMENT_DELETED", "team_task_comments", commentId, { task_id: taskId });
    await this.audit.record({ tenantId, actorUserId: userId, action: "DELETE", module: "TEAM", resourceType: "team_task_comments", resourceId: commentId, beforeState: before });
    return { success: true, id: commentId };
  }

  async listActivity(userId: string, projectId: string) {
    const tenantId = await this.tenant(userId);
    await this.project(tenantId, projectId, userId);
    const { data, error } = await this.client.from("team_project_activity").select("*, actor:actor_user_id(id,full_name,email)").eq("tenant_id", tenantId).eq("project_id", projectId).order("created_at", { ascending: false }).limit(100);
    if (error) throw new InternalServerErrorException("Unable to fetch project activity");
    return data ?? [];
  }

  async projectFinance(userId: string, projectId: string) {
    const tenantId = await this.tenant(userId);
    await this.project(tenantId, projectId, userId, "manage");
    await this.project(tenantId, projectId, userId);
    const [invoices, payments, summary] = await Promise.all([
      this.client.from("team_project_invoices").select("*").eq("tenant_id", tenantId).eq("project_id", projectId).order("created_at", { ascending: false }),
      this.client.from("team_project_payments").select("*").eq("tenant_id", tenantId).eq("project_id", projectId).order("paid_at", { ascending: false }),
      this.client.from("team_project_finance_summary").select("*").eq("tenant_id", tenantId).eq("project_id", projectId).maybeSingle(),
    ]);
    if (invoices.error || payments.error || summary.error) throw new InternalServerErrorException("Unable to fetch project finance");
    return { invoices: invoices.data ?? [], payments: payments.data ?? [], summary: summary.data ?? { project_id: projectId, outstanding_invoices: 0, invoiced_amount: 0, paid_amount: 0, outstanding_amount: 0 } };
  }

  async createProjectInvoice(userId: string, projectId: string, input: Record<string, unknown>) {
    const tenantId = await this.tenant(userId);
    await this.project(tenantId, projectId, userId, "manage");
    await this.project(tenantId, projectId, userId);
    if (input.finance_category_id) {
      const { data } = await this.client.from("finance_categories").select("id").eq("id", String(input.finance_category_id)).eq("tenant_id", tenantId).single();
      if (!data) throw new BadRequestException("Finance category does not belong to the current tenant");
    }
    const { data, error } = await this.client.from("team_project_invoices").insert({ ...input, tenant_id: tenantId, project_id: projectId }).select("*").single();
    if (error?.code === "23505") throw new ConflictException("Project invoice number already exists");
    if (error || !data) throw new InternalServerErrorException("Unable to create project invoice");
    await this.activity(tenantId, projectId, userId, "INVOICE_CREATED", "team_project_invoices", data.id, { amount: data.amount });
    await this.audit.record({ tenantId, actorUserId: userId, action: "CREATE", module: "TEAM_FINANCE", resourceType: "team_project_invoices", resourceId: data.id, afterState: data });
    return data;
  }

  async createProjectPayment(userId: string, projectId: string, input: Record<string, unknown>) {
    const tenantId = await this.tenant(userId);
    await this.project(tenantId, projectId, userId, "manage");
    await this.project(tenantId, projectId, userId);
    const { data: invoice } = await this.client.from("team_project_invoices").select("*").eq("id", String(input.project_invoice_id ?? "")).eq("project_id", projectId).eq("tenant_id", tenantId).single();
    if (!invoice) throw new BadRequestException("Project invoice does not belong to this project");
    if (input.finance_account_id) {
      const { data } = await this.client.from("finance_accounts").select("id").eq("id", String(input.finance_account_id)).eq("tenant_id", tenantId).single();
      if (!data) throw new BadRequestException("Finance account does not belong to the current tenant");
    }
    const { data, error } = await this.client.from("team_project_payments").insert({ ...input, tenant_id: tenantId, project_id: projectId }).select("*").single();
    if (error?.code === "23505") throw new ConflictException("Project receipt number already exists");
    if (error || !data) databaseError(error);
    await this.activity(tenantId, projectId, userId, "PAYMENT_RECORDED", "team_project_payments", data.id, { amount: data.amount, invoice_id: invoice.id });
    await this.audit.record({ tenantId, actorUserId: userId, action: "CREATE", module: "TEAM_FINANCE", resourceType: "team_project_payments", resourceId: data.id, afterState: data });
    return data;
  }
}
