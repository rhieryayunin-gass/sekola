import { ProfileForm, type Profile } from "../../../components/profile/profile-form";
import { ModulePage } from "../../../components/layout/module-page";
import { createClient } from "../../../lib/supabase/server";
export const metadata={title:"Profile"};
export default async function ProfilePage(){const supabase=await createClient();const {data}=await supabase.auth.getClaims();if(!data?.claims)return null;const userId = typeof data.claims.sub === "string" ? data.claims.sub : ""; const { data: profile } = await supabase.from("users").select("full_name, avatar_url, phone, emergency_contact_name, emergency_contact_phone").eq("id", userId).single(); const initial: Profile = profile ?? { full_name: null, avatar_url: null, phone: null, emergency_contact_name: null, emergency_contact_phone: null }; return <ModulePage title="myProfile" description="profileDesc"><section className="glass-panel max-w-2xl rounded-3xl p-6"><ProfileForm initial={initial}/></section></ModulePage>;}
