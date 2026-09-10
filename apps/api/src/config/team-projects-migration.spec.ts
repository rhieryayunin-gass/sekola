import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Phase 38 Team+ Projects migration", () => {
  const sql = readFileSync(resolve(process.cwd(), "database/migrations/0043_team_projects.sql"), "utf8");

  it("creates tenant-scoped projects, members, and settings", () => {
    expect(sql).toContain("create table public.team_projects");
    expect(sql).toContain("create table public.team_project_members");
    expect(sql).toContain("create table public.team_project_settings");
    expect(sql.match(/enable row level security/g)).toHaveLength(3);
  });

  it("registers the Team+ project permission set", () => {
    for (const action of ["read", "create", "update", "delete"]) {
      expect(sql).toContain(`team_projects.${action}`);
    }
  });
});
