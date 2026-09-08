import { redirect } from "next/navigation";
import { LogoutButton } from "../../../components/auth/logout-button";
import { ButtonLink } from "../../../components/ui/button";
import { createClient } from "../../../lib/supabase/server";
import { NotificationCenter } from "../../../components/notifications/notification-center";

export const dynamic = "force-dynamic";
export default async function NotificationsPage() {
  const { data, error } = await (await createClient()).auth.getClaims();
  if (error || !data?.claims) redirect("/login");
  return <main className="mx-auto min-h-screen max-w-4xl px-6 py-8"><header className="glass-panel flex items-center justify-between rounded-[var(--radius-lg)] p-5"><ButtonLink href="/dashboard" variant="ghost">Dashboard</ButtonLink><LogoutButton /></header><section className="mt-6"><h1 className="text-4xl font-black">Notifications</h1><NotificationCenter /></section></main>;
}
