import { PeopleManager } from "../../../components/people/people-manager";
import { ModulePage } from "../../../components/layout/module-page";
export const metadata = { title: "People" };
export default function Page() {
  return <ModulePage name="people" title="people" description="peopleDesc"><PeopleManager/></ModulePage>;
}
