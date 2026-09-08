import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "database/migrations/0016_tenant_settings.sql"), "utf8");

describe("Phase 10 tenant settings migration", () => {
  it("adds school, academic, notification, and locale preferences", () => {
    for (const column of ["legal_name", "academic_year_label", "notifications_email_enabled", "timezone", "locale"]) {
      expect(migration).toContain(`add column if not exists ${column}`);
    }
  });
  it("does not introduce a calendar or localization module", () => {
    expect(migration).not.toContain("create table public.calendars");
    expect(migration).not.toContain("insert into public.roles");
  });
});
