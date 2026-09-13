import Link from "next/link";
import { AttendanceWorkspace } from "../../../components/school/attendance-workspace";
import { ModulePage } from "../../../components/layout/module-page";
export const metadata = { title: "Attendance" };
export default async function Page({ searchParams }: { searchParams: Promise<{ session?: string; code?: string }> }) {
 const p = await searchParams; const scan = typeof p.session === "string" && /^[0-9a-f-]{36}$/i.test(p.session) && typeof p.code === "string" && /^[0-9a-f]{48}$/i.test(p.code) ? { id: p.session, code: p.code } : undefined;
  return <ModulePage name="attendance" title="attendance" description="attendanceDesc"><div className="school-toolbar"><Link className="ose-link" href="/dashboard/attendance/enrollment">Face enrollment →</Link><Link className="ose-link" href="/dashboard/attendance/face">Face attendance →</Link></div><AttendanceWorkspace scan={scan}/></ModulePage>;
}
