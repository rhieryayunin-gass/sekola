import { FinanceManager } from "../../../components/finance/finance-manager";
import { ModulePage } from "../../../components/layout/module-page";
import { OwnerRoute } from "../../../components/owner/owner-route";
import { OwnerFinance } from "../../../components/owner/owner-finance";
export const metadata = { title: "Finance" };
export default function Page() {
  return <OwnerRoute owner={<OwnerFinance/>}><ModulePage name="finance" title="finance" description="financeDesc"><FinanceManager/></ModulePage></OwnerRoute>;
}
