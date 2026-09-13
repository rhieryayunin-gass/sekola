import { describe, expect, it } from "vitest";
import { availableModules, modules } from "./modules";
import type { PermissionContext } from "../stores/permission-store";
const roles = ["OWNER", "PRINCIPAL", "STAFF", "TEACHER", "STUDENT", "PARENT"];
function context(role: string): PermissionContext {
 return { userId: "test", roles: [{ id: role, code: role, name: role }], permissions: [...new Set(modules.flatMap(m => m.permissions))].map(code => ({ id: code, code, name: code })) };
}
describe("Part 5 workspaces and scoped family projections", () => {
 it.each(roles)("limits %s despite stale broad grants", role => {
  const visible = availableModules(context(role)).map(m => m.key);
  expect(visible.includes("academic")).toBe(["STAFF", "TEACHER", "STUDENT"].includes(role));
  expect(visible.includes("learning")).toBe(["TEACHER", "STUDENT", "PARENT"].includes(role));
  expect(visible.includes("exams")).toBe(["TEACHER", "STUDENT", "PARENT"].includes(role));
 });
 it("shows the student exam workspace with participation permission only", () => {
  const student = context("STUDENT"); student.permissions = [{ id: "part", name: "Participate", code: "exams.participate" }];
  expect(availableModules(student).map(m => m.key)).toContain("exams");
 });
 it("fails closed while role context is unavailable", () => expect(availableModules(null)).toEqual([]));
});
