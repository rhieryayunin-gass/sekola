import { AdmissionPublic } from "../../../components/admissions/admissions";
export default async function Page({params,searchParams}:{params:Promise<{code:string}>;searchParams:Promise<{application?:string}>}){const {code}=await params;const {application}=await searchParams;return <AdmissionPublic code={code} application={application}/>;}
