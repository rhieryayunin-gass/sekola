import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const migration=(file:string)=>readFileSync(resolve(process.cwd(),`database/migrations/${file}`),"utf8");

describe("Operations Phase 43-46 migrations",()=>{
  it("creates tenant-isolated room booking and approval records",()=>{const room=migration("0048_room_booking.sql"),approval=migration("0049_approval_engine.sql");expect(room).toContain("create table public.rooms");expect(room).toContain("create table public.room_bookings");expect(room).toContain("calendar_event_id");expect(approval).toContain("create table public.approval_requests");expect(approval).toContain("create table public.approval_steps");expect(approval).toContain("approver_user_id");});
  it("integrates leave and schedule changes with approval and calendar",()=>{for(const file of ["0050_leave_requests.sql","0051_schedule_changes.sql"]){const sql=migration(file);expect(sql).toContain("approval_request_id");expect(sql).toContain("calendar_event_id");expect(sql).toContain("enable row level security");}});
});
