import { expect, it } from "vitest";
import { timedLayout } from "./calendar-layout";
import type { Occurrence } from "./calendar-occurrences";
const day = new Date("2026-09-17T00:00:00Z");
const event = (id: string, start: number, end: number) =>
  ({
    id,
    start: new Date(+day + start * 3600000),
    end: new Date(+day + end * 3600000),
    is_all_day: false,
  }) as Occurrence;
it("keeps overlapping meetings legible and restores full width after the cluster", () => {
  const r = timedLayout(
    [event("a", 8, 10), event("b", 9, 11), event("c", 12, 13)],
    day,
  );
  expect(r.map((x) => [x.event.id, x.lane, x.lanes])).toEqual([
    ["a", 0, 2],
    ["b", 1, 2],
    ["c", 0, 1],
  ]);
});
it("reuses a column for a back-to-back appointment within a long meeting", () => {
  const r = timedLayout(
    [event("long", 8, 12), event("a", 9, 10), event("b", 10, 11)],
    day,
  );
  expect(r.map((x) => x.lane)).toEqual([0, 1, 1]);
  expect(r.every((x) => x.lanes === 2)).toBe(true);
});
