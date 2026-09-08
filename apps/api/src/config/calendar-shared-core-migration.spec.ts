import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const migration = readFileSync(resolve(process.cwd(), "database/migrations/0017_calendar_shared_core.sql"), "utf8");
describe("Phase 12 shared calendar migration", () => {
  it("keeps calendars tenant-scoped and defines participants and approvals", () => { expect(migration).toContain("add column if not exists tenant_id"); expect(migration).toContain("calendar_event_participants"); expect(migration).toContain("calendar_approvals"); });
  it("supports recurrence and approvals without changing roles", () => { expect(migration).toContain("recurrence_rule"); expect(migration).toContain("requires_approval"); expect(migration).not.toContain("insert into public.roles"); });
});
