"use client";
import { useDeferredValue, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Users, GraduationCap, BriefcaseBusiness, MessageCircle } from "lucide-react";
import { connectError, connectRpc, initials, type Contact, type Sources } from "../../lib/connect";
import { useTranslations } from "../i18n/i18n-provider";
import { ConnectDialog } from "./connect-dialog";

export function NewConversation({ canManage, onClose, onCreated, initialKind = "DIRECT" }: { canManage: boolean; onClose: () => void; onCreated: (id: string) => void; initialKind?: string }) {
  const { locale } = useTranslations(); const id = locale === "id-ID";
  const [kind, setKind] = useState(initialKind);
  const [search, setSearch] = useState(""); const deferred = useDeferredValue(search);
  const [selected, setSelected] = useState<Contact[]>([]); const [title, setTitle] = useState("");
  const cache = useQueryClient();
  const contacts = useQuery({ queryKey: ["connect", "contacts", deferred], queryFn: () => connectRpc<Contact[]>("contacts", { search: deferred }), enabled: ["DIRECT", "GROUP"].includes(kind) });
  const sources = useQuery({ queryKey: ["connect", "sources"], queryFn: () => connectRpc<Sources>("sources"), enabled: ["CLASS", "PROJECT"].includes(kind) });
  const create = useMutation({ mutationFn: (args: Record<string, unknown>) => connectRpc<string>("create", args), onSuccess: async (conversation) => { await cache.invalidateQueries({ queryKey: ["connect", "inbox"] }); onCreated(conversation); } });
  function submit(event: FormEvent) { event.preventDefault(); create.mutate({ kind, title, members: selected.map(c => c.id) }); }
  const kinds = [{ code: "DIRECT", label: id ? "Chat baru" : "New chat", icon: MessageCircle }, ...(canManage ? [{ code: "GROUP", label: id ? "Grup" : "Group", icon: Users }] : []), { code: "CLASS", label: id ? "Kelas" : "Classes", icon: GraduationCap }, { code: "PROJECT", label: id ? "Proyek" : "Projects", icon: BriefcaseBusiness }];
  return <ConnectDialog title={id ? "Mulai percakapan" : "Start a conversation"} onClose={onClose}>
    <nav className="oc-tabs" aria-label={id ? "Jenis percakapan" : "Conversation type"}>{kinds.map(k => <button type="button" key={k.code} aria-pressed={kind === k.code} onClick={() => { setKind(k.code); setSelected([]); create.reset(); }}><k.icon size={16}/>{k.label}</button>)}</nav>
    {["DIRECT", "GROUP"].includes(kind) ? <form onSubmit={submit}>
      {kind === "GROUP" && <label className="oc-label">{id ? "Nama grup" : "Group name"}<input className="oc-input" value={title} onChange={e => setTitle(e.target.value)} minLength={2} maxLength={120} required/></label>}
      <label className="oc-search"><Search size={18}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder={id ? "Cari nama di sekolah Anda" : "Search your school directory"} aria-label={id ? "Cari kontak" : "Search contacts"} maxLength={80}/></label>
      {!canManage && <p className="oc-hint">{id ? "Hubungi guru atau staf sekolah Anda di sini." : "Contact a teacher or school staff member here."}</p>}
      {kind === "GROUP" && <div className="oc-selected">{selected.map(c => <button type="button" key={c.id} onClick={() => setSelected(s => s.filter(x => x.id !== c.id))}>{c.full_name} ×</button>)}</div>}
      <div className="oc-contact-list">{contacts.isLoading ? <p>{id ? "Memuat kontak…" : "Loading contacts…"}</p> : contacts.isError ? <p role="alert">{connectError(contacts.error, id)}</p> : contacts.data?.length ? contacts.data.map(c => <button type="button" className="oc-contact" key={c.id} disabled={create.isPending} aria-pressed={selected.some(s => s.id === c.id)} onClick={() => kind === "DIRECT" ? create.mutate({ kind, members: [c.id] }) : setSelected(s => s.some(x => x.id === c.id) ? s.filter(x => x.id !== c.id) : [...s, c])}><span className="oc-avatar">{initials(c.full_name)}</span><span><strong>{c.full_name}</strong><small>{c.is_staff ? (id ? "Guru / staf" : "Teacher / staff") : (id ? "Warga sekolah" : "School member")}</small></span>{kind === "GROUP" && <span aria-hidden="true">{selected.some(s => s.id === c.id) ? "✓" : "+"}</span>}</button>) : <p className="oc-hint">{id ? "Kontak tidak ditemukan. Coba nama lain." : "No contacts found. Try another name."}</p>}</div>
      {kind === "GROUP" && <button className="oc-primary" disabled={create.isPending || !selected.length || selected.length > 99}>{create.isPending ? (id ? "Membuat…" : "Creating…") : (id ? `Buat grup · ${selected.length} anggota` : `Create group · ${selected.length} members`)}</button>}
    </form> : <div className="oc-contact-list">{sources.isLoading ? <p>{id ? "Memuat…" : "Loading…"}</p> : sources.isError ? <p role="alert">{connectError(sources.error, id)}</p> : (kind === "CLASS" ? sources.data?.classes : sources.data?.projects)?.map(source => <button type="button" className="oc-contact" key={source.id} disabled={create.isPending} onClick={() => create.mutate({ kind, source_id: source.id })}><span className="oc-avatar">{kind === "CLASS" ? <GraduationCap size={22}/> : <BriefcaseBusiness size={22}/>}</span><strong>{source.name}</strong></button>)}{!sources.isLoading && !sources.isError && !(kind === "CLASS" ? sources.data?.classes.length : sources.data?.projects.length) && <p className="oc-hint">{id ? "Belum ada kelas atau proyek yang dapat Anda akses." : "No accessible classes or projects yet."}</p>}</div>}
    {create.isError && <p role="alert" className="oc-error">{connectError(create.error, id)}</p>}
  </ConnectDialog>;
}
