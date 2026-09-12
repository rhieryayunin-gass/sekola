import { UserManagement } from "../../../components/users/user-management";
import { ModulePage } from "../../../components/layout/module-page";
import { createClient } from "../../../lib/supabase/server";
import { OwnerRoute } from "../../../components/owner/owner-route";
import { OwnerUsers } from "../../../components/owner/owner-users";
export const metadata={title:"Users"};
export default async function UsersPage(){const {data}=await (await createClient()).auth.getClaims();return <OwnerRoute owner={<OwnerUsers/>}><ModulePage name="users" title="users" description="usersDesc"><UserManagement currentUserId={String(data?.claims?.sub??"")}/></ModulePage></OwnerRoute>;}
