import { describe, expect, it } from "vitest";
import { REQUIRED_PERMISSION_KEY } from "../../common/authorization/decorators/require-permission.decorator";
import { UsersController } from "./users.controller";

function permissionFor(method: keyof UsersController) {
  return Reflect.getMetadata(
    REQUIRED_PERMISSION_KEY,
    UsersController.prototype[method],
  );
}

describe("UsersController permissions", () => {
  it("uses the user master permissions for CRUD", () => {
    expect(permissionFor("findAll")).toBe("users.read");
    expect(permissionFor("findOne")).toBe("users.read");
    expect(permissionFor("findUserLevels")).toBe("users.read");
    expect(permissionFor("create")).toBe("users.create");
    expect(permissionFor("update")).toBe("users.update");
  });

  it("uses one reversible permission for activate and deactivate", () => {
    expect(permissionFor("setStatus")).toBe("users.status");
    expect(permissionFor("deactivate")).toBe("users.status");
  });
});
