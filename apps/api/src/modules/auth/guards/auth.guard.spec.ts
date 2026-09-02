import {
  type ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import type { User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { AuthService } from "../auth.service";
import { AuthGuard } from "./auth.guard";

function createContext(authorization?: string) {
  const request = {
    headers: { authorization },
    user: undefined as User | undefined,
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, request };
}

describe("AuthGuard", () => {
  it("requires an authorization header", async () => {
    const service = {
      getUserFromToken: vi.fn(),
    } as unknown as AuthService;
    const guard = new AuthGuard(service);
    const { context } = createContext();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects a non-Bearer authorization scheme", async () => {
    const service = {
      getUserFromToken: vi.fn(),
    } as unknown as AuthService;
    const guard = new AuthGuard(service);
    const { context } = createContext("Basic credentials");

    await expect(guard.canActivate(context)).rejects.toThrow(
      "Invalid authorization header",
    );
  });

  it("attaches the verified user to the request", async () => {
    const user = { id: "user-id" } as User;
    const service = {
      getUserFromToken: vi.fn().mockResolvedValue(user),
    } as unknown as AuthService;
    const guard = new AuthGuard(service);
    const { context, request } = createContext("Bearer access-token");

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toBe(user);
  });
});
