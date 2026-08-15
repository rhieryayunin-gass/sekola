import {
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { SupabaseService } from "../../common/supabase/supabase.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly supabaseService: SupabaseService,
  ) {}

  async getUserFromToken(token: string) {
    const { data, error } =
      await this.supabaseService
        .getClient()
        .auth
        .getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException(
        "Invalid or expired access token",
      );
    }

    return data.user;
  }

  async getCurrentUser(userId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
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

    return data;
  }
}