import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "database/migrations/0015_user_profiles.sql"),
  "utf8",
);

describe("Phase 09 user profile migration", () => {
  it("adds only self-service profile and contact fields", () => {
    for (const column of [
      "avatar_url",
      "phone",
      "emergency_contact_name",
      "emergency_contact_phone",
    ]) {
      expect(migration).toContain(`add column if not exists ${column}`);
    }
  });

  it("requires HTTPS avatar URLs without changing the role catalog", () => {
    expect(migration).toContain("users_avatar_url_https");
    expect(migration).toContain("'^https://'");
    expect(migration).not.toContain("insert into public.roles");
  });
});
