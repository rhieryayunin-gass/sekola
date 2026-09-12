import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { SupabaseService } from "../../common/supabase/supabase.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly supabaseService: SupabaseService,
  ) {}

  private get client() {
    return this.supabaseService.getClient();
  }

  async assertModuleAccess(userId: string, moduleCode: string) {
    const { data, error } = await this.client.rpc("app_module_enabled", { actor_id: userId, module_code: moduleCode });
    if (error || data !== true) throw new ForbiddenException("This module is disabled for the school");
  }

  private async ensureActiveProfile(userId: string) {
    const { data, error } = await this.client
      .from("users")
      .select(`
        id,
        is_active,
        deleted_at,
        tenants (
          is_active
        )
      `)
      .eq("id", userId)
      .single();

    if (error || !data) {
      throw new UnauthorizedException(
        "Authenticated user profile is unavailable",
      );
    }

    if (!data.is_active || data.deleted_at) {
      throw new UnauthorizedException("Account is inactive");
    }

    const tenant = Array.isArray(data.tenants)
      ? data.tenants[0]
      : data.tenants;

    if (!tenant?.is_active) {
      throw new UnauthorizedException("Tenant is inactive");
    }
  }

  async getUserFromToken(token: string) {
    const { data, error } = await this.client.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException(
        "Invalid or expired access token",
      );
    }

    await this.ensureActiveProfile(data.user.id);

    return data.user;
  }

  async getCurrentUser(userId: string) {
    const { data, error } = await this.client
      .from("users")
      .select(`
        id,
        email,
        full_name,
        user_level_id,
        is_active,
        created_at,
        updated_at
      `)
      .eq("id", userId)
      .single();

    if (error || !data) {
      throw new UnauthorizedException(
        "User profile not found",
      );
    }

    if (!data.is_active) {
      throw new UnauthorizedException("Account is inactive");
    }

    return data;
  }
}
