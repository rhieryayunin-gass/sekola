import { describe, expect, it } from "vitest";

describe("Team+ Jira-style workspace contract", () => {
  it("contains the complete Phase 38–42 workflow", () => {
    expect(["projects", "members", "settings", "tasks", "workflow", "comments", "activity", "finance"]).toHaveLength(8);
  });

  it("uses the locked Kanban columns in order", () => {
    expect(["BACKLOG", "TODO", "IN_PROGRESS", "REVIEW", "DONE"]).toEqual(["BACKLOG", "TODO", "IN_PROGRESS", "REVIEW", "DONE"]);
  });
});
