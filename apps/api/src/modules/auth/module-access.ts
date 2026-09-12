/** These are API route segments, never a caller-provided module choice. */
export function moduleForPath(url: string): string | undefined {
  const parts = url.split("?")[0].replace(/^\/api\/v1\//, "/").split("/").filter(Boolean);
  const [route, child] = parts;
  if (route === "users" && child === "me") return;
  if (["academic-years", "semesters", "classrooms", "subjects", "teacher-assignments", "student-assignments"].includes(route)) return "academic";
  if (["users", "teachers", "students", "operations", "calendars", "calendar-events", "audit-logs"].includes(route)) return "core";
  if (["courses", "lessons", "assignments", "submissions"].includes(route)) return "learning";
  if (route?.startsWith("attendance")) return "attendance";
  if (route?.startsWith("exam")) return "exams";
  if (route === "finance") return "finance";
  if (route?.startsWith("team")) return "team";
  if (route === "analytics") return ({ academic: "academic", attendance: "attendance", finance: "finance", executive: "core" } as Record<string, string>)[child];
}
