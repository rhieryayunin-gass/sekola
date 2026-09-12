import { describe,it,expect } from "vitest";
import { occurrences,type SchoolEvent } from "./calendar-occurrences";
const event:SchoolEvent={id:"one",calendar_id:"school",title:"Teacher meeting",description:null,starts_at:"2026-01-31T01:00:00Z",ends_at:"2026-01-31T02:00:00Z",is_all_day:false,event_type:"MEETING",recurrence_rule:"FREQ=MONTHLY;COUNT=3"};
describe("Calendar occurrences",()=>{
 it("respects month-end recurrence instead of shifting a 31st into the next month",()=>{const r=occurrences([event],new Date("2026-01-01"),new Date("2026-06-01"));expect(r.map(x=>x.start.toISOString())).toEqual(["2026-01-31T01:00:00.000Z","2026-03-31T01:00:00.000Z","2026-05-31T01:00:00.000Z"]);});
 it("includes a multi-day event that began before the visible window",()=>{const r=occurrences([{...event,recurrence_rule:null,starts_at:"2026-01-01T00:00:00Z",ends_at:"2026-01-03T00:00:00Z"}],new Date("2026-01-02"),new Date("2026-01-04"));expect(r).toHaveLength(1);expect(r[0].id).toBe("one");});
 it("refuses high-frequency imported rules without freezing the calendar",()=>{const r=occurrences([{...event,recurrence_rule:"FREQ=SECONDLY"}],new Date("2026-01-01"),new Date("2026-06-01"));expect(r).toHaveLength(1);expect(r[0].recurrence_error).toBe(true);});
 it("uses stable occurrence ids while keeping the original id for editing a series",()=>{const r=occurrences([{...event,recurrence_rule:"FREQ=DAILY;COUNT=2"}],new Date("2026-01-01"),new Date("2026-03-01"));expect(new Set(r.map(x=>x.instance)).size).toBe(2);expect(r.every(x=>x.id==="one")).toBe(true);});
});
