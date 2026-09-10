import { UserManagement } from "../../../components/users/user-management";
import { ModulePage } from "../../../components/layout/module-page";
import { createClient } from "../../../lib/supabase/server";
export const metadata={title:"Users"};
export default async function UsersPage(){const {data}=await (await createClient()).auth.getClaims();return <ModulePage name="users" title="users" description="usersDesc"><UserManagement currentUserId={String(data?.claims?.sub??"")}/></ModulePage>;}
