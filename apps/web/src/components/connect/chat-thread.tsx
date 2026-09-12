"use client";
import Image from "next/image";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CheckCheck, Download, Link2, MoreVertical, Reply, Search, Trash2, Users, X } from "lucide-react";
import { connectError, connectRpc, initials, readByOthers, type ConnectContext, type ConnectMember, type ConnectMessage, type Contact, type Conversation } from "../../lib/connect";
import { useTranslations } from "../i18n/i18n-provider";
import { useConnectThread } from "./connect-hooks";
import { ChatComposer } from "./chat-composer";
import { ConnectDialog } from "./connect-dialog";

export function ChatThread({ conversation, context, fontSize, onBack }: { conversation: Conversation; context: ConnectContext; fontSize: number; onBack: () => void }) {
  const { locale } = useTranslations(); const id = locale === "id-ID";
  const [searchOpen, setSearchOpen] = useState(false); const [search, setSearch] = useState(""); const deferred = useDeferredValue(search);
  const [reply, setReply] = useState<ConnectMessage | null>(null); const [info, setInfo] = useState(false);
  const [openedAt] = useState(Date.now);
  const [deleting, setDeleting] = useState<string | null>(null); const [shared, setShared] = useState<string | null>(null);
  const thread = useConnectThread(conversation.id, deferred);
  const cache = useQueryClient();
  const pane = useRef<HTMLDivElement>(null); const end = useRef<HTMLDivElement>(null); const sticky = useRef(true); const lastRead = useRef(0);
  const messages = thread.data?.pages.toReversed().flatMap(p => p.messages) ?? [];
  const members = thread.data?.pages[0]?.members ?? [];
  const latest = thread.data?.pages[0]?.messages.at(-1)?.seq ?? 0;
  const remove = useMutation({ mutationFn: (message: string) => connectRpc("delete_message", { message }), onSuccess: async () => { setDeleting(null); await cache.invalidateQueries({ queryKey: ["connect"] }); } });
  const options = useMutation({ mutationFn: (args: { muted: boolean; archived: boolean }) => connectRpc("options", { conversation: conversation.id, ...args }), onSuccess: async () => { await cache.invalidateQueries({ queryKey: ["connect", "inbox"] }); } });
  useEffect(() => {
    if (sticky.current) end.current?.scrollIntoView({ block: "nearest" });
  }, [latest]);
  useEffect(() => {
    if (!latest || deferred || thread.isError) return;
    const mark = () => {
      if (document.visibilityState !== "visible" || !document.hasFocus() || !sticky.current || lastRead.current >= latest) return;
      lastRead.current = latest;
      void connectRpc("mark_read", { conversation: conversation.id, through_seq: latest }).then(() => {
        void cache.invalidateQueries({ queryKey: ["connect", "inbox"] }); void cache.invalidateQueries({ queryKey: ["notifications"] });
      }).catch(() => { lastRead.current = 0; });
    };
    mark(); window.addEventListener("focus", mark); document.addEventListener("visibilitychange", mark);
    const scroll = pane.current; scroll?.addEventListener("scroll", mark);
    return () => { window.removeEventListener("focus", mark); document.removeEventListener("visibilitychange", mark); scroll?.removeEventListener("scroll", mark); };
  }, [latest, deferred, conversation.id, cache, thread.isError]);
  async function older() {
    const scroll = pane.current; const previous = scroll?.scrollHeight ?? 0;
    await thread.fetchNextPage();
    requestAnimationFrame(() => { if (scroll) scroll.scrollTop += scroll.scrollHeight - previous; });
  }
  return <section className="oc-thread" aria-label={conversation.title}>
    <header className="oc-thread-header"><button type="button" className="oc-icon oc-back" aria-label={id ? "Kembali ke daftar chat" : "Back to chats"} onClick={onBack}><ArrowLeft size={22}/></button><span className="oc-avatar">{initials(conversation.title)}</span><button type="button" className="oc-thread-title" onClick={() => setInfo(true)}><strong>{conversation.title}</strong><small>{members.length} {id ? "anggota · lihat informasi" : "members · view information"}</small></button><button type="button" className="oc-icon" aria-label={id ? "Cari pesan" : "Search messages"} onClick={() => setSearchOpen(s => !s)}><Search size={20}/></button><details className="oc-menu"><summary className="oc-icon" aria-label={id ? "Opsi percakapan" : "Conversation options"}><MoreVertical size={20}/></summary><div><button disabled={options.isPending} onClick={() => options.mutate({ muted: !conversation.muted, archived: conversation.archived })}>{conversation.muted ? (id ? "Aktifkan notifikasi" : "Unmute") : (id ? "Bisukan notifikasi" : "Mute")}</button><button disabled={options.isPending} onClick={() => options.mutate({ muted: conversation.muted, archived: !conversation.archived })}>{conversation.archived ? (id ? "Keluarkan dari arsip" : "Unarchive") : (id ? "Arsipkan chat" : "Archive chat")}</button><button onClick={() => setInfo(true)}>{id ? "Informasi anggota" : "Member information"}</button></div></details></header>
    {options.isError && <p role="alert" className="oc-error">{connectError(options.error, id)}</p>}
    {searchOpen && <label className="oc-search oc-message-search"><Search size={18}/><input aria-label={id ? "Cari dalam percakapan" : "Search conversation"} placeholder={id ? "Cari dalam percakapan…" : "Search this conversation…"} value={search} maxLength={80} onChange={e => setSearch(e.target.value)}/><button type="button" className="oc-icon" aria-label={id ? "Tutup pencarian" : "Close search"} onClick={() => { setSearch(""); setSearchOpen(false); }}><X size={18}/></button></label>}
    <div className="oc-messages" ref={pane} onScroll={e => { const el = e.currentTarget; sticky.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }} style={{ fontSize }}>
      {thread.isLoading ? <p className="oc-thread-note" role="status">{id ? "Memuat pesan…" : "Loading messages…"}</p> : thread.isError ? <div className="oc-thread-note" role="alert"><p>{connectError(thread.error, id)}</p><button className="oc-secondary" onClick={() => void thread.refetch()}>{id ? "Coba lagi" : "Retry"}</button></div> : <>
        {thread.hasNextPage && <button className="oc-load-older" disabled={thread.isFetchingNextPage} onClick={() => void older()}>{id ? "Muat pesan sebelumnya" : "Load earlier messages"}</button>}
        {!messages.length && <p className="oc-thread-note">{deferred ? (id ? "Pesan tidak ditemukan." : "No matching messages.") : (id ? "Mulai percakapan dengan pesan pertama Anda." : "Start this conversation with your first message.")}</p>}
        {messages.map((message, index) => {
          const own = message.sender_id === context.user_id;
          const date = new Date(message.created_at).toLocaleDateString(locale, { dateStyle: "long" });
          const previousDate = index ? new Date(messages[index - 1].created_at).toLocaleDateString(locale, { dateStyle: "long" }) : null;
          return <div key={message.id}>{date !== previousDate && <div className="oc-date">{date}</div>}<article className={`oc-bubble ${own ? "oc-own" : "oc-other"}`} data-message-id={message.id}>
            {!own && <strong className="oc-sender">{message.sender_name}</strong>}
            {message.deleted_at ? <p className="oc-deleted">{id ? "Pesan ini dihapus." : "This message was deleted."}</p> : <>
              {message.reply_to && <blockquote className="oc-reply-preview">{message.reply_body || (id ? "Lampiran atau pesan yang dihapus" : "Attachment or deleted message")}</blockquote>}
              {message.body && <p className="oc-message-body">{message.body}</p>}
              {message.attachment_path && message.attachment_type?.startsWith("image/") && <Image className="oc-message-image" unoptimized src={`/api/connect/attachment?message=${message.id}&view=1`} alt={message.attachment_name ?? (id ? "Gambar terlampir" : "Attached image")} width={360} height={240}/>}
              {message.attachment_path && <a className="oc-file" href={`/api/connect/attachment?message=${message.id}`} target="_blank" rel="noreferrer"><Download size={22}/><span>{message.attachment_name}<small>{Math.ceil((message.attachment_size ?? 0) / 1024)} KB · {id ? "Unduh lampiran" : "Download attachment"}</small></span></a>}
              {message.resource_id && <button className="oc-shared" type="button" onClick={() => setShared(message.id)}><Link2 size={18}/>{message.resource_type === "calendar" ? (id ? "Acara kalender" : "Calendar event") : message.resource_type === "course" ? "O-Learning" : "O-Team"}<span>↗</span></button>}
            </>}
            <footer className="oc-message-meta"><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</time>{own && (readByOthers(message, members) ? <span className="oc-read" aria-label={id ? "Dibaca anggota lain" : "Read by another member"}><CheckCheck size={17}/></span> : <span aria-label={id ? "Terkirim" : "Sent"}><Check size={16}/></span>)}</footer>
            {!message.deleted_at && <div className="oc-message-actions"><button type="button" aria-label={`${id ? "Balas pesan dari" : "Reply to"} ${message.sender_name}`} onClick={() => setReply(message)}><Reply size={15}/></button>{own && openedAt - new Date(message.created_at).getTime() < 86400000 && <button type="button" aria-label={id ? "Hapus pesan" : "Delete message"} onClick={() => { remove.reset(); setDeleting(message.id); }}><Trash2 size={14}/></button>}</div>}
          </article></div>;
        })}<div ref={end}/>
      </>}
    </div>
    {!thread.isError && !thread.isLoading && <ChatComposer context={context} conversation={conversation.id} reply={reply} clearReply={() => setReply(null)} fontSize={fontSize}/>}
    {info && <MemberInfo conversation={conversation} members={members} canManage={context.can_manage} onClose={() => setInfo(false)}/>}
    {deleting && <ConnectDialog title={id ? "Hapus pesan untuk semua anggota?" : "Delete this message for everyone?"} onClose={() => setDeleting(null)}><p className="oc-hint">{id ? "Pesan akan ditandai sebagai dihapus." : "The message will be marked as deleted."}</p>{remove.isError && <p role="alert">{connectError(remove.error, id)}</p>}<button className="oc-primary" disabled={remove.isPending} onClick={() => remove.mutate(deleting)}>{id ? "Hapus pesan" : "Delete message"}</button></ConnectDialog>}
    {shared && <SharedResource message={shared} onClose={() => setShared(null)}/>}
  </section>;
}

