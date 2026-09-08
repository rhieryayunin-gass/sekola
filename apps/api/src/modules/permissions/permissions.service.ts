import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { SupabaseService } from "../../common/supabase/supabase.service";

@Injectable()
export class PermissionsService {
  constructor(private readonly supabaseService: SupabaseService) {}
  private get client() { return this.supabaseService.getClient(); }

  async listPermissions() {
    const { data, error } = await this.client.from("permissions")
      .select("id, code, name, description").order("code");
    if (error) throw error;
    return data ?? [];
  }

  async listRoles() {
    const { data, error } = await this.client.from("roles")
      .select("id, code, name, description, is_active, role_permissions(permissions(id, code, name))")
      .eq("is_active", true).order("code");
    if (error) throw error;
    return data ?? [];
  }

  async replaceRolePermissions(roleId: string, permissionIds: string[]) {
    const { data: role, error: roleError } = await this.client.from("roles")
      .select("id, code").eq("id", roleId).eq("is_active", true).single();
    if (roleError || !role) throw new NotFoundException("Role not found");
    const uniqueIds = [...new Set(permissionIds)];
    if (uniqueIds.length) {
      const { data: permissions, error } = await this.client.from("permissions").select("id").in("id", uniqueIds);
      if (error) throw error;
      if ((permissions ?? []).length !== uniqueIds.length) throw new BadRequestException("One or more permissions do not exist");
    }
    const { error: deleteError } = await this.client.from("role_permissions").delete().eq("role_id", roleId);
    if (deleteError) throw deleteError;
    if (uniqueIds.length) {
      const { error } = await this.client.from("role_permissions").insert(uniqueIds.map((permission_id) => ({ role_id: roleId, permission_id })));
      if (error) throw error;
    }
    return this.listRoles();
  }

  async replaceUserRoles(actorId: string, userId: string, roleIds: string[]) {
    if (actorId === userId) throw new ForbiddenException("You cannot change your own direct roles");
    const { data: users, error: usersError } = await this.client.from("users").select("id, tenant_id").in("id", [actorId, userId]);
    if (usersError) throw usersError;
    const actor = (users ?? []).find((item) => item.id === actorId);
    const target = (users ?? []).find((item) => item.id === userId);
    if (!actor || !target) throw new NotFoundException("User not found");
    if (actor.tenant_id !== target.tenant_id) throw new ForbiddenException("User belongs to another tenant");
    const uniqueIds = [...new Set(roleIds)];
    if (uniqueIds.length) {
      const { data: roles, error } = await this.client.from("roles").select("id").eq("is_active", true).in("id", uniqueIds);
      if (error) throw error;
      if ((roles ?? []).length !== uniqueIds.length) throw new BadRequestException("One or more roles do not exist or are inactive");
    }
    const { error: deleteError } = await this.client.from("user_roles").delete().eq("user_id", userId);
    if (deleteError) throw deleteError;
    if (uniqueIds.length) {
      const { error } = await this.client.from("user_roles").insert(uniqueIds.map((role_id) => ({ user_id: userId, role_id })));
      if (error) throw error;
    }
    return { user_id: userId, role_ids: uniqueIds };
  }
}
