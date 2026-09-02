import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "database/migrations/0009_tenant_management.sql"),
  "utf8",
);
const roleMappingMigration = readFileSync(
  resolve(
    process.cwd(),
    "database/migrations/0010_tenant_permission_role_mapping.sql",
  ),
  "utf8",
);

describe("Tenant management migration", () => {
  it("isolates direct tenant reads and updates to the current tenant", () => {
    expect(migration).toContain("create policy tenants_select_own");
    expect(migration).toContain("create policy tenants_update_own");
    expect(migration).toContain("id = public.current_tenant_id()");
  });

  it("does not grant tenant access to anonymous users", () => {
    expect(migration).toContain(
      "revoke all on table public.tenants from anon",
    );
    expect(migration).not.toContain(
      "grant execute on function public.current_tenant_id() to anon",
    );
  });

  it("creates dedicated tenant administration permissions", () => {
    expect(migration).toContain("tenants.read_all");
    expect(migration).toContain("tenants.create");
    expect(migration).toContain("tenants.update_all");
    expect(migration).toContain("tenants.deactivate");
    expect(migration).toContain("tenants.update_own");
  });

  it("maps legacy administrator roles without creating a new role", () => {
    expect(roleMappingMigration).toContain(
      "position('ADMIN' in normalized_role.identity) > 0",
    );
    expect(roleMappingMigration).toContain(
      "position('SUPER' in normalized_role.identity) > 0",
    );
    expect(roleMappingMigration).toContain("tenants.update_own");
    expect(roleMappingMigration).not.toContain("insert into public.roles");
  });
});
