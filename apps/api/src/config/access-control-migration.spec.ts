import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "database/migrations/0014_access_control.sql"), "utf8");

describe("access control migration", () => {
  it("defines the four Phase 08 access scopes", () => {
    for (const scope of ["GLOBAL", "TENANT", "MODULE", "RESOURCE"]) {
      expect(migration).toContain(`'${scope}'`);
    }
  });

  it("does not create a new role catalog", () => {
    expect(migration).not.toContain("insert into public.roles");
    expect(migration).toContain("where code = 'OWNER'");
  });
});
