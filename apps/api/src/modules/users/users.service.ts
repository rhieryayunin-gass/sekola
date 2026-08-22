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

  private readonly userSelect = `
    id,
    full_name,
    email,
    is_active,
    user_level_id,
    created_at,
    updated_at,
    user_levels (
      id,
      code,
      name
    )
  `;

  async findAll() {
    const { data, error } = await this.client
      .from("users")
      .select(this.userSelect)
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

  async findOne(userId: string) {
    const { data, error } = await this.client
      .from("users")
      .select(this.userSelect)
      .eq("id", userId)
      .single();

    if (error || !data) {
      throw new NotFoundException(
        "User not found",
      );
    }

    return data;
  }

  async create(dto: CreateUserDto) {
  /*
   * 1. Pastikan user level exists.
   */
  const { data: userLevel, error: userLevelError } =
    await this.client
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
   * 2. Pastikan email belum digunakan oleh
   *    profile aplikasi.
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
   * 3. Create Supabase Auth user.
   *
   * handle_new_user() database trigger akan
   * otomatis membuat public.users dengan
   * id = auth.users.id.
   */
  const {
    data: authData,
    error: authError,
  } =
    await this.client.auth.admin.createUser({
      email: dto.email,
      email_confirm: true,
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
   * 4. Trigger handle_new_user() membuat
   *    public.users secara otomatis.
   *
   *    Sekarang kita update profile tersebut.
   */
  const {
    data,
    error,
  } = await this.client
    .from("users")
    .update({
      full_name: dto.full_name ?? null,
      email: dto.email,
      user_level_id: dto.user_level_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", authUserId)
    .select(this.userSelect)
    .single();

  /*
   * 5. Jika trigger tidak membuat profile atau
   *    update gagal, rollback Auth user.
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

    const {
      error: deleteAuthError,
    } =
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
  ) {
    /*
     * Kalau user_level_id diubah, pastikan level valid.
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
      .select(this.userSelect)
      .single();

    if (error || !data) {
      throw new NotFoundException(
        "User not found",
      );
    }

    return data;
  }

  async deactivate(userId: string) {
    const { data, error } = await this.client
      .from("users")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
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
    return this.findOne(userId);
  }
}