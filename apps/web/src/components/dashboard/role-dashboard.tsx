"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "../../lib/supabase/client";
import { useAuthStore } from "../../stores/auth-store";
import { usePermissionStore } from "../../stores/permission-store";
import { availableModules, primaryRole } from "../../lib/modules";
import { useTranslations } from "../i18n/i18n-provider";
import { AccessState } from "../layout/module-page";
import type { MessageKey } from "../../lib/i18n";

type Notice = { id: string; title: string; body: string | null; read_at: string | null };
type Calendar = { id: string; name: string };
async function load<T>(path: string) {
  const { data } = await createClient().auth.getSession();
  if (!data.session) throw new Error("Session unavailable");
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "")}${path}`, {headers: {Authorization: `Bearer ${data.session.access_token}`}});
  const payload = await response.json();
  if (!response.ok || payload.data === undefined) throw new Error("Unable to load dashboard");
  return payload.data as T;
}
const descriptions: Record<string, MessageKey> = {OWNER:"ownerIntro",PRINCIPAL:"principalIntro",STAFF:"staffIntro",TEACHER:"teacherIntro",STUDENT:"studentIntro",PARENT:"parentIntro"};
export function RoleDashboard() {
  const { t } = useTranslations();
  const context = usePermissionStore(s => s.context);
  const user = useAuthStore(s => s.user);
  const role = primaryRole(context);
  const accessible = availableModules(context);
  const has = (code: string) => context?.permissions.some(p => p.code === code) ?? false;
  const notices = useQuery({ queryKey:["dashboard-notifications",context?.userId], enabled:has("notifications.read"), queryFn:()=>load<Notice[]>("/notifications") });
  const calendars = useQuery({ queryKey:["dashboard-calendars",context?.userId], enabled:has("calendar.read"), queryFn:()=>load<Calendar[]>("/calendars") });
  if (!context) return <AccessState/>;
  const name = user?.user_metadata.full_name || user?.email?.split("@")[0] || t("account");
  return <section className="ose-dashboard">
    <div className="ose-page-heading"><div><p className="ose-eyebrow">{role || t("account")} / {t("dashboard")}</p><h1>{t("hello")}, {name}.</h1><p>{t(descriptions[role] ?? "workspaceIntro")}</p></div><Link href="/dashboard/profile" className="ose-link">{t("myProfile")} ↗</Link></div>
    <div className="ose-summary-grid"><div className="glass-panel ose-metric"><p>{t("availableModules")}</p><strong>{accessible.length}</strong><span>{t("yourWorkspace")}</span></div><div className="glass-panel ose-metric"><p>{t("notifications")}</p><strong>{notices.isError ? "—" : notices.isLoading ? "…" : notices.data?.filter(n => !n.read_at).length ?? (has("notifications.read") ? 0 : "—")}</strong><span>{t("unread")}</span></div><div className="glass-panel ose-metric"><p>{t("calendar")}</p><strong>{calendars.isError ? "—" : calendars.isLoading ? "…" : calendars.data?.length ?? (has("calendar.read") ? 0 : "—")}</strong><span>{t("sharedCalendars")}</span></div></div>
    <div className="ose-dashboard-grid"><section><div className="ose-section-heading"><h2>{t("yourModules")}</h2></div><div className="ose-workspace-grid">{accessible.map(m=><Link key={m.key} className="ose-workspace-card glass-panel" href={m.href}><span className="ose-mark">{m.mark}</span><h3>{t(m.title)} <span aria-hidden="true">↗</span></h3><p>{t(m.detail)}</p></Link>)}</div>{!accessible.length && <div className="ose-status glass-panel"><p>{t("noModules")}</p></div>}</section><aside className="ose-aside"><section className="glass-panel ose-panel"><div className="ose-panel-heading"><h2>{t("notificationCenter")}</h2>{has("notifications.read") && <Link href="/dashboard/notifications">↗<span className="sr-only">{t("open")}</span></Link>}</div>{notices.isError ? <p role="alert">{t("loadError")}</p> : notices.isLoading ? <p>{t("loading")}</p> : notices.data?.length ? notices.data.slice(0,4).map(n=><Link className="ose-notice-preview" href="/dashboard/notifications" key={n.id}><strong>{n.title}</strong><p>{n.body}</p></Link>) : <p className="text-muted">{t("noNotifications")}</p>}</section><section className="glass-panel ose-panel"><div className="ose-panel-heading"><h2>{t("calendarCenter")}</h2>{has("calendar.read") && <Link href="/dashboard/calendar">↗<span className="sr-only">{t("open")}</span></Link>}</div>{calendars.isError ? <p role="alert">{t("loadError")}</p> : calendars.isLoading ? <p>{t("loading")}</p> : calendars.data?.length ? calendars.data.map(c=><Link className="ose-calendar-link" href="/dashboard/calendar" key={c.id}><span className="ose-brand-dot"/>{c.name}</Link>) : <p className="text-muted">{t("noCalendar")}</p>}</section></aside></div>
  </section>;
}
