import { describe, expect, it, vi } from "vitest";
import { OwnerService } from "./owner.service";
import type { SupabaseService } from "../../common/supabase/supabase.service";
function fixture() {
  const admin = { createUser: vi.fn(), deleteUser: vi.fn().mockResolvedValue({ error: null }), updateUserById: vi.fn().mockResolvedValue({ error: null }), getUserById: vi.fn() };
  const client = { rpc: vi.fn().mockResolvedValue({ data: {}, error: null }), auth: { admin } };
  return { client, admin, service: new OwnerService({ getClient: () => client } as unknown as SupabaseService) };
}
describe("Owner account administration", () => {
  it("denies a reset before touching Auth when the actor is not a platform owner", async () => {
    const { client, admin, service } = fixture(); client.rpc.mockResolvedValue({ error: { code: "42501" } });
    await expect(service.password("principal", "other-school-user", "test-password-only")).rejects.toThrow("not permitted");
    expect(admin.updateUserById).not.toHaveBeenCalled();
  });
  it("passes the chosen tenant through Auth metadata and rolls back failed profile creation", async () => {
    const { client, admin, service } = fixture(); client.rpc.mockResolvedValueOnce({ data: {} }).mockResolvedValueOnce({ error: { code: "23505" } }); admin.createUser.mockResolvedValue({ data: { user: { id: "new-account" } }, error: null });
    await expect(service.create("owner", { tenant_id: "school-b", full_name: "Teacher", email: "teacher@school.test", role: "TEACHER", password: "test-password-only" })).rejects.toThrow("Conflicting");
    expect(admin.createUser).toHaveBeenCalledWith(expect.objectContaining({ app_metadata: { tenant_id: "school-b" } }));
    expect(admin.deleteUser).toHaveBeenCalledWith("new-account");
    for (const [, params] of client.rpc.mock.calls) expect(params.payload).not.toHaveProperty("password");
  });
  it("never sends passwords into audit/profile RPCs", async () => {
    const { client, admin, service } = fixture(); await service.password("owner", "target", "test-password-only");
    expect(admin.updateUserById).toHaveBeenCalledWith("target", { password: "test-password-only" });
    expect(client.rpc).toHaveBeenLastCalledWith("owner_user_action", { actor_id: "owner", target_id: "target", operation: "PASSWORD_RESET", payload: {}, validate_only: false });
  });
  it("restores Auth email and metadata when the profile update cannot commit", async () => {
    const { client, admin, service } = fixture(); client.rpc.mockResolvedValueOnce({ data: {} }).mockResolvedValueOnce({ error: { code: "23505" } }); admin.getUserById.mockResolvedValue({ data: { user: { email: "old@school.test", user_metadata: { full_name: "Original", preferred_locale: "id" } } }, error: null });
    await expect(service.update("owner", "target", { email: "new@school.test" })).rejects.toThrow("Conflicting");
    expect(admin.updateUserById).toHaveBeenLastCalledWith("target", { email: "old@school.test", email_confirm: true, user_metadata: { full_name: "Original", preferred_locale: "id" } });
  });
});
