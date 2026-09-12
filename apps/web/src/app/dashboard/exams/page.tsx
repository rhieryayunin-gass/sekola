import { ExamWorkspace } from "../../../components/school/exam-workspace";
import { ModulePage } from "../../../components/layout/module-page";
export const metadata = { title: "Exams" };
export default function Page() {
  return <ModulePage name="exams" title="exams" description="examsDesc"><ExamWorkspace/></ModulePage>;
}
