import { redirect } from "next/navigation";
import { AnalyticsDashboard } from "../../../components/analytics/analytics-dashboard";
import { LogoutButton } from "../../../components/auth/logout-button";
import { ButtonLink } from "../../../components/ui/button";
import { createClient } from "../../../lib/supabase/server";

export const dynamic="force-dynamic";
export const metadata={title:"Executive Analytics | atsekola"};
export default async function AnalyticsPage(){const supabase=await createClient();const {data,error}=await supabase.auth.getClaims();if(error||!data?.claims)redirect("/login");return <main className="mx-auto min-h-screen max-w-[1500px] px-4 py-6 sm:px-8"><header className="glass-panel flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-lg)] p-5"><div><p className="text-sm font-black tracking-tight">atsekola</p><p className="mt-1 text-sm text-muted">Institution intelligence</p></div><div className="flex gap-2"><ButtonLink href="/dashboard" variant="ghost">Dashboard</ButtonLink><LogoutButton/></div></header><AnalyticsDashboard/></main>}
