import type { MessageKey } from "./i18n";
import type { PermissionContext } from "../stores/permission-store";

export const modules: { key: string; title: MessageKey; detail: MessageKey; href: string; permissions: string[]; mark: string }[] = [
  {key:"academic",title:"academic",detail:"academicDesc",href:"/dashboard/academic",permissions:["academic_years.read","classrooms.read"],mark:"Ac"},
  {key:"people",title:"people",detail:"peopleDesc",href:"/dashboard/people",permissions:["students.read","teachers.read"],mark:"Pe"},
  {key:"learning",title:"learning",detail:"learningDesc",href:"/dashboard/learning",permissions:["courses.read","lessons.read","assignments.read"],mark:"Le"},
  {key:"attendance",title:"attendance",detail:"attendanceDesc",href:"/dashboard/attendance",permissions:["attendance.read","attendance_qr.read"],mark:"At"},
  {key:"exams",title:"exams",detail:"examsDesc",href:"/dashboard/exams",permissions:["exams.read","exam_results.read"],mark:"Ex"},
  {key:"finance",title:"finance",detail:"financeDesc",href:"/dashboard/finance",permissions:["finance_reports.read","billing.read","payments.read"],mark:"Fi"},
  {key:"team",title:"team",detail:"teamDesc",href:"/dashboard/team",permissions:["team_projects.read"],mark:"Te"},
  {key:"operations",title:"operations",detail:"operationsDesc",href:"/dashboard/operations",permissions:["rooms.read","approvals.read","leave_requests.read"],mark:"Op"},
  {key:"analytics",title:"analytics",detail:"analyticsDesc",href:"/dashboard/analytics",permissions:["academic_analytics.read","executive_dashboard.read"],mark:"An"},
  {key:"users",title:"users",detail:"usersDesc",href:"/dashboard/users",permissions:["users.read"],mark:"Us"},
  {key:"tenant",title:"tenantSettings",detail:"tenantDesc",href:"/dashboard/tenant",permissions:["tenants.update_own"],mark:"Co"},
];
export function availableModules(context: PermissionContext | null) {
  return modules.filter(module => (module.key !== "tenant" || context?.roles.some(role => role.code === "OWNER")) && module.permissions.some(code => context?.permissions.some(p => p.code === code)));
}
export function primaryRole(context: PermissionContext | null) {
  return ["OWNER","PRINCIPAL","STAFF","TEACHER","STUDENT","PARENT"].find(role => context?.roles.some(r => r.code === role)) ?? "";
}
