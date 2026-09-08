import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "database/migrations/0011_user_management.sql",
  ),
  "utf8",
);

describe("Phase 05 user management migration", () => {
  it("adds a case-insensitive unique email index", () => {
    expect(migration).toContain("users_email_lower_unique_idx");
    expect(migration).toContain("lower(email)");
  });

  it("adds reversible status authorization without creating roles", () => {
    expect(migration).toContain("'users.status'");
    expect(migration).toContain("'users.deactivate'");
    expect(migration).not.toContain("insert into public.roles");
  });

  it("limits direct authenticated reads to the current profile", () => {
    expect(migration).toContain("create policy users_select_self");
    expect(migration).toContain("using (id = auth.uid())");
    expect(migration).toContain(
      "revoke insert, update, delete on table public.users from authenticated",
    );
  });
});
