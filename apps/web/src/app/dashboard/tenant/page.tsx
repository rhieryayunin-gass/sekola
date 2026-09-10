import { TenantProfileForm, type TenantSettings } from "../../../components/tenant/tenant-profile-form";
import { ModulePage } from "../../../components/layout/module-page";
import { apiFetch } from "../../../lib/api/server";
export const metadata={title:"School settings"};
export default async function TenantPage(){const tenant=await apiFetch<TenantSettings>("/tenants/me");return <ModulePage name="tenant" title="tenantSettings" description="tenantDesc"><section className="glass-panel max-w-2xl rounded-3xl p-6"><TenantProfileForm initial={tenant}/></section></ModulePage>;}
