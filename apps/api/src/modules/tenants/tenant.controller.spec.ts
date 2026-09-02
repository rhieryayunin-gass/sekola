import { describe, expect, it } from "vitest";
import { REQUIRED_PERMISSION_KEY } from "../../common/authorization/decorators/require-permission.decorator";
import { TenantController } from "./tenant.controller";

function permissionFor(method: keyof TenantController) {
  return Reflect.getMetadata(
    REQUIRED_PERMISSION_KEY,
    TenantController.prototype[method],
  );
}

describe("TenantController permissions", () => {
  it("requires platform permission for cross-tenant reads", () => {
    expect(permissionFor("findAll")).toBe("tenants.read_all");
    expect(permissionFor("findOne")).toBe("tenants.read_all");
  });

  it("uses a dedicated permission for own-tenant updates", () => {
    expect(permissionFor("updateMe")).toBe("tenants.update_own");
  });

  it("does not reuse user permissions for tenant administration", () => {
    const tenantPermissions = [
      permissionFor("findAll"),
      permissionFor("findOne"),
      permissionFor("create"),
      permissionFor("update"),
      permissionFor("deactivate"),
    ];

    expect(tenantPermissions).not.toContain("users.read");
    expect(tenantPermissions.every((value) => value.startsWith("tenants."))).toBe(
      true,
    );
  });
});
