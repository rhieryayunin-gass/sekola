import { UnauthorizedException } from "@nestjs/common";
import type { User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { SupabaseService } from "../../common/supabase/supabase.service";
import { AuthService } from "./auth.service";

function createService({
  authUser,
  profile,
}: {
  authUser: User | null;
  profile: {
    id: string;
    is_active: boolean;
    tenants: { is_active: boolean } | null;
  } | null;
}) {
  const single = vi.fn().mockResolvedValue({ data: profile, error: null });
  const query = {
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single,
  };
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authUser },
        error: authUser ? null : new Error("invalid token"),
      }),
    },
    from: vi.fn().mockReturnValue(query),
  };
  const supabaseService = {
    getClient: () => client,
  } as unknown as SupabaseService;

  return {
    client,
    service: new AuthService(supabaseService),
  };
}

const authenticatedUser = {
  id: "00000000-0000-0000-0000-000000000001",
} as User;

describe("AuthService.getUserFromToken", () => {
  it("returns a verified user with an active profile", async () => {
    const { client, service } = createService({
      authUser: authenticatedUser,
      profile: {
        id: authenticatedUser.id,
        is_active: true,
        tenants: { is_active: true },
      },
    });

    await expect(service.getUserFromToken("valid-token")).resolves.toBe(
      authenticatedUser,
    );
    expect(client.auth.getUser).toHaveBeenCalledWith("valid-token");
  });

  it("rejects an invalid token", async () => {
    const { service } = createService({ authUser: null, profile: null });

    await expect(service.getUserFromToken("invalid-token")).rejects.toThrow(
      "Invalid or expired access token",
    );
  });

  it("rejects an inactive profile", async () => {
    const { service } = createService({
      authUser: authenticatedUser,
      profile: {
        id: authenticatedUser.id,
        is_active: false,
        tenants: { is_active: true },
      },
    });

    await expect(service.getUserFromToken("valid-token")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.getUserFromToken("valid-token")).rejects.toThrow(
      "Account is inactive",
    );
  });

  it("rejects a user whose tenant is inactive", async () => {
    const { service } = createService({
      authUser: authenticatedUser,
      profile: {
        id: authenticatedUser.id,
        is_active: true,
        tenants: { is_active: false },
      },
    });

    await expect(service.getUserFromToken("valid-token")).rejects.toThrow(
      "Tenant is inactive",
    );
  });
});
