import { describe, expect, it, vi } from "vitest";
import { moduleForPath } from "./module-access";
import { AuthService } from "./auth.service";
import type { SupabaseService } from "../../common/supabase/supabase.service";
describe("Server module enforcement", () => {
  it.each([["/api/v1/finance/bills", "finance"], ["/api/v1/team/projects", "team"], ["/api/v1/exams?limit=20", "exams"], ["/api/v1/attendance-records", "attendance"], ["/api/v1/courses", "learning"], ["/api/v1/academic-years", "academic"], ["/api/v1/operations/rooms", "core"], ["/api/v1/users", "core"]])("maps %s to %s", (path, module) => expect(moduleForPath(path)).toBe(module));
  it.each(["/api/v1/auth/me", "/api/v1/permissions/me", "/api/v1/users/me/profile", "/api/v1/owner/users", "/api/v1/notifications"])("keeps shared identity and platform endpoints independent: %s", path => expect(moduleForPath(path)).toBeUndefined());
  it("fails closed for disabled modules and database errors", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: false }).mockResolvedValueOnce({ data: null, error: { code: "503" } }).mockResolvedValueOnce({ data: true });
    const service = new AuthService({ getClient: () => ({ rpc }) } as unknown as SupabaseService);
    await expect(service.assertModuleAccess("user", "learning")).rejects.toThrow("disabled");
    await expect(service.assertModuleAccess("user", "learning")).rejects.toThrow("disabled");
    await expect(service.assertModuleAccess("user", "learning")).resolves.toBeUndefined();
  });
});
