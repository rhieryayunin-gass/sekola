import {AdmissionsLink} from "../../../components/admissions/admissions";
import { FamilyRoute } from "../../../components/school/family-workspace";
import { Suspense } from "react";
import { AssessmentStudio } from "../../../components/part7/assessment-studio";
import { ModulePage } from "../../../components/layout/module-page";
export const metadata = { title: "Exams" };
export default function Page() {
  return <ModulePage name="exams" title="exams" description="examsDesc"><AdmissionsLink/><FamilyRoute kind="exams"><Suspense><AssessmentStudio/></Suspense></FamilyRoute></ModulePage>;
}
