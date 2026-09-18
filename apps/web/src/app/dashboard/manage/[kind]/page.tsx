import {notFound} from "next/navigation";
import {PeopleDirectory,SchoolDirectory} from "../../../../components/part9/staff-directory";
import {IdentityWorkspace} from "../../../../components/part9/identity-workspace";
export default async function Page({params}:{params:Promise<{kind:string}>}){const {kind}=await params;if(['students','employees','principals','parents'].includes(kind))return <PeopleDirectory kind={kind}/>;if(kind==='assets'||kind==='classrooms')return <SchoolDirectory kind={kind}/>;if(kind==='identities')return <IdentityWorkspace/>;notFound();}
