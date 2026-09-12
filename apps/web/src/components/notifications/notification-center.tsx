"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Search, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { browserApi } from "../../lib/api/browser";
import { usePermissionStore } from "../../stores/permission-store";
import { useTranslations } from "../i18n/i18n-provider";
import { Button, EmptyState, Select } from "../ui";
type Item = { id: string; title: string; body: string | null; type: string; read_at: string | null; created_at: string; resource_type?: string; resource_id?: string };
function Detail({ item, close }: { item: Item; close: () => void }) {
 const ref = useRef<HTMLDialogElement>(null); const { locale } = useTranslations(); const id = locale === "id-ID";
 useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
 const links: Record<string, string> = { oconnect: "/dashboard/connect", timetable: "/dashboard/academic", assignments: "/dashboard/learning", student_bills: "/dashboard/finance", approvals: "/dashboard/operations", team_tasks: "/dashboard/team", exam_sessions: "/dashboard/exams" };
 const target = item.resource_type && links[item.resource_type];
 return <dialog ref={ref} className="school-notification-dialog" aria-labelledby="notice-title" onClose={close}><div className="school-section-title"><span className="ose-eyebrow">{item.type.replaceAll("_", " ")}</span><Button variant="ghost" onClick={close} aria-label={id ? "Tutup" : "Close"}><X size={18}/></Button></div><h2 id="notice-title">{item.title}</h2><time>{new Date(item.created_at).toLocaleString(locale)}</time><p>{item.body}</p>{target && <Link className="ose-cta" href={item.resource_type === "oconnect" && item.resource_id ? target + "?conversation=" + encodeURIComponent(item.resource_id) : target} onClick={close}>{id ? "Buka detail" : "Open details"} →</Link>}</dialog>;
}
export function NotificationCenter() {
 const { t, locale } = useTranslations(); const id = locale === "id-ID"; const userId = usePermissionStore(s => s.context?.userId);
 const client = useQueryClient(); const [unreadOnly, setUnreadOnly] = useState(false); const [search, setSearch] = useState(""); const [type, setType] = useState(""); const [selected, setSelected] = useState<Item>();
 const q = useQuery({ queryKey: ["notifications", userId], enabled: !!userId, refetchInterval: 15000, queryFn: () => browserApi<Item[]>("/notifications") });
 const invalidate = async () => { await Promise.all([client.invalidateQueries({ queryKey: ["notifications"] }), client.invalidateQueries({ queryKey: ["dashboard-notifications"] }), client.invalidateQueries({ queryKey: ["notification-badge"] })]); };
 const read = useMutation({ mutationFn: (noticeId: string) => browserApi("/notifications/" + noticeId + "/read", { method: "PATCH" }), onSuccess: invalidate });
 const all = useMutation({ mutationFn: () => browserApi("/notifications/read-all", { method: "PATCH" }), onSuccess: invalidate });
 const items = (q.data ?? []).filter(item => (!unreadOnly || !item.read_at) && (!type || (item.resource_type ?? item.type) === type) && (item.title + " " + (item.body ?? "")).toLowerCase().includes(search.toLowerCase()));
 const groups = Map.groupBy(items, item => new Date(item.created_at).toLocaleDateString(locale, { dateStyle: "long" }));
 return <section className="school-workspace"><div className="school-section-title"><div><p className="ose-eyebrow">YOUR SCHOOL, IN THE LOOP</p><h2>{id ? "Yang perlu Anda ketahui" : "Your school updates"}</h2></div><Button variant="ghost" disabled={all.isPending || !q.data?.some(n => !n.read_at)} onClick={() => all.mutate()}><CheckCheck size={17}/>{t("markAllRead")}</Button></div><div className="school-toolbar"><label className="school-search"><Search size={18}/><input aria-label={id ? "Cari notifikasi" : "Search notifications"} placeholder={id ? "Cari pembaruan…" : "Search updates…"} value={search} onChange={e => setSearch(e.target.value)}/></label><Select aria-label={id ? "Kategori" : "Category"} value={type} onChange={e => setType(e.target.value)}><option value="">{id ? "Semua kategori" : "All categories"}</option>{Array.from(new Set((q.data ?? []).map(n => n.resource_type ?? n.type))).map(v => <option key={v}>{v}</option>)}</Select><Button variant={unreadOnly ? "secondary" : "ghost"} aria-pressed={unreadOnly} onClick={() => setUnreadOnly(v => !v)}>{t("unread")}</Button></div>
 {(read.isError || all.isError) && <p role="alert" className="school-error">{t("loadError")}</p>}
 {q.isLoading ? <p role="status">{t("loading")}</p> : q.isError ? <div role="alert"><p>{t("loadError")}</p><Button onClick={() => void q.refetch()}>{t("retry")}</Button></div> : items.length ? Array.from(groups, ([day, notices]) => <section key={day} className="school-notice-group"><h3>{day}</h3>{notices.map(item => <button key={item.id} className="school-notice-row" data-unread={!item.read_at} onClick={() => { setSelected(item); if (!item.read_at) read.mutate(item.id); }}><span className="school-notice-symbol"><Bell size={18}/></span><span><strong>{item.title}</strong><p>{item.body}</p><small>{new Date(item.created_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</small></span>{!item.read_at && <i aria-label={t("unread")}/>}</button>)}</section>) : <EmptyState title={t("notifications")} description={t("noNotifications")}/>}
 {selected && <Detail key={selected.id} item={selected} close={() => setSelected(undefined)}/>}</section>;
}
