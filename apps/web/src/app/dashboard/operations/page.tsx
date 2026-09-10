import { OperationsManager } from "../../../components/operations/operations-manager";
import { ModulePage } from "../../../components/layout/module-page";
export const metadata = { title: "Operations" };
export default function Page() {
  return <ModulePage name="operations" title="operations" description="operationsDesc"><OperationsManager/></ModulePage>;
}
