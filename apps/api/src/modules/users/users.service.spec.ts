import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { SupabaseService } from "../../common/supabase/supabase.service";
import { UsersService } from "./users.service";

interface QueryResult {
  count?: number;
  data?: unknown;
  error?: unknown;
}

function query({
  count,
  data = null,
  error = null,
}: QueryResult = {}) {
  const result = { count, data, error };
  const terminal = vi.fn().mockResolvedValue(result);
  const builder = {
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    maybeSingle: terminal,
    neq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: terminal,
    select: vi.fn().mockReturnThis(),
    single: terminal,
    update: vi.fn().mockReturnThis(),
  };

  return builder;
}

function serviceWith(client: object) {
  const supabaseService = {
    getClient: () => client,
  } as unknown as SupabaseService;

  return new UsersService(supabaseService);
}

const currentUserId = "00000000-0000-0000-0000-000000000001";
const targetUserId = "00000000-0000-0000-0000-000000000002";
const tenantId = "00000000-0000-0000-0000-000000000010";
const userLevelId = "00000000-0000-0000-0000-000000000020";

describe("UsersService tenant isolation", () => {
  it("paginates and filters only users in the current tenant", async () => {
    const tenantQuery = query({ data: { tenant_id: tenantId } });
    const listQuery = query({
      count: 1,
      data: [{ id: targetUserId, tenant_id: tenantId }],
    });
    const service = serviceWith({
      from: vi
        .fn()
        .mockReturnValueOnce(tenantQuery)
        .mockReturnValueOnce(listQuery),
    });

    await expect(
      service.findAll(currentUserId, {
        email: "teacher@example.com",
        page: 2,
        page_size: 10,
        status: "active",
      }),
    ).resolves.toMatchObject({
      pagination: {
        page: 2,
        page_size: 10,
        total: 1,
      },
    });

    expect(listQuery.eq).toHaveBeenCalledWith("tenant_id", tenantId);
    expect(listQuery.eq).toHaveBeenCalledWith("is_active", true);
    expect(listQuery.ilike).toHaveBeenCalledWith(
      "email",
      "%teacher@example.com%",
    );
    expect(listQuery.range).toHaveBeenCalledWith(10, 19);
  });

  it("does not return a user outside the current tenant", async () => {
    const service = serviceWith({
      from: vi
        .fn()
        .mockReturnValueOnce(
          query({ data: { tenant_id: tenantId } }),
        )
        .mockReturnValueOnce(
          query({ error: { code: "PGRST116" } }),
        ),
    });

    await expect(
      service.findOne(targetUserId, currentUserId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("UsersService lifecycle", () => {
  it("provisions Auth and Core profiles in the current tenant", async () => {
    const profile = {
      email: "teacher@example.com",
      id: targetUserId,
      tenant_id: tenantId,
      user_level_id: userLevelId,
    };
    const createUser = vi.fn().mockResolvedValue({
      data: { user: { id: targetUserId } },
      error: null,
    });
    const profileQuery = query({ data: profile });
    const service = serviceWith({
      auth: {
        admin: {
          createUser,
          deleteUser: vi.fn(),
        },
      },
      from: vi
        .fn()
        .mockReturnValueOnce(
          query({ data: { tenant_id: tenantId } }),
        )
        .mockReturnValueOnce(
          query({ data: { id: userLevelId, code: "TEACHER" } }),
        )
        .mockReturnValueOnce(query())
        .mockReturnValueOnce(profileQuery),
    });

    await expect(
      service.create(
        {
          email: "Teacher@Example.com",
          full_name: " Teacher ",
          user_level_id: userLevelId,
        },
        currentUserId,
      ),
    ).resolves.toBe(profile);

    expect(createUser).toHaveBeenCalledWith({
      app_metadata: { tenant_id: tenantId },
      email: "teacher@example.com",
      email_confirm: true,
      user_metadata: { full_name: "Teacher" },
    });
    expect(profileQuery.eq).toHaveBeenCalledWith(
      "tenant_id",
      tenantId,
    );
  });

  it("synchronizes changed email and name to Supabase Auth", async () => {
    const current = {
      email: "old@example.com",
      full_name: "Old Name",
      id: targetUserId,
      is_active: true,
      tenant_id: tenantId,
      user_level_id: userLevelId,
    };
    const profileQuery = query({
      data: {
        ...current,
        email: "new@example.com",
        full_name: "New Name",
      },
    });
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    const service = serviceWith({
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: {
              user: {
                user_metadata: { locale: "en" },
              },
            },
            error: null,
          }),
          updateUserById,
        },
      },
      from: vi
        .fn()
        .mockReturnValueOnce(
          query({ data: { tenant_id: tenantId } }),
        )
        .mockReturnValueOnce(query({ data: current }))
        .mockReturnValueOnce(query())
        .mockReturnValueOnce(profileQuery),
    });

    await service.update(
      targetUserId,
      {
        email: "New@Example.com",
        full_name: " New Name ",
      },
      currentUserId,
    );

    expect(updateUserById).toHaveBeenCalledWith(targetUserId, {
      email: "new@example.com",
      email_confirm: true,
      user_metadata: {
        full_name: "New Name",
        locale: "en",
      },
    });
    expect(profileQuery.eq).toHaveBeenCalledWith(
      "tenant_id",
      tenantId,
    );
  });

  it("updates Auth ban and Core status together", async () => {
    const current = {
      email: "teacher@example.com",
      full_name: "Teacher",
      id: targetUserId,
      is_active: true,
      tenant_id: tenantId,
      user_level_id: userLevelId,
    };
    const profileQuery = query({
      data: { ...current, is_active: false },
    });
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    const service = serviceWith({
      auth: { admin: { updateUserById } },
      from: vi
        .fn()
        .mockReturnValueOnce(
          query({ data: { tenant_id: tenantId } }),
        )
        .mockReturnValueOnce(query({ data: current }))
        .mockReturnValueOnce(profileQuery),
    });

    await service.setStatus(targetUserId, false, currentUserId);

    expect(updateUserById).toHaveBeenCalledWith(targetUserId, {
      ban_duration: "876000h",
    });
    expect(profileQuery.update).toHaveBeenCalledWith({
      is_active: false,
    });
  });

  it("prevents an administrator from deactivating their own account", async () => {
    const current = {
      id: currentUserId,
      is_active: true,
      tenant_id: tenantId,
    };
    const service = serviceWith({
      from: vi
        .fn()
        .mockReturnValueOnce(
          query({ data: { tenant_id: tenantId } }),
        )
        .mockReturnValueOnce(query({ data: current })),
    });

    await expect(
      service.setStatus(currentUserId, false, currentUserId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("prevents an administrator from changing their own user level", async () => {
    const current = {
      id: currentUserId,
      is_active: true,
      tenant_id: tenantId,
      user_level_id: userLevelId,
    };
    const service = serviceWith({
      from: vi
        .fn()
        .mockReturnValueOnce(
          query({ data: { tenant_id: tenantId } }),
        )
        .mockReturnValueOnce(query({ data: current })),
    });

    await expect(
      service.update(
        currentUserId,
        {
          user_level_id:
            "00000000-0000-0000-0000-000000000099",
        },
        currentUserId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("prevents a tenant administrator from assigning a platform level", async () => {
    const service = serviceWith({
      from: vi
        .fn()
        .mockReturnValueOnce(
          query({ data: { tenant_id: tenantId } }),
        )
        .mockReturnValueOnce(
          query({
            data: {
              code: "SUPER_ADMIN",
              id: userLevelId,
              name: "Super Admin",
            },
          }),
        )
        .mockReturnValueOnce(
          query({
            data: {
              user_levels: {
                code: "SCHOOL_ADMIN",
                name: "School Admin",
              },
            },
          }),
        ),
    });

    await expect(
      service.create(
        {
          email: "platform@example.com",
          user_level_id: userLevelId,
        },
        currentUserId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
