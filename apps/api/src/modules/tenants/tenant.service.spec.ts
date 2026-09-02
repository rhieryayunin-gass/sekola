import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { SupabaseService } from "../../common/supabase/supabase.service";
import { TenantService } from "./tenant.service";

function query(result: unknown) {
  const terminal = vi.fn().mockResolvedValue({ data: result, error: null });
  return {
    eq: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: terminal,
    update: vi.fn().mockReturnThis(),
  };
}

function serviceWithQueries(...queries: ReturnType<typeof query>[]) {
  const client = {
    from: vi.fn(),
  };

  queries.forEach((tenantQuery) => {
    client.from.mockReturnValueOnce(tenantQuery);
  });

  const supabaseService = {
    getClient: () => client,
  } as unknown as SupabaseService;

  return {
    client,
    service: new TenantService(supabaseService),
  };
}

describe("TenantService", () => {
  it("normalizes a new tenant code", async () => {
    const createdTenant = {
      code: "SCHOOL_01",
      id: "00000000-0000-0000-0000-000000000010",
      name: "Sekola Satu",
    };
    const createQuery = query(createdTenant);
    const { service } = serviceWithQueries(createQuery);

    await expect(
      service.create({ code: " school_01 ", name: " Sekola Satu " }),
    ).resolves.toBe(createdTenant);

    expect(createQuery.insert).toHaveBeenCalledWith({
      code: "SCHOOL_01",
      name: "Sekola Satu",
    });
  });

  it("scopes an own-tenant update to the authenticated user's tenant", async () => {
    const userId = "00000000-0000-0000-0000-000000000001";
    const tenantId = "00000000-0000-0000-0000-000000000010";
    const contextQuery = query({ tenant_id: tenantId });
    const tenantQuery = query({ id: tenantId, name: "Sekola Baru" });
    const { service } = serviceWithQueries(contextQuery, tenantQuery);

    await service.updateForUser(userId, { name: " Sekola Baru " });

    expect(contextQuery.eq).toHaveBeenCalledWith("id", userId);
    expect(tenantQuery.update).toHaveBeenCalledWith({ name: "Sekola Baru" });
    expect(tenantQuery.eq).toHaveBeenCalledWith("id", tenantId);
  });

  it("rejects an empty platform tenant update", async () => {
    const { service } = serviceWithQueries();

    await expect(
      service.update("00000000-0000-0000-0000-000000000010", {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("deactivates only the selected tenant", async () => {
    const tenantId = "00000000-0000-0000-0000-000000000010";
    const tenantQuery = query({ id: tenantId, is_active: false });
    const { service } = serviceWithQueries(tenantQuery);

    await service.deactivate(tenantId);

    expect(tenantQuery.update).toHaveBeenCalledWith({ is_active: false });
    expect(tenantQuery.eq).toHaveBeenCalledWith("id", tenantId);
  });
});
