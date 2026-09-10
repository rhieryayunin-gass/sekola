import { AcademicManager } from "../../../components/academic/academic-manager";
import { ModulePage } from "../../../components/layout/module-page";
export const metadata = { title: "Academic" };
export default function Page() {
  return <ModulePage name="academic" title="academic" description="academicDesc"><AcademicManager/></ModulePage>;
}
