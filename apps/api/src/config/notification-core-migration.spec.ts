import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const sql=readFileSync(resolve(process.cwd(),"database/migrations/0018_notification_core.sql"),"utf8");
describe("notification core migration",()=>it("defines tenant-scoped canonical notification types",()=>{for(const type of ["INFO","SUCCESS","WARNING","ACTION_REQUIRED","APPROVAL","REMINDER","SYSTEM"])expect(sql).toContain(type);expect(sql).toContain("notifications_select_self");}));
