"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { browserApi } from "../../lib/api/browser";
import { useTranslations } from "../i18n/i18n-provider";
import { Button, EmptyState } from "../ui";
type Item = { id: string; title: string; body: string | null; read_at: string | null; created_at: string };
export function NotificationCenter() {
  const { t, locale } = useTranslations();
  const client = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => browserApi<Item[]>("/notifications") });
  const invalidate = async () => {
    await client.invalidateQueries({ queryKey: ["notifications"] });
    await client.invalidateQueries({ queryKey: ["dashboard-notifications"] });
  };
  const read = useMutation({ mutationFn: (id: string) => browserApi("/notifications/" + id + "/read", { method: "PATCH" }), onSuccess: invalidate });
  const all = useMutation({ mutationFn: () => browserApi("/notifications/read-all", { method: "PATCH" }), onSuccess: invalidate });
  const items = q.data?.filter(item => !unreadOnly || !item.read_at) ?? [];
  const pending = read.isPending || all.isPending;
  return <section>
    <div className="ose-notification-toolbar"><div className="flex gap-2">
      <Button variant={unreadOnly ? "ghost" : "secondary"} aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>{t("all")}</Button>
      <Button variant={unreadOnly ? "secondary" : "ghost"} aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>{t("unread")} · {q.data?.filter(n => !n.read_at).length ?? 0}</Button>
    </div><Button variant="ghost" disabled={pending || !q.data?.some(n => !n.read_at)} onClick={() => all.mutate()}>{t("markAllRead")}</Button></div>
    {(read.isError || all.isError) && <p role="alert" className="mb-4 text-danger">{t("loadError")}</p>}
    {q.isLoading ? <p role="status">{t("loading")}</p> : q.isError ? <div className="ose-status glass-panel" role="alert"><p>{t("loadError")}</p><Button onClick={() => void q.refetch()}>{t("retry")}</Button></div> : items.length ? <div className="ose-notification-list">{items.map(item => <article className="ose-notification" data-unread={!item.read_at} key={item.id}>
      <div className="flex items-start justify-between gap-4"><strong>{item.title}</strong>{!item.read_at && <Button size="sm" variant="ghost" disabled={pending} onClick={() => read.mutate(item.id)}>{t("markRead")}</Button>}</div>
      {item.body && <p>{item.body}</p>}<small>{new Date(item.created_at).toLocaleString(locale)}</small>
    </article>)}</div> : <EmptyState title={t("notifications")} description={t("noNotifications")}/>}
  </section>;
}
