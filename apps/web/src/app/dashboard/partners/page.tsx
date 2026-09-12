import { GrowthWorkspace } from "../../../components/school/growth-workspace";
import { OwnerRoute } from "../../../components/owner/owner-route";
import { OwnerPartners } from "../../../components/owner/owner-partners";
export const metadata = { title: "Partner workspace" };
export default function Page() { return <OwnerRoute owner={<OwnerPartners/>}><GrowthWorkspace/></OwnerRoute>; }
