import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { SupabaseService } from "../../common/supabase/supabase.service";
import { PermissionsService } from "./permissions.service";

describe("PermissionsService", () => {
  it("does not allow an administrator to alter their own direct roles", async () => {
    const service = new PermissionsService({ getClient: () => ({}) } as unknown as SupabaseService);
    await expect(service.replaceUserRoles("00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000001", [])).rejects.toBeInstanceOf(ForbiddenException);
  });
});
