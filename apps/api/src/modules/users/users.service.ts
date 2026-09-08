import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";

import { SupabaseService } from "../../common/supabase/supabase.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { ListUsersDto } from "./dto/list-users.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

@Injectable()
export class UsersService {
  constructor(
    private readonly supabaseService: SupabaseService,
  ) {}

  private get client() {
    return this.supabaseService.getClient();
  }

  private readonly userSelect = `
    id,
    full_name,
    email,
    is_active,
    tenant_id,
    user_level_id,
    created_at,
    updated_at,
    user_levels (
      id,
      code,
      name
    )
  `;

  private async getTenantIdByUserId(userId: string) {
    const { data, error } = await this.client
      .from("users")
      .select("tenant_id")
      .eq("id", userId)
      .single();

    if (error || !data?.tenant_id) {
      throw new NotFoundException("Tenant context not found");
    }

    return data.tenant_id;
  }

  private async findTenantUser(userId: string, tenantId: string) {
    const { data, error } = await this.client
      .from("users")
      .select(this.userSelect)
      .eq("id", userId)
      .eq("tenant_id", tenantId)
      .single();

    if (error || !data) {
      throw new NotFoundException("User not found");
    }

    return data;
  }

  private async assertActiveUserLevel(userLevelId: string) {
    const { data, error } = await this.client
      .from("user_levels")
      .select("id, code, name")
      .eq("id", userLevelId)
      .eq("is_active", true)
      .single();

    if (error || !data) {
      throw new NotFoundException("User level not found");
    }

    return data;
  }

  private isPlatformLevel(level: { code: string; name: string }) {
    const identity = `${level.code} ${level.name}`
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "");

