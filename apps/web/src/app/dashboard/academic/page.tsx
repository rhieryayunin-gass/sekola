import {FaceEnrollmentLink} from "../../../components/attendance/face-enrollment";
import {AdmissionsLink} from "../../../components/admissions/admissions";
import { FamilyRoute } from "../../../components/school/family-workspace";
import { AcademicManager } from "../../../components/academic/academic-manager";
import { ModulePage } from "../../../components/layout/module-page";
export const metadata = { title: "Academic" };
export default function Page() {
  return <ModulePage name="academic" title="academic" description="academicDesc"><div className="owner-actions"><AdmissionsLink/><FaceEnrollmentLink/></div><FamilyRoute kind="academic"><AcademicManager/></FamilyRoute></ModulePage>;
}
