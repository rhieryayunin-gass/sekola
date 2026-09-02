import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";

import { SupabaseService } from "../../common/supabase/supabase.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

@Injectable()
export class UsersService {
  constructor(
    private readonly supabaseService: SupabaseService,
  ) {}

  private get client() {
    return this.supabaseService.getClient();
  }

  private async getTenantIdByUserId(userId: string) {
    const { data, error } = await this.client
      .from("users")
      .select("tenant_id")
      .eq("id", userId)
      .single();

    if (error || !data?.tenant_id) {
      throw new NotFoundException(
        "Tenant context not found",
      );
    }

    return data.tenant_id;
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

  async findAll(currentUserId: string) {
    const tenantId =
      await this.getTenantIdByUserId(currentUserId);

    const { data, error } = await this.client
      .from("users")
      .select(this.userSelect)
      .eq("tenant_id", tenantId)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      throw new InternalServerErrorException(
        "Failed to fetch users",
      );
    }

    return data ?? [];
  }

  async findOne(
    userId: string,
    currentUserId: string,
  ) {
    const tenantId =
      await this.getTenantIdByUserId(currentUserId);

    const { data, error } = await this.client
      .from("users")
      .select(this.userSelect)
      .eq("id", userId)
      .eq("tenant_id", tenantId)
      .single();

    if (error || !data) {
      throw new NotFoundException(
        "User not found",
      );
    }

    return data;
  }

  async create(
    dto: CreateUserDto,
    currentUserId: string,
  ) {
    const tenantId =
      await this.getTenantIdByUserId(currentUserId);

    /*
     * 1. Ensure the selected user level exists.
     */
    const {
      data: userLevel,
      error: userLevelError,
    } = await this.client
      .from("user_levels")
      .select("id, code, name")
      .eq("id", dto.user_level_id)
      .eq("is_active", true)
      .single();

    if (userLevelError || !userLevel) {
      throw new NotFoundException(
        "User level not found",
      );
    }

    /*
     * 2. Ensure the email is not already used by an application profile.
     */
    const {
      data: existingUser,
      error: existingUserError,
    } = await this.client
      .from("users")
      .select("id")
      .eq("email", dto.email)
      .maybeSingle();

    if (existingUserError) {
      console.error(
        "UsersService.create existing user check error:",
        {
          message: existingUserError.message,
          details: existingUserError.details,
          hint: existingUserError.hint,
          code: existingUserError.code,
        },
      );

      throw new InternalServerErrorException(
        "Failed to check existing user",
      );
    }

    if (existingUser) {
      throw new ConflictException(
        "User with this email already exists",
      );
    }

    /*
     * 3. Create the Supabase Auth user. The database trigger uses trusted app
     *    metadata to create the profile inside the current user's tenant.
     */
    const {
      data: authData,
      error: authError,
    } = await this.client.auth.admin.createUser({
      app_metadata: {
        tenant_id: tenantId,
      },
      email: dto.email,
      email_confirm: true,
      user_metadata: {
        full_name: dto.full_name ?? null,
      },
    });

    if (authError || !authData.user) {
      console.error(
        "UsersService.create Auth error:",
        {
          message: authError?.message,
          status: authError?.status,
          code: authError?.code,
        },
      );

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

    /*
     * 4. The trigger creates public.users. Complete its application profile.
     */
    const { data, error } = await this.client
      .from("users")
      .update({
        full_name: dto.full_name ?? null,
        email: dto.email,
        tenant_id: tenantId,
        user_level_id: dto.user_level_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", authUserId)
      .eq("tenant_id", tenantId)
      .select(this.userSelect)
      .single();

    /*
     * 5. Roll back the Auth user when profile creation or update fails.
     */
    if (error || !data) {
      console.error(
        "UsersService.create profile update error:",
        {
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
          code: error?.code,
        },
      );

      const { error: deleteAuthError } =
        await this.client.auth.admin.deleteUser(
        authUserId,
      );

      if (deleteAuthError) {
        console.error(
          "UsersService.create rollback Auth error:",
          {
            message: deleteAuthError.message,
            status: deleteAuthError.status,
          },
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
    const tenantId =
      await this.getTenantIdByUserId(currentUserId);

    /*
     * Ensure a changed user level is valid.
     */
    if (dto.user_level_id !== undefined) {
      const {
        data: userLevel,
        error: userLevelError,
      } = await this.client
        .from("user_levels")
        .select("id")
        .eq("id", dto.user_level_id)
        .eq("is_active", true)
        .single();

      if (userLevelError || !userLevel) {
        throw new NotFoundException(
          "User level not found",
        );
      }
    }

    const { data, error } = await this.client
      .from("users")
      .update({
        ...(dto.full_name !== undefined && {
          full_name: dto.full_name,
        }),
        ...(dto.email !== undefined && {
          email: dto.email,
        }),
        ...(dto.user_level_id !== undefined && {
          user_level_id: dto.user_level_id,
        }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .eq("tenant_id", tenantId)
      .select(this.userSelect)
      .single();

    if (error || !data) {
      throw new NotFoundException(
        "User not found",
      );
    }

    return data;
  }

  async deactivate(
    userId: string,
    currentUserId: string,
  ) {
    const tenantId =
      await this.getTenantIdByUserId(currentUserId);

    const { data, error } = await this.client
      .from("users")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .eq("tenant_id", tenantId)
      .select("id, is_active")
      .single();

    if (error || !data) {
      throw new NotFoundException(
        "User not found",
      );
    }

    return {
      success: true,
      id: data.id,
      is_active: data.is_active,
    };
  }

  async findMe(userId: string) {
    return this.findOne(userId, userId);
  }
}
