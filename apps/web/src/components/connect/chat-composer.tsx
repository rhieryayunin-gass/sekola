"use client";
import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Paperclip, Send, Smile, X, Link2 } from "lucide-react";
import { createClient } from "../../lib/supabase/client";
import { attachmentTypes, connectError, connectRpc, validateAttachment, type ConnectContext, type ConnectMessage, type ResourceKind, type Source } from "../../lib/connect";
import { useTranslations } from "../i18n/i18n-provider";
import { ConnectDialog } from "./connect-dialog";

export function ChatComposer({ context, conversation, reply, clearReply, fontSize }: { context: ConnectContext; conversation: string; reply: ConnectMessage | null; clearReply: () => void; fontSize: number }) {
  const { locale } = useTranslations(); const id = locale === "id-ID";
  const [body, setBody] = useState(""); const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState(""); const [emoji, setEmoji] = useState(false);
  const [share, setShare] = useState(false); const [resource, setResource] = useState<{ kind: ResourceKind; source: Source } | null>(null);
  const input = useRef<HTMLInputElement>(null); const textarea = useRef<HTMLTextAreaElement>(null);
  const attempt = useRef<{ messageId: string; path?: string } | null>(null);
  const cache = useQueryClient();
  const send = useMutation({ mutationFn: async () => {
    if (!body.trim() && !file && !resource) return;
    attempt.current ??= { messageId: crypto.randomUUID() };
    if (file && !attempt.current.path) {
      const invalid = validateAttachment(file);
      if (invalid) throw new Error("CONNECT_INVALID_ATTACHMENT");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
      const path = `${context.tenant_id}/${conversation}/${context.user_id}/${attempt.current.messageId}-${safeName}`;
      const { error } = await createClient().storage.from("oconnect-attachments").upload(path, file, { contentType: file.type, upsert: false });
      // A retry after an interrupted upload can find the same immutable object.
      if (error && error.message !== "The resource already exists") throw error;
      attempt.current.path = path;
    }
    return connectRpc("send", { conversation, message_id: attempt.current.messageId, body, reply_to: reply?.id ?? null,
      attachment: file ? { path: attempt.current.path, name: file.name.slice(0, 180) } : null,
      resource_type: resource?.kind ?? null, resource_id: resource?.source.id ?? null });
  }, onSuccess: async () => {
    attempt.current = null; setBody(""); setFile(null); setResource(null); clearReply(); setError("");
    if (input.current) input.current.value = "";
    await cache.invalidateQueries({ queryKey: ["connect"] });
    textarea.current?.focus();
  } });
  function submit(event: FormEvent) { event.preventDefault(); setEmoji(false); if (!send.isPending && (body.trim() || file || resource)) send.mutate(); }
  function pickFile(candidate?: File) {
    if (!candidate) return;
    const invalid = validateAttachment(candidate);
    if (invalid) { setError(invalid === "type" ? (id ? "Pilih PNG, JPG, WebP, PDF, atau TXT." : "Choose PNG, JPG, WebP, PDF, or TXT.") : (id ? "Berkas harus berukuran 1 byte–10 MB." : "File size must be 1 byte–10 MB.")); return; }
    setError(""); setFile(candidate); attempt.current = null;
  }
  const locked = send.isPending || send.isError;
  return <form className="oc-composer" onSubmit={submit}>
    {reply && <div className="oc-draft-reference"><div><small>{id ? "Membalas" : "Replying to"} {reply.sender_name}</small><p>{reply.body || reply.attachment_name}</p></div><button disabled={locked} type="button" className="oc-icon" aria-label={id ? "Batalkan balasan" : "Cancel reply"} onClick={clearReply}><X size={18}/></button></div>}
    {(file || resource) && <div className="oc-draft-reference"><span>{file?.name ?? `${resource?.kind} · ${resource?.source.name}`}</span><button disabled={locked} type="button" className="oc-icon" aria-label={id ? "Hapus lampiran draft" : "Remove draft attachment"} onClick={() => { setFile(null); setResource(null); attempt.current = null; }}><X size={18}/></button></div>}
    {(error || send.isError) && <div role="alert" className="oc-error">{error || connectError(send.error, id)}{send.isError && <><span> {id ? "Coba kirim ulang; pesan yang sama tidak akan digandakan." : "Retry sending; the same message will not be duplicated."}</span><button type="submit" disabled={send.isPending}>{id ? "Kirim ulang" : "Retry send"}</button><button type="button" onClick={() => { send.reset(); attempt.current = null; }}>{id ? "Edit draft" : "Edit draft"}</button></>}</div>}
    {emoji && <div className="oc-emoji" aria-label="Emoji">{["😊", "🙏", "👍", "🎉", "📚", "✅", "❤️", "👋"].map(value => <button type="button" key={value} onClick={() => { setBody(b => b + value); setEmoji(false); textarea.current?.focus(); }}>{value}</button>)}</div>}
    <div className="oc-composer-row">
      <button disabled={locked} type="button" className="oc-icon" aria-label="Emoji" aria-expanded={emoji} onClick={() => setEmoji(e => !e)}><Smile size={21}/></button>
      <input ref={input} className="sr-only" type="file" accept={attachmentTypes.join(",")} aria-label={id ? "Pilih lampiran" : "Choose attachment"} tabIndex={-1} onChange={e => pickFile(e.target.files?.[0])}/>
      <button disabled={locked} type="button" className="oc-icon" aria-label={id ? "Lampirkan berkas" : "Attach file"} onClick={() => input.current?.click()}><Paperclip size={21}/></button>
      <button disabled={locked} type="button" className="oc-icon" aria-label={id ? "Bagikan dari modul lain" : "Share from another module"} onClick={() => setShare(true)}><Link2 size={21}/></button>
      <textarea ref={textarea} rows={1} value={body} style={{ fontSize }} maxLength={6000} disabled={locked} aria-label={id ? "Tulis pesan" : "Write a message"} placeholder={id ? "Tulis pesan…" : "Write a message…"} onChange={e => { setBody(e.target.value); attempt.current = null; }} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}/>
      <button className="oc-send" type="submit" disabled={send.isPending || (!body.trim() && !file && !resource)} aria-label={id ? "Kirim pesan" : "Send message"}><Send size={21}/></button>
    </div>
    <small className="oc-composer-hint">{send.isPending ? (id ? "Mengirim…" : "Sending…") : (id ? "Enter untuk kirim · Shift+Enter untuk baris baru · Lampiran maks. 10 MB" : "Enter to send · Shift+Enter for a new line · Attachments up to 10 MB")}</small>
    {share && <ResourcePicker conversation={conversation} onClose={() => setShare(false)} onPick={(kind, source) => { setResource({ kind, source }); setShare(false); }}/>}
  </form>;
}
function ResourcePicker({ conversation, onClose, onPick }: { conversation: string; onClose: () => void; onPick: (kind: ResourceKind, source: Source) => void }) {
  const { locale } = useTranslations(); const id = locale === "id-ID";
  const [kind, setKind] = useState<ResourceKind>("calendar");
  const q = useQuery({ queryKey: ["connect", "resources", conversation, kind], queryFn: () => connectRpc<Source[]>("resources", { conversation, kind }) });
  return <ConnectDialog title={id ? "Bagikan dari OSEKOLA" : "Share from OSEKOLA"} onClose={onClose}>
    <div className="oc-tabs">{(["calendar", "course", "task"] as const).map(value => <button type="button" key={value} aria-pressed={kind === value} onClick={() => setKind(value)}>{value === "calendar" ? (id ? "Kalender" : "Calendar") : value === "course" ? "O-Learning" : "O-Team"}</button>)}</div>
    <p className="oc-hint">{id ? "Penerima tetap memerlukan akses ke sumber yang dibagikan." : "Recipients still need access to the shared source."}</p>
    <div className="oc-contact-list">{q.isLoading ? <p>{id ? "Memuat…" : "Loading…"}</p> : q.isError ? <p role="alert">{connectError(q.error, id)}</p> : q.data?.length ? q.data.map(source => <button type="button" className="oc-contact" key={source.id} onClick={() => onPick(kind, source)}><Link2 size={20}/>{source.name}</button>) : <p>{id ? "Belum ada sumber yang dapat dibagikan." : "No accessible sources to share yet."}</p>}</div>
  </ConnectDialog>;
}
