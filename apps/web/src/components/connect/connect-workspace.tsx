"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, BellOff, GraduationCap, MessageCircle, MessageCirclePlus, Search, Settings2, ShieldCheck, Wifi, WifiOff, BriefcaseBusiness } from "lucide-react";
import { connectError, connectRpc, fontSizes, initials, type ConnectContext, type Conversation } from "../../lib/connect";
import { useTranslations } from "../i18n/i18n-provider";
import { useConnectContext, useConnectInbox, useConnectRealtime } from "./connect-hooks";
import { ConnectDialog } from "./connect-dialog";
import { NewConversation } from "./new-conversation";
import { ChatThread } from "./chat-thread";

export function ConnectWorkspace() {
  const { locale } = useTranslations(); const id = locale === "id-ID";
  const context = useConnectContext();
  if (context.isLoading) return <div className="oc-loading" role="status">{id ? "Menyiapkan O-Connect…" : "Loading O-Connect…"}</div>;
  if (context.isError || !context.data) return <div className="oc-loading" role="alert"><p>{connectError(context.error, id)}</p><button className="oc-secondary" onClick={() => void context.refetch()}>{id ? "Coba lagi" : "Retry"}</button></div>;
  return <Workspace key={context.data.user_id} context={context.data}/>;
}
function Workspace({ context }: { context: ConnectContext }) {
  const { locale } = useTranslations(); const id = locale === "id-ID";
  const params = useSearchParams(); const router = useRouter(); const cache = useQueryClient();
  const selected = params.get("conversation");
  const [search, setSearch] = useState(""); const [filter, setFilter] = useState("ALL");
  const [creating, setCreating] = useState(false); const [settings, setSettings] = useState(false);
  const inbox = useConnectInbox(); const connected = useConnectRealtime(true);
  const conversations = inbox.data?.pages.flat() ?? [];
  const active = conversations.find(c => c.id === selected);
  const open = (conversation: string) => { router.replace(`/dashboard/connect?conversation=${encodeURIComponent(conversation)}`, { scroll: false }); setCreating(false); };
  const source = useMemo(() => params.get("class") ? { kind: "CLASS", source_id: params.get("class") } : params.get("project") ? { kind: "PROJECT", source_id: params.get("project") } : null, [params]);
  const sourceKey = source ? `${source.kind}:${source.source_id}` : ""; const started = useRef("");
  const openSource = useMutation({ mutationFn: (args: Record<string, unknown>) => connectRpc<string>("create", args), onSuccess: async (conversation) => { await cache.invalidateQueries({ queryKey: ["connect", "inbox"] }); open(conversation); } });
  useEffect(() => {
    if (source && sourceKey !== started.current) { started.current = sourceKey; openSource.mutate(source); }
  }, [sourceKey, source, openSource]);
  const font = useMutation({ mutationFn: (font_size: number) => connectRpc("preferences", { font_size }),
    onSuccess: async () => { await cache.invalidateQueries({ queryKey: ["connect", "context"] }); } });
  const shown = conversations.filter(c => (filter === "ARCHIVED" ? c.archived : !c.archived) && (filter !== "UNREAD" || c.unread_count > 0) && (!["CLASS", "PROJECT"].includes(filter) || c.kind === filter) && c.title.toLocaleLowerCase(locale).includes(search.toLocaleLowerCase(locale)));
  const unread = conversations.reduce((sum, c) => sum + Number(c.unread_count), 0);
  const fallback: Conversation | undefined = selected ? { id: selected, title: "O-Connect", kind: "GROUP", updated_at: "", muted: false, archived: false, is_manager: false, unread_count: 0, preview: null, classroom_id: null, project_id: null } : undefined;
  return <div className="oc-workspace" data-chat-open={!!selected}>
    <aside className="oc-sidebar" aria-label={id ? "Daftar percakapan" : "Conversations"}>
      <header className="oc-sidebar-header"><div><p className="oc-eyebrow">OSEKOLA</p><h1>O-Connect<span className="oc-brand-dot"/></h1></div><button className="oc-icon" type="button" aria-label={id ? "Chat baru" : "New chat"} onClick={() => setCreating(true)}><MessageCirclePlus size={23}/></button><button className="oc-icon" type="button" aria-label={id ? "Pengaturan chat" : "Chat settings"} onClick={() => { font.reset(); setSettings(true); }}><Settings2 size={21}/></button></header>
      <label className="oc-search"><Search size={18}/><input placeholder={id ? "Cari atau mulai percakapan" : "Search or start a conversation"} aria-label={id ? "Cari percakapan" : "Search conversations"} value={search} maxLength={80} onChange={e => setSearch(e.target.value)}/></label>
      <nav className="oc-filters" aria-label={id ? "Filter chat" : "Chat filters"}>{[["ALL", id ? "Semua" : "All"], ["UNREAD", id ? "Belum dibaca" : "Unread"], ["CLASS", id ? "Kelas" : "Classes"], ["PROJECT", id ? "Proyek" : "Projects"], ["ARCHIVED", id ? "Arsip" : "Archived"]].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}{value === "UNREAD" && unread > 0 && <span>{unread}</span>}</button>)}</nav>
      <div className="oc-conversations">{inbox.isLoading ? <p className="oc-hint" role="status">{id ? "Memuat percakapan…" : "Loading conversations…"}</p> : inbox.isError ? <div className="oc-hint" role="alert"><p>{connectError(inbox.error, id)}</p><button onClick={() => void inbox.refetch()}>{id ? "Coba lagi" : "Retry"}</button></div> : shown.length ? shown.map(c => <button type="button" className="oc-conversation" key={c.id} aria-current={selected === c.id ? "true" : undefined} onClick={() => open(c.id)}><span className={`oc-avatar oc-avatar-${c.kind.toLowerCase()}`}>{c.kind === "CLASS" ? <GraduationCap size={24}/> : c.kind === "PROJECT" ? <BriefcaseBusiness size={23}/> : initials(c.title)}</span><span className="oc-conversation-copy"><span><strong>{c.title}</strong><time>{new Date(c.updated_at).toLocaleDateString(locale, { day: "numeric", month: "short" })}</time></span><span><small>{c.preview || (id ? "Buka percakapan" : "Open conversation")}</small>{c.muted && <BellOff size={14}/>} {c.archived && <Archive size={14}/>} {c.unread_count > 0 && <b className="oc-unread" aria-label={`${c.unread_count} ${id ? "pesan belum dibaca" : "unread messages"}`}>{c.unread_count}</b>}</span></span></button>) : <div className="oc-list-empty"><MessageCircle size={35}/><h2>{id ? "Ruang untuk terhubung" : "A space to connect"}</h2><p>{id ? "Mulai chat dengan guru, staf, atau grup sekolah Anda." : "Start a conversation with your teachers, staff, or school group."}</p><button className="oc-secondary" onClick={() => setCreating(true)}>{id ? "Mulai chat" : "Start a chat"}</button></div>}{inbox.hasNextPage && <button className="oc-load-older" disabled={inbox.isFetchingNextPage} onClick={() => void inbox.fetchNextPage()}>{id ? "Muat percakapan lainnya" : "Load more conversations"}</button>}</div>
      <footer className="oc-sidebar-footer">{connected ? <Wifi size={15}/> : <WifiOff size={15}/>}<span role="status">{connected ? (id ? "Terhubung" : "Connected") : (id ? "Sinkronisasi berkala aktif" : "Periodic sync active")}</span><span className="oc-account-name">{context.full_name}</span></footer>
    </aside>
    {selected && (active || fallback) ? <ChatThread key={selected} conversation={(active || fallback)!} context={context} fontSize={context.font_size} onBack={() => router.replace("/dashboard/connect", { scroll: false })}/> : <section className="oc-welcome"><div className="oc-welcome-art"><span/><span/><MessageCircle size={65} strokeWidth={1.25}/></div><p className="oc-eyebrow">O-CONNECT</p><h2>{id ? "Percakapan kecil.\nHubungan yang berarti." : "Small conversations.\nMeaningful connections."}</h2><p>{id ? "Satu ruang komunikasi untuk sekolah Anda.\nPilih chat untuk melanjutkan percakapan." : "One communication space for your school.\nChoose a chat to continue a conversation."}</p><button className="oc-primary" onClick={() => setCreating(true)}><MessageCirclePlus size={18}/>{id ? "Mulai percakapan" : "Start a conversation"}</button><div className="oc-access-note"><ShieldCheck size={16}/>{id ? "Akses mengikuti akun dan keanggotaan sekolah." : "Access follows your school account and membership."}</div></section>}
    {(openSource.isPending || openSource.isError) && <div className="oc-open-status" role={openSource.isError ? "alert" : "status"}>{openSource.isError ? connectError(openSource.error, id) : (id ? "Membuka diskusi…" : "Opening discussion…")}{openSource.isError && source && <button onClick={() => openSource.mutate(source)}>{id ? "Coba lagi" : "Retry"}</button>}</div>}
    {creating && <NewConversation canManage={context.can_manage} onClose={() => setCreating(false)} onCreated={open}/>}
    {settings && <ConnectDialog title={id ? "Pengaturan chat" : "Chat settings"} onClose={() => setSettings(false)}><fieldset><legend>{id ? "Ukuran font chat" : "Chat font size"}</legend><p className="oc-hint">{id ? "Tersimpan untuk akun Anda di seluruh perangkat." : "Saved to your account across devices."}</p><div className="oc-font-options">{fontSizes.map((size, index) => <label key={size}><input type="radio" name="font-size" value={size} checked={context.font_size === size} disabled={font.isPending} onChange={() => font.mutate(size)}/><span style={{ fontSize: size }}>{(id ? ["Kecil", "Sedang", "Besar", "Sangat besar"] : ["Small", "Medium", "Large", "Extra large"])[index]}</span></label>)}</div><div className="oc-font-preview" style={{ fontSize: context.font_size }}>{id ? "Selamat pagi! Siap untuk belajar hari ini? 😊" : "Good morning! Ready to learn today? 😊"}</div></fieldset><p role="status" className="oc-hint">{font.isPending ? (id ? "Menyimpan…" : "Saving…") : font.isSuccess ? (id ? "Ukuran font tersimpan." : "Font size saved.") : ""}</p>{font.isError && <p role="alert" className="oc-error">{connectError(font.error, id)}</p>}</ConnectDialog>}
  </div>;
}
