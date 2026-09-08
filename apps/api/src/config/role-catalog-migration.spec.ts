import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "database/migrations/0012_role_catalog.sql",
  ),
  "utf8",
);

const roleCodes = [
  "OWNER",
  "PRINCIPAL",
  "STAFF",
  "TEACHER",
  "STUDENT",
  "PARENT",
] as const;

describe("role catalog migration", () => {
  it("defines the six locked atsekola roles", () => {
    for (const roleCode of roleCodes) {
      expect(migration).toContain(`('${roleCode}',`);
    }
  });

  it("preserves existing authorization records", () => {
    expect(migration).toContain("on conflict (code) do update");
    expect(migration).not.toContain("delete from public.roles");
    expect(migration).not.toContain("truncate public.roles");
  });

  it("does not pull later permission or access-scope work forward", () => {
    expect(migration).not.toContain("public.role_permissions");
    expect(migration).not.toContain("public.user_roles");
    expect(migration).not.toContain("access_scope");
  });
});
