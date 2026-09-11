import { TenantProfileForm, type TenantSettings } from "../../../components/tenant/tenant-profile-form";
import { ModulePage } from "../../../components/layout/module-page";
import { apiFetch } from "../../../lib/api/server";
import { createClient } from "../../../lib/supabase/server";
import { notFound } from "next/navigation";
import { FixedMedia } from "../../../components/media/media-uploader";
export const metadata={title:"School settings"};
export default async function TenantPage(){const supabase=await createClient();const {data:context,error}=await supabase.rpc("media_context");if(error || !context?.is_owner || !context?.tenant_id)notFound();const tenant=await apiFetch<TenantSettings>("/tenants/me");return <ModulePage name="tenant" title="tenantSettings" description="tenantDesc"><div className="max-w-2xl"><FixedMedia kind="school"/><section className="glass-panel rounded-3xl p-6"><TenantProfileForm initial={tenant}/></section></div></ModulePage>;}
