import type { Occurrence } from "./calendar-occurrences";
/** Separate concurrent appointments into columns, retaining width for non-overlapping groups. */
export function timedLayout(events: Occurrence[], day: Date) {
  const start = day.getTime(),
    end = new Date(day.getFullYear(), day.getMonth(), day.getDate()+1).getTime();
  const result: { event: Occurrence; lane: number; lanes: number }[] = [];
  let group: typeof result = [],
    ends: number[] = [];
  function flush() {
    for (const item of group) item.lanes = ends.length;
    result.push(...group);
    group = [];
    ends = [];
  }
  for (const event of events
    .filter(
      (e) =>
        !e.is_all_day && e.start.getTime() < end && e.end.getTime() > start,
    )
    .sort((a, b) => a.start.getTime() - b.start.getTime())) {
    const from = Math.max(start, event.start.getTime()),
      to = Math.min(end, Math.max(event.end.getTime(), from + 30 * 60000));
    if (group.length && Math.max(...ends) <= from) flush();
    let lane = ends.findIndex((v) => v <= from);
    if (lane < 0) lane = ends.length;
    ends[lane] = to;
    group.push({ event, lane, lanes: 0 });
  }
  flush();
  return result;
}
