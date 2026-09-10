import { TeamManager } from "../../../components/team/team-manager";
import { ModulePage } from "../../../components/layout/module-page";
export const metadata = { title: "Team" };
export default function Page() {
  return <ModulePage name="team" title="team" description="teamDesc"><TeamManager/></ModulePage>;
}
