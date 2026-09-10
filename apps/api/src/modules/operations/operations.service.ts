import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthorizationService } from "../../common/authorization/authorization.service";
import { databaseError } from "../../common/data/database-error";
import { PageDto, pageRange } from "../../common/data/page.dto";
import { SupabaseService } from "../../common/supabase/supabase.service";
import { AuditService } from "../audit/audit.service";

type Resource = "rooms" | "room_bookings" | "leave_requests" | "schedule_change_requests";
@Injectable()
export class OperationsService {
  constructor(private readonly supabase: SupabaseService, private readonly audit: AuditService, private readonly authorization: AuthorizationService) {}
  private get client() { return this.supabase.getClient(); }
  private async tenant(userId: string) {
    const { data, error } = await this.client.from("users").select("tenant_id,is_active").eq("id", userId).single();
    if (error || !data?.tenant_id || !data.is_active) throw new NotFoundException("Active tenant user not found");
    return data.tenant_id as string;
  }
  async list(userId: string, resource: Resource, page = new PageDto()) {
    const tenantId = await this.tenant(userId);
    let query = this.client.from(resource).select("*").eq("tenant_id", tenantId);
    // Leave reasons and schedule requests are private to requester and administrators.
    if (resource !== "rooms" && resource !== "room_bookings" && !await this.authorization.hasPermission(userId, "approvals.read_all")) query = query.eq("requester_user_id", userId);
    const { data, error } = await query.order("created_at", { ascending: false }).order("id").range(...pageRange(page));
    if (error) databaseError(error);
    return data ?? [];
  }
  async createRoom(userId: string, input: Record<string, unknown>) {
    const tenantId = await this.tenant(userId);
    const { data, error } = await this.client.from("rooms").insert({ ...input, tenant_id: tenantId }).select("*").single();
    if (error || !data) databaseError(error);
    await this.audit.record({ tenantId, actorUserId: userId, action: "CREATE", module: "OPERATIONS", resourceType: "rooms", resourceId: data.id, afterState: data });
    return data;
  }
  async updateRoom(userId: string, id: string, input: Record<string, unknown>) {
    if (!Object.keys(input).length) throw new BadRequestException("At least one field is required");
    const tenantId = await this.tenant(userId);
    const { data, error } = await this.client.from("rooms").update({ ...input, updated_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", tenantId).select("*").maybeSingle();
    if (error) databaseError(error);
    if (!data) throw new NotFoundException("Room not found");
    await this.audit.record({ tenantId, actorUserId: userId, action: "UPDATE", module: "OPERATIONS", resourceType: "rooms", resourceId: id, afterState: data });
    return data;
  }
  async deleteRoom(userId: string, id: string) {
    const tenantId = await this.tenant(userId);
    const { data, error } = await this.client.from("rooms").delete().eq("id", id).eq("tenant_id", tenantId).select("id").maybeSingle();
    if (error) databaseError(error);
    if (!data) throw new NotFoundException("Room not found");
    await this.audit.record({ tenantId, actorUserId: userId, action: "DELETE", module: "OPERATIONS", resourceType: "rooms", resourceId: id });
    return { success: true, id };
  }
  private async submit(userId: string, kind: string, input: Record<string, unknown>) {
    const { approver_user_ids, ...payload } = input;
    const { data, error } = await this.client.rpc("submit_operational_request", { actor_id: userId, kind, payload, approvers: approver_user_ids });
    if (error || !data) databaseError(error);
    return data;
  }
  createBooking(userId: string, input: Record<string, unknown>) { return this.submit(userId, "ROOM_BOOKING", input); }
  createLeave(userId: string, input: Record<string, unknown>) { return this.submit(userId, "LEAVE_REQUEST", input); }
  createScheduleChange(userId: string, input: Record<string, unknown>) { return this.submit(userId, "SCHEDULE_CHANGE", input); }
  createGenericApproval(userId: string, input: Record<string, unknown>) {
    if (["ROOM_BOOKING", "LEAVE_REQUEST", "SCHEDULE_CHANGE"].includes(String(input.resource_type))) throw new BadRequestException("Use the operational request endpoint for this resource");
    return this.submit(userId, "GENERIC", input);
  }
  async approvals(userId: string, page = new PageDto()) {
    const tenantId = await this.tenant(userId);
    // Two bounded queries avoid assembling an unbounded IN list of approval IDs.
    if (!await this.authorization.hasPermission(userId, "approvals.read_all")) {
      const { data, error } = await this.client.rpc("list_my_approvals", { actor_id: userId, page_offset: pageRange(page)[0], page_limit: pageRange(page)[1] - pageRange(page)[0] + 1 });
      if (error) databaseError(error);
      return data ?? [];
    }
    const { data, error } = await this.client.from("approval_requests").select("*,approval_steps(*)").eq("tenant_id", tenantId).order("created_at", { ascending: false }).order("id").range(...pageRange(page));
    if (error) databaseError(error);
    return data ?? [];
  }
  async decide(userId: string, id: string, decision: "APPROVED" | "REJECTED", note?: string) {
    const { data, error } = await this.client.rpc("decide_operational_request", { actor_id: userId, request_id: id, decision, note: note ?? null });
    if (error || !data) databaseError(error);
    return data;
  }
  async cancel(userId: string, resource: Exclude<Resource, "rooms">, id: string) {
    const tenantId = await this.tenant(userId);
    const { data } = await this.client.from(resource).select("approval_request_id,requester_user_id").eq("id", id).eq("tenant_id", tenantId).single();
    if (!data) throw new NotFoundException("Request not found");
    if (data.requester_user_id !== userId) throw new ForbiddenException("Only the requester can cancel");
    const result = await this.client.rpc("decide_operational_request", { actor_id: userId, request_id: data.approval_request_id, decision: "CANCELLED", note: null });
    if (result.error) databaseError(result.error);
    return { success: true, id };
  }
}