    return identity.includes("SUPER") && identity.includes("ADMIN");
  }

  private async getCurrentUserLevel(userId: string) {
    const { data, error } = await this.client
      .from("users")
      .select(`
        user_levels (
          code,
          name
        )
      `)
      .eq("id", userId)
      .single();

    if (error || !data) {
      throw new NotFoundException("User profile not found");
    }

    return Array.isArray(data.user_levels)
      ? data.user_levels[0] ?? null
      : data.user_levels;
  }

  private async assertAssignableUserLevel(
    userLevelId: string,
    currentUserId: string,
  ) {
    const targetLevel = await this.assertActiveUserLevel(userLevelId);

    if (!this.isPlatformLevel(targetLevel)) {
      return targetLevel;
    }

    const currentLevel = await this.getCurrentUserLevel(currentUserId);

    if (!currentLevel || !this.isPlatformLevel(currentLevel)) {
      throw new ForbiddenException(
        "Platform administrator level cannot be assigned",
      );
    }

    return targetLevel;
  }

  private async ensureEmailAvailable(
    email: string,
    excludedUserId?: string,
  ) {
    let lookup = this.client
      .from("users")
      .select("id")
      .ilike("email", email);

    if (excludedUserId) {
      lookup = lookup.neq("id", excludedUserId);
    }

    const { data, error } = await lookup.maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        "Failed to check existing user",
      );
    }

    if (data) {
      throw new ConflictException(
        "User with this email already exists",
      );
    }
  }

  async findAll(currentUserId: string, filters: ListUsersDto) {
    const tenantId = await this.getTenantIdByUserId(currentUserId);
    const offset = (filters.page - 1) * filters.page_size;
    const lastRow = offset + filters.page_size - 1;

    let listQuery = this.client
      .from("users")
      .select(this.userSelect, { count: "exact" })
      .eq("tenant_id", tenantId);

    if (filters.email) {
      listQuery = listQuery.ilike("email", `%${filters.email}%`);
    }

    if (filters.status) {
      listQuery = listQuery.eq(
        "is_active",
        filters.status === "active",
      );
    }

    const { data, error, count } = await listQuery
      .order("created_at", { ascending: false })
      .range(offset, lastRow);

    if (error) {
      throw new InternalServerErrorException("Failed to fetch users");
    }

    const total = count ?? 0;

    return {
      items: data ?? [],
      pagination: {
        page: filters.page,
        page_size: filters.page_size,
        total,
        total_pages: Math.max(1, Math.ceil(total / filters.page_size)),
      },
    };
  }

  async findOne(userId: string, currentUserId: string) {
    const tenantId = await this.getTenantIdByUserId(currentUserId);
    return this.findTenantUser(userId, tenantId);
  }

  async findUserLevels(currentUserId: string) {
    const { data, error } = await this.client
      .from("user_levels")
      .select("id, code, name")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      throw new InternalServerErrorException(
        "Failed to fetch user levels",
      );
    }

    const currentLevel = await this.getCurrentUserLevel(currentUserId);
    const canAssignPlatformLevel =
      currentLevel !== null && this.isPlatformLevel(currentLevel);

    return (data ?? []).filter(
      (level) =>
        canAssignPlatformLevel || !this.isPlatformLevel(level),
    );
  }

  async create(dto: CreateUserDto, currentUserId: string) {
    const tenantId = await this.getTenantIdByUserId(currentUserId);
    const email = dto.email.trim().toLowerCase();
    const fullName = dto.full_name?.trim() ?? null;

    await this.assertAssignableUserLevel(
      dto.user_level_id,
      currentUserId,
    );
    await this.ensureEmailAvailable(email);

    const { data: authData, error: authError } =
      await this.client.auth.admin.createUser({
        app_metadata: { tenant_id: tenantId },
        email,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

    if (authError || !authData.user) {
      if (
        authError?.message
          ?.toLowerCase()
          .includes("already registered")
      ) {
        throw new ConflictException(
          "User with this email already exists",
        );
      }

      throw new InternalServerErrorException(
        "Failed to create authentication user",
      );
    }

    const authUserId = authData.user.id;
    const { data, error } = await this.client
      .from("users")
      .update({
        email,
        full_name: fullName,
        tenant_id: tenantId,
        user_level_id: dto.user_level_id,
      })
      .eq("id", authUserId)
      .eq("tenant_id", tenantId)
      .select(this.userSelect)
      .single();

    if (error || !data) {
      const { error: rollbackError } =
        await this.client.auth.admin.deleteUser(authUserId);

      if (rollbackError) {
        console.error(
          "Unable to roll back Auth user after profile failure",
          rollbackError,
        );
      }

      throw new InternalServerErrorException(
        "Failed to create user profile",
      );
    }

    return data;
  }

  async update(
    userId: string,
    dto: UpdateUserDto,
    currentUserId: string,
  ) {
    const tenantId = await this.getTenantIdByUserId(currentUserId);
    const current = await this.findTenantUser(userId, tenantId);

    if (dto.user_level_id !== undefined) {
      if (
        userId === currentUserId &&
        dto.user_level_id !== current.user_level_id
      ) {
        throw new BadRequestException(
          "You cannot change your own user level",
        );
      }

      await this.assertAssignableUserLevel(
        dto.user_level_id,
        currentUserId,
      );
    }

    const email = dto.email?.trim().toLowerCase();
    const fullName = dto.full_name?.trim();

    if (email !== undefined && email !== current.email) {
      await this.ensureEmailAvailable(email, userId);
    }

    const changes = {
      ...(fullName !== undefined && { full_name: fullName }),
      ...(email !== undefined && { email }),
      ...(dto.user_level_id !== undefined && {
        user_level_id: dto.user_level_id,
      }),
    };

    if (Object.keys(changes).length === 0) {
      throw new BadRequestException("At least one user field is required");
    }

    const { data, error } = await this.client
      .from("users")
      .update(changes)
      .eq("id", userId)
      .eq("tenant_id", tenantId)
      .select(this.userSelect)
      .single();

    if (error || !data) {
      throw new InternalServerErrorException("Failed to update user");
    }

    if (email !== undefined || fullName !== undefined) {
      const { data: authSnapshot, error: snapshotError } =
        await this.client.auth.admin.getUserById(userId);

      if (snapshotError || !authSnapshot.user) {
        await this.rollbackProfile(userId, tenantId, current);
        throw new InternalServerErrorException(
          "Failed to synchronize authentication user",
        );
      }

      const { error: authError } =
        await this.client.auth.admin.updateUserById(userId, {
          ...(email !== undefined && {
            email,
            email_confirm: true,
          }),
          ...(fullName !== undefined && {
            user_metadata: {
              ...authSnapshot.user.user_metadata,
              full_name: fullName,
            },
          }),
        });

      if (authError) {
        await this.rollbackProfile(userId, tenantId, current);

        if (
          authError.message
            .toLowerCase()
            .includes("already registered")
        ) {
          throw new ConflictException(
            "User with this email already exists",
          );
        }

        throw new InternalServerErrorException(
          "Failed to synchronize authentication user",
        );
      }
    }

    return data;
  }

  private async rollbackProfile(
    userId: string,
    tenantId: string,
    current: Record<string, unknown>,
  ) {
    const { error } = await this.client
      .from("users")
      .update({
        email: current.email,
        full_name: current.full_name,
        user_level_id: current.user_level_id,
      })
      .eq("id", userId)
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("Unable to roll back user profile", error);
    }
  }

  async setStatus(
    userId: string,
    isActive: boolean,
    currentUserId: string,
  ) {
    const tenantId = await this.getTenantIdByUserId(currentUserId);
    const current = await this.findTenantUser(userId, tenantId);

    if (userId === currentUserId && !isActive) {
      throw new BadRequestException(
        "You cannot deactivate your own account",
      );
    }

    if (current.is_active === isActive) {
      return current;
    }

    const { error: authError } =
      await this.client.auth.admin.updateUserById(userId, {
        ban_duration: isActive ? "none" : "876000h",
      });

    if (authError) {
      throw new InternalServerErrorException(
        "Failed to update authentication status",
      );
    }

    const { data, error } = await this.client
      .from("users")
      .update({ is_active: isActive })
      .eq("id", userId)
      .eq("tenant_id", tenantId)
      .select(this.userSelect)
      .single();

    if (error || !data) {
      const { error: rollbackError } =
        await this.client.auth.admin.updateUserById(userId, {
          ban_duration: current.is_active ? "none" : "876000h",
        });

      if (rollbackError) {
        console.error("Unable to roll back Auth user status", rollbackError);
      }

      throw new InternalServerErrorException("Failed to update user status");
    }

    return data;
  }

  async deactivate(userId: string, currentUserId: string) {
    return this.setStatus(userId, false, currentUserId);
  }

  async findMe(userId: string) {
    return this.findOne(userId, userId);
  }
}
