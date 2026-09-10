import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = (name: string) => readFileSync(resolve(process.cwd(), `database/migrations/${name}`), "utf8");

describe("Team+ Phase 39–42 migrations", () => {
  it("creates tasks with Jira-style workflow fields", () => {
    const sql = migration("0044_team_tasks.sql");
    expect(sql).toContain("create table public.team_tasks");
    for (const status of ["BACKLOG", "TODO", "IN_PROGRESS", "REVIEW", "DONE"]) expect(sql).toContain(status);
    expect(sql).toContain("assignee_user_id");
    expect(sql).toContain("priority");
    expect(sql).toContain("due_date");
  });

  it("records workflow transitions", () => {
    expect(migration("0045_team_workflow.sql")).toContain("create table public.team_task_transitions");
  });

  it("creates comments and activity", () => {
    const sql = migration("0046_team_collaboration.sql");
    expect(sql).toContain("create table public.team_task_comments");
    expect(sql).toContain("create table public.team_project_activity");
  });

  it("integrates project invoices and payments with Finance+", () => {
    const sql = migration("0047_team_project_finance.sql");
    expect(sql).toContain("references public.finance_categories");
    expect(sql).toContain("references public.finance_accounts");
    expect(sql).toContain("team_project_finance_summary");
  });
});
