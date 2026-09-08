import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "database/migrations/0013_permission_management.sql"), "utf8");

describe("permission management migration", () => {
  it("adds only Phase 07 permission and role mapping work", () => {
    expect(migration).toContain("'permissions.manage'");
    expect(migration).toContain("'roles.manage'");
    expect(migration).toContain("'users.roles.manage'");
    expect(migration).toContain("public.role_permissions");
    expect(migration).toContain("public.user_roles");
  });

  it("keeps access scopes in the later Phase 08", () => {
    expect(migration).not.toContain("access_scope");
    expect(migration).not.toContain("GLOBAL");
    expect(migration).not.toContain("MODULE");
    expect(migration).not.toContain("RESOURCE");
  });
});
