import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AccessScopeGuard } from "./access-scope.guard";

const context = (userId = "user-1") => ({
  getHandler: () => ({}), getClass: () => ({}),
  switchToHttp: () => ({ getRequest: () => ({ user: userId ? { id: userId } : undefined }) }),
}) as never;

describe("AccessScopeGuard", () => {
  it("allows a required scope when the authorization service grants it", async () => {
    const reflector = { getAllAndOverride: () => ({ scopeType: "MODULE", scopeKey: "users" }) } as never;
    const authorization = { hasAccessScope: vi.fn().mockResolvedValue(true) } as never;
    await expect(new AccessScopeGuard(reflector, authorization).canActivate(context())).resolves.toBe(true);
  });

  it("rejects a missing scope", async () => {
    const reflector = { getAllAndOverride: () => ({ scopeType: "MODULE", scopeKey: "users" }) } as never;
    const authorization = { hasAccessScope: vi.fn().mockResolvedValue(false) } as never;
    await expect(new AccessScopeGuard(reflector, authorization).canActivate(context())).rejects.toBeInstanceOf(ForbiddenException);
  });
});
