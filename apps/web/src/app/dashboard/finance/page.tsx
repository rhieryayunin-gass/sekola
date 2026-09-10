import { FinanceManager } from "../../../components/finance/finance-manager";
import { ModulePage } from "../../../components/layout/module-page";
export const metadata = { title: "Finance" };
export default function Page() {
  return <ModulePage name="finance" title="finance" description="financeDesc"><FinanceManager/></ModulePage>;
}
