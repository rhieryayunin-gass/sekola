import { describe, expect, it } from "vitest";
import { userLevelFor } from "./user-management";

const baseUser = {
  created_at: "2026-09-02T00:00:00.000Z",
  email: "teacher@example.com",
  full_name: "Teacher",
  id: "00000000-0000-0000-0000-000000000001",
  is_active: true,
  tenant_id: "00000000-0000-0000-0000-000000000002",
  updated_at: "2026-09-02T00:00:00.000Z",
  user_level_id: "00000000-0000-0000-0000-000000000003",
};

describe("UserManagement user-level relationship", () => {
  it("reads the many-to-one relationship returned as an object", () => {
    const level = {
      code: "TEACHER",
      id: baseUser.user_level_id,
      name: "Teacher",
    };

    expect(userLevelFor({ ...baseUser, user_levels: level })).toBe(level);
  });

  it("handles the relationship shape returned as an array", () => {
    const level = {
      code: "STAFF",
      id: baseUser.user_level_id,
      name: "Staff",
    };

    expect(userLevelFor({ ...baseUser, user_levels: [level] })).toBe(level);
  });
});
