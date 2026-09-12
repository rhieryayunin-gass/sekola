import { ConflictException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { SupabaseService } from "../../common/supabase/supabase.service";
import { databaseError } from "../../common/data/database-error";
import { OwnerCreateUserDto, OwnerUpdateUserDto } from "./owner.dto";

@Injectable()
export class OwnerService {
  constructor(private readonly supabase: SupabaseService) {}
  private get client() { return this.supabase.getClient(); }
  private async action(actorId: string, targetId: string | null, operation: string, payload: Record<string, unknown> = {}, validateOnly = false) {
    const { data, error } = await this.client.rpc("owner_user_action", { actor_id: actorId, target_id: targetId, operation, payload, validate_only: validateOnly });
    if (error) databaseError(error);
    return data;
  }
  private authFailure(error: { status?: number; code?: string } | null): never {
    if (error?.code === "email_exists" || error?.status === 422) throw new ConflictException("Email or password does not meet account requirements");
    throw new InternalServerErrorException("Authentication update failed");
  }
  async create(actorId: string, dto: OwnerCreateUserDto) {
    const { password, ...profile } = dto; profile.email = profile.email.trim().toLowerCase();
    await this.action(actorId, null, "CREATE", profile, true);
    const { data, error } = await this.client.auth.admin.createUser({ email: profile.email, password, email_confirm: true, app_metadata: { tenant_id: profile.tenant_id }, user_metadata: { full_name: profile.full_name } });
    if (error || !data.user) this.authFailure(error);
    try { return await this.action(actorId, data.user.id, "CREATE", profile); }
    catch (cause) {
      const rollback = await this.client.auth.admin.deleteUser(data.user.id);
      if (rollback.error) throw new InternalServerErrorException("Account profile setup failed; administrator reconciliation required");
      throw cause;
    }
  }
  async update(actorId: string, targetId: string, dto: OwnerUpdateUserDto) {
    const profile = { ...dto, ...(dto.email ? { email: dto.email.trim().toLowerCase() } : {}) };
    await this.action(actorId, targetId, "UPDATE", profile, true);
    const before = await this.client.auth.admin.getUserById(targetId);
    if (before.error || !before.data.user) this.authFailure(before.error);
    const user = before.data.user;
    const auth = await this.client.auth.admin.updateUserById(targetId, { ...(profile.email ? { email: profile.email, email_confirm: true } : {}), ...(profile.full_name ? { user_metadata: { ...user.user_metadata, full_name: profile.full_name } } : {}) });
    if (auth.error) this.authFailure(auth.error);
    try { return await this.action(actorId, targetId, "UPDATE", profile); }
    catch (cause) {
      const rollback = await this.client.auth.admin.updateUserById(targetId, { email: user.email, email_confirm: true, user_metadata: user.user_metadata });
      if (rollback.error) throw new InternalServerErrorException("Profile synchronization failed; administrator reconciliation required");
      throw cause;
    }
  }
  async status(actorId: string, targetId: string, operation: "STATUS" | "ARCHIVE" | "RESTORE", active?: boolean) {
    // The database active flag is authoritative for existing sessions, RPCs, and API access.
    if (operation === "RESTORE" || (operation === "STATUS" && active === true)) {
      await this.action(actorId, targetId, operation, operation === "STATUS" ? { is_active: true } : {}, true);
      const { error } = await this.client.auth.admin.updateUserById(targetId, { ban_duration: "none" });
      if (error) this.authFailure(error);
    }
    return this.action(actorId, targetId, operation, operation === "STATUS" ? { is_active: active } : {});
  }
  async password(actorId: string, targetId: string, password: string) {
    await this.action(actorId, targetId, "PASSWORD_RESET", {}, true);
    const { error } = await this.client.auth.admin.updateUserById(targetId, { password });
    if (error) this.authFailure(error);
    // Only event metadata is audited; never log or persist credentials in public tables.
    return this.action(actorId, targetId, "PASSWORD_RESET");
  }
}
