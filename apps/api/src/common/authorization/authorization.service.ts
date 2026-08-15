import { Injectable, UnauthorizedException } from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.service";
import {
  AuthorizationContext,
  AuthorizationPermission,
  AuthorizationRole,
  AuthorizationUserLevel,
} from "./authorization.types";

@Injectable()
export class AuthorizationService {
  constructor(
    private readonly supabaseService: SupabaseService,
  ) {}

  async getContext(userId: string): Promise<AuthorizationContext> {
    const supabase = this.supabaseService.getClient();

    const { data: user, error: userError } = await supabase
      .from("users")
      .select(
        `
          id,
          user_level_id,
          user_levels (
            id,
            code,
            name
          )
        `,
      )
      .eq("id", userId)
      .single();

    if (userError || !user) {
      throw new UnauthorizedException("User profile not found");
    }

    const userLevel = Array.isArray(user.user_levels)
      ? user.user_levels[0] ?? null
      : user.user_levels;

    if (!userLevel) {
      return {
        userId,
        userLevel: null,
        roles: [],
        permissions: [],
      };
    }

    const { data: roleMappings, error: roleError } = await supabase
      .from("user_level_roles")
      .select(
        `
          roles (
            id,
            code,
            name
          )
        `,
      )
      .eq("user_level_id", userLevel.id);

    if (roleError) {
      throw roleError;
    }

    const roles: AuthorizationRole[] = (roleMappings ?? [])
      .map((item) =>
        Array.isArray(item.roles)
          ? item.roles[0]
          : item.roles,
      )
      .filter(Boolean);

    if (roles.length === 0) {
      return {
        userId,
        userLevel: userLevel as AuthorizationUserLevel,
        roles: [],
        permissions: [],
      };
    }

    const roleIds = roles.map((role) => role.id);

    const { data: permissionMappings, error: permissionError } =
      await supabase
        .from("role_permissions")
        .select(
          `
            permissions (
              id,
              code,
              name
            )
          `,
        )
        .in("role_id", roleIds);

    if (permissionError) {
      throw permissionError;
    }

    const permissions = (permissionMappings ?? [])
      .map((item) =>
        Array.isArray(item.permissions)
          ? item.permissions[0]
          : item.permissions,
      )
      .filter(Boolean);

    const uniquePermissions = Array.from(
      new Map(
        permissions.map((permission) => [
          permission.id,
          permission,
        ]),
      ).values(),
    );

    return {
      userId,
      userLevel: userLevel as AuthorizationUserLevel,
      roles,
      permissions: uniquePermissions as AuthorizationPermission[],
    };
  }

  async hasPermission(
    userId: string,
    permissionCode: string,
  ): Promise<boolean> {
    const context = await this.getContext(userId);

    return context.permissions.some(
      (permission) => permission.code === permissionCode,
    );
  }
}
