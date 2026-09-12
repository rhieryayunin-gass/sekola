import { MaturityAssessment } from "../../components/school/growth-public";
export const metadata = { title: "School Digital Maturity Assessment" };
export default async function Page({ searchParams }: { searchParams: Promise<{ ref?: string }> }) { const { ref } = await searchParams; return <MaturityAssessment referralCode={typeof ref === "string" && /^[a-zA-Z0-9-]{4,40}$/.test(ref) ? ref : ""}/>; }
