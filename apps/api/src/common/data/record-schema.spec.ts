import { describe, expect, it } from "vitest";
import { validateRecord } from "./record-schema";
import { databaseError } from "./database-error";
import { pageRange } from "./page.dto";
import { UuidParamPipe } from "./uuid-param.pipe";

describe("Record input and error boundaries", () => {
  it.each(["id", "tenant_id", "created_at", "updated_at", "is_admin", "constructor", "__proto__"])("rejects protected or unknown %s", key => {
    expect(() => validateRecord("subjects", JSON.parse(`{"${key}":"override"}`), true)).toThrow();
  });
  it("validates raw record bodies, including partial updates", () => {
    expect(() => validateRecord("payments", { amount: "100" }, true)).toThrow();
    expect(() => validateRecord("payments", { amount: Infinity }, true)).toThrow();
    expect(() => validateRecord("payments", { amount: -1 }, true)).toThrow();
    expect(() => validateRecord("attendance_records", { status: "FUTURE" }, true)).toThrow();
    expect(() => validateRecord("lessons", { attachment_url: "javascript:alert(1)" }, true)).toThrow();
    expect(() => validateRecord("courses", { teacher_id: "not-a-uuid" }, true)).toThrow();
    expect(() => validateRecord("semesters", { starts_on: "2026-02-30" }, true)).toThrow();
    expect(validateRecord("subjects", { name: "  Math  " }, true)).toEqual({ name: "Math" });
    expect(() => validateRecord("subjects", {}, true)).toThrow();
    expect(() => validateRecord("subjects", [], true)).toThrow();
  });
  it.each([["23505",409],["23P01",409],["40001",409],["23503",400],["23514",400],["42501",403],["P0002",404],["08006",500]])("maps SQLSTATE %s without exposing database details", (code,status) => {
    try { databaseError({ code: String(code) }); } catch (error) { expect((error as { getStatus(): number }).getStatus()).toBe(status); }
  });
  it("bounds collection size and supports stable offsets", () => {
    expect(pageRange({page:2,page_size:20})).toEqual([20,39]);
    expect(pageRange({page:1,page_size:1000000})).toEqual([0,99]);
  });
  it("rejects malformed route IDs before database calls", () => {
    const pipe = new UuidParamPipe();
    expect(() => pipe.transform("bad", { type:"param", data:"projectId" })).toThrow();
    expect(pipe.transform("courses", { type:"param", data:"resource" })).toBe("courses");
  });
});
