import { AssessmentManager } from "../../../components/assessment/assessment-manager";
import { ModulePage } from "../../../components/layout/module-page";
export const metadata = { title: "Attendance" };
export default function Page() {
  return <ModulePage name="attendance" title="attendance" description="attendanceDesc"><AssessmentManager mode="attendance"/></ModulePage>;
}
