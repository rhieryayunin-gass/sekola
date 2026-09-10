import { AnalyticsDashboard } from "../../../components/analytics/analytics-dashboard";
import { ModulePage } from "../../../components/layout/module-page";
export const metadata = { title: "Analytics" };
export default function Page() {
  return <ModulePage name="analytics" title="analytics" description="analyticsDesc"><AnalyticsDashboard/></ModulePage>;
}
