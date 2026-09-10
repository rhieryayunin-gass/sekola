import { AssessmentManager } from "../../../components/assessment/assessment-manager";
import { ModulePage } from "../../../components/layout/module-page";
export const metadata = { title: "Exams" };
export default function Page() {
  return <ModulePage name="exams" title="exams" description="examsDesc"><AssessmentManager mode="exams"/></ModulePage>;
}
