import { redirect } from "next/navigation";
import { LogoutButton } from "../../../components/auth/logout-button";
import { CalendarManager } from "../../../components/calendar/calendar-manager";
import { ButtonLink } from "../../../components/ui/button";
import { createClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendar | atsekola" };

export default async function CalendarPage() {
  const { data, error } = await (await createClient()).auth.getClaims();
  if (error || !data?.claims) redirect("/login");
  return <main className="mx-auto min-h-screen max-w-6xl px-6 py-8 sm:px-10"><header className="glass-panel flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-lg)] p-5"><div><p className="text-sm font-black tracking-tight">atsekola</p><p className="mt-1 text-sm text-muted">Shared calendar</p></div><div className="flex gap-2"><ButtonLink href="/dashboard" variant="ghost">Dashboard</ButtonLink><LogoutButton /></div></header><section className="mt-6"><h1 className="text-4xl font-black tracking-tight">Calendar</h1><p className="mt-2 text-muted">Events, invitations, recurring schedules, and approval-ready planning for your tenant.</p></section><CalendarManager /></main>;
}
