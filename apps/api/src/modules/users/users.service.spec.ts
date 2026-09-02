import { describe, expect, it, vi } from "vitest";
import { SupabaseService } from "../../common/supabase/supabase.service";
import { UsersService } from "./users.service";

function query(result: unknown) {
  const terminal = vi.fn().mockResolvedValue({
    data: result,
    error: null,
  });
  const builder = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: terminal,
    select: vi.fn().mockReturnThis(),
    single: terminal,
    update: vi.fn().mockReturnThis(),
  };

  return builder;
}

describe("UsersService.create", () => {
  it("provisions the Auth user inside the current user's tenant", async () => {
    const currentUserId = "00000000-0000-0000-0000-000000000001";
    const tenantId = "00000000-0000-0000-0000-000000000010";
    const userLevelId = "00000000-0000-0000-0000-000000000020";
    const authUserId = "00000000-0000-0000-0000-000000000030";
    const tenantQuery = query({ tenant_id: tenantId });
    const levelQuery = query({ id: userLevelId, code: "TEACHER" });
    const existingUserQuery = query(null);
    const profile = {
      email: "teacher@example.com",
      id: authUserId,
      tenant_id: tenantId,
      user_level_id: userLevelId,
    };
    const profileQuery = query(profile);
    const createUser = vi.fn().mockResolvedValue({
      data: { user: { id: authUserId } },
      error: null,
    });
    const client = {
      auth: {
        admin: {
          createUser,
          deleteUser: vi.fn(),
        },
      },
      from: vi
        .fn()
        .mockReturnValueOnce(tenantQuery)
        .mockReturnValueOnce(levelQuery)
        .mockReturnValueOnce(existingUserQuery)
        .mockReturnValueOnce(profileQuery),
    };
    const supabaseService = {
      getClient: () => client,
    } as unknown as SupabaseService;
    const service = new UsersService(supabaseService);

    await expect(
      service.create(
        {
          email: profile.email,
          full_name: "Teacher",
          user_level_id: userLevelId,
        },
        currentUserId,
      ),
    ).resolves.toBe(profile);

    expect(createUser).toHaveBeenCalledWith({
      app_metadata: { tenant_id: tenantId },
      email: profile.email,
      email_confirm: true,
      user_metadata: { full_name: "Teacher" },
    });
    expect(profileQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: tenantId,
        user_level_id: userLevelId,
      }),
    );
  });

  it("scopes profile updates to the current user's tenant", async () => {
    const currentUserId = "00000000-0000-0000-0000-000000000001";
    const targetUserId = "00000000-0000-0000-0000-000000000002";
    const tenantId = "00000000-0000-0000-0000-000000000010";
    const tenantQuery = query({ tenant_id: tenantId });
    const profileQuery = query({
      full_name: "Updated Teacher",
      id: targetUserId,
      tenant_id: tenantId,
    });
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce(tenantQuery)
        .mockReturnValueOnce(profileQuery),
    };
    const supabaseService = {
      getClient: () => client,
    } as unknown as SupabaseService;
    const service = new UsersService(supabaseService);

    await service.update(
      targetUserId,
      { full_name: "Updated Teacher" },
      currentUserId,
    );

    expect(profileQuery.eq).toHaveBeenCalledWith(
      "tenant_id",
      tenantId,
    );
  });

  it("scopes profile deactivation to the current user's tenant", async () => {
    const currentUserId = "00000000-0000-0000-0000-000000000001";
    const targetUserId = "00000000-0000-0000-0000-000000000002";
    const tenantId = "00000000-0000-0000-0000-000000000010";
    const tenantQuery = query({ tenant_id: tenantId });
    const profileQuery = query({
      id: targetUserId,
      is_active: false,
    });
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce(tenantQuery)
        .mockReturnValueOnce(profileQuery),
    };
    const supabaseService = {
      getClient: () => client,
    } as unknown as SupabaseService;
    const service = new UsersService(supabaseService);

    await service.deactivate(
      targetUserId,
      currentUserId,
    );

    expect(profileQuery.eq).toHaveBeenCalledWith(
      "tenant_id",
      tenantId,
    );
  });
});