function MemberInfo({ conversation, members, canManage, onClose }: { conversation: Conversation; members: ConnectMember[]; canManage: boolean; onClose: () => void }) {
  const { locale } = useTranslations(); const id = locale === "id-ID"; const cache = useQueryClient();
  const [search, setSearch] = useState(""); const deferred = useDeferredValue(search);
  const allow = canManage && conversation.is_manager && conversation.kind === "GROUP";
  const contacts = useQuery({ queryKey: ["connect", "contacts", deferred], queryFn: () => connectRpc<Contact[]>("contacts", { search: deferred }), enabled: allow && !!deferred });
  const update = useMutation({ mutationFn: ({ member, remove }: { member: string; remove: boolean }) => connectRpc("manage_member", { conversation: conversation.id, member, remove }), onSuccess: async () => { setSearch(""); await cache.invalidateQueries({ queryKey: ["connect"] }); } });
  return <ConnectDialog title={id ? "Informasi percakapan" : "Conversation information"} onClose={onClose}>
    <h3>{conversation.title}</h3>{["CLASS", "PROJECT"].includes(conversation.kind) && <p className="oc-hint">{id ? "Anggota mengikuti data kelas atau proyek. Perbarui keanggotaan di modul asal." : "Members follow the class or project roster. Update membership in the source module."}</p>}
    <div className="oc-contact-list">{members.map(m => <div className="oc-contact" key={m.id}><span className="oc-avatar">{initials(m.full_name)}</span><span><strong>{m.full_name}</strong>{m.is_manager && <small>{id ? "Admin grup" : "Group admin"}</small>}</span>{allow && !m.is_manager && <button type="button" className="oc-icon" disabled={update.isPending} aria-label={`${id ? "Keluarkan" : "Remove"} ${m.full_name}`} onClick={() => update.mutate({ member: m.id, remove: true })}><X size={18}/></button>}</div>)}</div>
    {allow && <><label className="oc-search"><Users size={18}/><input placeholder={id ? "Cari untuk menambah anggota…" : "Search to add a member…"} aria-label={id ? "Tambah anggota" : "Add member"} maxLength={80} value={search} onChange={e => setSearch(e.target.value)}/></label>{contacts.isError && <p role="alert">{connectError(contacts.error, id)}</p>}{!!search && contacts.data?.filter(c => !members.some(m => m.id === c.id)).map(c => <button type="button" className="oc-contact" key={c.id} disabled={update.isPending} onClick={() => update.mutate({ member: c.id, remove: false })}>+ {c.full_name}</button>)}</>}
    {update.isError && <p role="alert" className="oc-error">{connectError(update.error, id)}</p>}
  </ConnectDialog>;
}
function SharedResource({ message, onClose }: { message: string; onClose: () => void }) {
  const { locale } = useTranslations(); const id = locale === "id-ID";
  const q = useQuery({ queryKey: ["connect", "resource", message], queryFn: () => connectRpc<{ name: string; description: string | null; href: string; starts_at?: string }>("resource", { message }) });
  return <ConnectDialog title={id ? "Sumber dari OSEKOLA" : "Source from OSEKOLA"} onClose={onClose}>{q.isLoading ? <p>{id ? "Memuat…" : "Loading…"}</p> : q.isError ? <p role="alert">{connectError(q.error, id)}</p> : q.data && <><h3>{q.data.name}</h3><p className="oc-resource-description">{q.data.description}</p>{q.data.starts_at && <p>{new Date(q.data.starts_at).toLocaleString(locale)}</p>}<a className="oc-primary" href={q.data.href}>{id ? "Buka modul" : "Open module"} ↗</a></>}</ConnectDialog>;
}
