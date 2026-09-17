"use client";
import {useUiText} from "../i18n/ui-text";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, X, Download } from "lucide-react";
import Link from "next/link";
import { moduleRoleAllowed } from "../../lib/modules";
import { browserApi } from "../../lib/api/browser";
import { createClient } from "../../lib/supabase/client";
import { localInput } from "../../lib/calendar-occurrences";
import { rowName, schoolRpc, useCatalog, useSchoolContext, type SchoolRow } from "../../lib/school";
import { usePermissionStore } from "../../stores/permission-store";
import { LibraryResource } from "./library-resource";
import { useTranslations } from "../i18n/i18n-provider";
import { Button, Input, Select } from "../ui";

export type Field = { key: string; label: string; type?: string; options?: string[]; catalog?: string; optional?: boolean; min?: number; max?: number; immutable?: boolean };
export type ResourceSpec = { key: string; title: string; path?: string; permission?: string; fields: Field[]; columns?: string[]; description?: string; curriculum?: boolean };
const catalogKeys: Record<string, string> = { academic_year_id: "academic_years", semester_id: "semesters", classroom_id: "classrooms", subject_id: "subjects", course_id: "courses", lesson_id: "lessons", student_id: "students", teacher_id: "teachers", user_id: "users", parent_user_id: "users", homeroom_teacher_user_id: "users", room_id: "rooms" };

function ChoiceField({ field, value, values, onChange, disabled }: { disabled?: boolean; field: Field; value: string; values: Record<string, string>; onChange: (v: string) => void }) {
 const ui = useUiText();
  const catalog = useCatalog(field.catalog ?? catalogKeys[field.key]);
  const choices = (catalog.data ?? []).filter(row => {
    for (const parent of ["program_id", "stage_id", "curriculum_subject_id", "academic_year_id", "semester_id", "classroom_id", "subject_id", "course_id", "lesson_id"]) {
      if (parent !== field.key && values[parent] && row[parent] && row[parent] !== values[parent]) return false;
    }
    return true;
  });
  if(field.type==="multi")return <div className="p8-electives">{choices.map(row=><label key={row.id}><input type="checkbox" checked={value.split("\n").includes(row.id)} disabled={disabled} onChange={e=>onChange((e.target.checked?[...value.split("\n").filter(Boolean),row.id]:value.split("\n").filter(x=>x!==row.id)).join("\n"))}/>{rowName(row)}</label>)}</div>;
  return <><Select name={field.key} aria-label={ui(field.label)} value={value} onChange={e => onChange(e.target.value)} required={!field.optional} disabled={disabled || catalog.isLoading}><option value="">{catalog.isLoading ? "…" : ui(field.label)}</option>{choices.map(row => <option key={row.id} value={row.id}>{rowName(row)}</option>)}</Select>{catalog.isError && <button type="button" className="ose-link" onClick={() => void catalog.refetch()}>{ui("Muat ulang pilihan")}</button>}</>;
}
export function RecordForm({ spec, row, pending, onSave, onClose, defaults = {}, locked = [] }: { locked?:string[]; defaults?: Record<string, unknown>; spec: ResourceSpec; row?: SchoolRow; pending: boolean; onSave: (payload: Record<string, unknown>) => void; onClose: () => void }) {
 const ui = useUiText();
  const { locale } = useTranslations(); const id = locale === "id-ID";
  const initial = { ...defaults, ...row };
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(spec.fields.map(f => [f.key, initial[f.key] == null ? (f.type === "checkbox" ? String(f.key === "is_active") : "") : f.type === "datetime-local" ? localInput(String(initial[f.key])) : ["lines","multi"].includes(f.type ?? "") && Array.isArray(initial[f.key]) ? (initial[f.key] as string[]).join("\n") : String(initial[f.key])])));
  function change(key: string, value: string) { setValues(old => {
    const next = { ...old, [key]: value };
    const hierarchy = ["program_id", "stage_id", "curriculum_subject_id", "academic_year_id", "semester_id", "classroom_id", "subject_id", "course_id", "lesson_id"];
    const position = hierarchy.indexOf(key);
    if (["program_id","stage_id"].includes(key) && "subject_ids" in next) next.subject_ids="";
    if (position >= 0) for (const child of hierarchy.slice(position + 1)) if (child in next) next[child] = "";
    return next;
  }); }
  function submit(event: FormEvent) { event.preventDefault(); const payload: Record<string, unknown> = {};
    for (const field of spec.fields) {
      const value = values[field.key];
      if (!value && field.optional) { if (["lines","multi"].includes(field.type ?? "")) { payload[field.key] = []; continue; } if (row) payload[field.key] = null; continue; }
      payload[field.key] = ["lines","multi"].includes(field.type ?? "") ? value.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : field.type === "number" ? Number(value) : field.type === "checkbox" ? value === "true" : field.type === "datetime-local" && value ? new Date(value).toISOString() : value.trim();
    }
    onSave(payload);
  }
  return <form className="school-editor" onSubmit={submit}><div className="school-section-title"><h2>{row ? (id ? "Edit" : "Edit") : (id ? "Tambah" : "Add")} {ui(spec.title)}</h2><Button type="button" variant="ghost" onClick={onClose} aria-label={id ? ui("Tutup") : "Close"}><X size={18}/></Button></div>{spec.fields.map(field => {const Tag=field.type==="multi"?"fieldset":"label";return <Tag className="school-field" key={field.key}><span>{ui(field.label)}{!field.optional && " *"}</span>{field.catalog || catalogKeys[field.key] ? <ChoiceField disabled={(!!row && field.immutable)||locked.includes(field.key)} field={field} value={values[field.key] ?? ""} values={values} onChange={v => change(field.key, v)}/> : field.options ? <Select disabled={(!!row && field.immutable)||locked.includes(field.key)} name={field.key} value={values[field.key] ?? ""} required={!field.optional} onChange={e => change(field.key, e.target.value)}><option value="">{id ? "Pilih" : "Choose"}</option>{field.options.map(o => <option key={o} value={o}>{o.replaceAll("_", " ")}</option>)}</Select> : ["textarea", "lines"].includes(field.type ?? "") ? <textarea name={field.key} value={values[field.key]} rows={4} required={!field.optional} maxLength={10000} onChange={e => change(field.key, e.target.value)}/> : field.type === "checkbox" ? <input name={field.key} type="checkbox" checked={values[field.key] === "true"} onChange={e => change(field.key, String(e.target.checked))}/> : <Input disabled={(!!row && field.immutable)||locked.includes(field.key)} name={field.key} type={field.type ?? "text"} value={values[field.key]} required={!field.optional} min={field.min} max={field.max} onChange={e => change(field.key, e.target.value)}/>}</Tag>;})}{spec.key==="school_curriculum_enrollments"&&<div className="p8-register-intro p8-full"><strong>{id?"Tinjau perubahan keikutsertaan":"Review participation changes"}</strong><p>{values.student_id?(id?"Berlaku untuk siswa yang dipilih.":"Applies to the selected student."):(id?"Berlaku untuk seluruh kelas yang dipilih.":"Applies to the entire selected class.")} {values.participation==="EXCLUDE"?(id?"Pengecualian siswa mengesampingkan aturan kelas.":"The student exclusion overrides class enrolment."):""}</p><p>{id?"Riwayat hasil tetap tersimpan. Perubahan program tidak membuat tugas, catatan kehadiran atau tagihan baru. Guru dapat menyesuaikan peserta kegiatan setelah meninjau perubahan ini.":"Historical results are preserved. Programme changes do not create assignments, attendance records or invoices. Teachers can adjust activity participants after reviewing this change."}</p><label><input required type="checkbox"/> {id?"Saya sudah memeriksa peserta, mapel, dan tanggal berlakunya.":"I have checked the participants, subjects and effective dates."}</label></div>}<Button type="submit" disabled={pending}>{pending ? "…" : id ? ui("Simpan") : "Save"}</Button></form>;
}
export function RecordWorkspace({ specs, initial, report = false, programId }: { specs: ResourceSpec[]; initial?: string; report?: boolean; programId?: string }) {
 const ui = useUiText();
 const has=usePermissionStore(s=>s.has);const school=useSchoolContext();
 const allowed=specs.filter(s=>s.permission?has(`${s.permission}.read`):s.key!=="school_alumni"||school.data?.staff);
 if(!allowed.length)return <p className="school-empty">{ui("Tidak ada data yang tersedia untuk peran Anda.")}</p>;
 return <RecordWorkspaceContent key={allowed.map(s=>s.key).join("-")} specs={allowed} initial={initial} report={report} programId={programId}/>;
}
function RecordWorkspaceContent({ specs, initial, report = false, programId }: { specs: ResourceSpec[]; initial?: string; report?: boolean; programId?: string }) {
 const ui = useUiText();
  const { locale } = useTranslations(); const id = locale === "id-ID";
  const userId = usePermissionStore(s => s.context?.userId); const has = usePermissionStore(s => s.has);
  const context = useSchoolContext(); const qc = useQueryClient();
  const [active, setActive] = useState(initial ?? specs[0].key); const [search, setSearch] = useState(""); const [status, setStatus] = useState(""); const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<SchoolRow | "new" | null>(null);
  const spec = specs.find(s => s.key === active) ?? specs[0];
  const pageSize = spec.curriculum ? 500 : 50;
  const records = useQuery({ queryKey: ["school-records", userId, spec.key, page, programId], enabled: !!userId, queryFn: async () => {
    if (spec.curriculum) return schoolRpc<SchoolRow[]>("school_curriculum_list", { resource: spec.key.replace("school_curriculum_", ""), page_offset: page * pageSize, program_uuid: spec.key === "school_curriculum_programs" ? null : programId || null });
    if (spec.path) return browserApi<SchoolRow[]>(`${spec.path}?page=${page + 1}&page_size=50`);
    const { data, error } = await createClient().from(spec.key).select("*").order("created_at", { ascending: false }).range(page * 50, page * 50 + 49);
    if (error) throw new Error(error.message); return data as SchoolRow[];
  } });
  const save = useMutation({ mutationFn: (payload: Record<string, unknown>) => spec.curriculum ? schoolRpc("school_curriculum_save", { resource: spec.key.replace("school_curriculum_", ""), payload, record_id: editing && editing !== "new" ? editing.id : null }) : spec.path ? browserApi(`${spec.path}${editing && editing !== "new" ? `/${editing.id}` : ""}`, { method: editing === "new" ? "POST" : "PATCH", body: JSON.stringify(payload) }) : schoolRpc("school_save", { resource: spec.key, payload, record_id: editing && editing !== "new" ? editing.id : null }), onSuccess: async () => { setEditing(null); await Promise.all([qc.invalidateQueries({ queryKey: ["school-records"] }), qc.invalidateQueries({ queryKey: ["school-catalog"] }), qc.invalidateQueries({ queryKey: ["notifications"] })]); } });
  const canCreate = spec.curriculum ? true : spec.permission ? has(`${spec.permission}.create`) : context.data?.staff || (spec.key === "school_library" && context.data?.educator);
  const canEdit = spec.permission ? has(`${spec.permission}.update`) : canCreate;
  const rows = (records.data ?? []).filter(row => (!status || row.status === status || row.enrollment_status === status) && JSON.stringify(row).toLowerCase().includes(search.toLowerCase()));
  const money = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  return <section className="school-workspace"><div className="school-tabs" role="tablist" aria-label={id ? "Bagian modul" : "Module sections"}>{specs.map(s => <button key={s.key} type="button" role="tab" aria-selected={s.key === spec.key} onClick={() => { setActive(s.key); setPage(0); setEditing(null); setSearch(""); setStatus(""); save.reset(); }}>{ui(s.title)}</button>)}</div><div className="school-section-title"><div><h2>{ui(spec.title)}</h2><p>{(spec.description ? ui(spec.description) : null) ?? (id ? "Semua data terhubung dengan sekolah Anda." : "Connected records for your school.")}</p></div>{canCreate && <Button onClick={() => { setEditing("new"); save.reset(); }}><Plus size={16}/>{id ? "Tambah" : "Add"}</Button>}</div><div className="school-toolbar"><label className="school-search"><Search size={18}/><input aria-label={id ? "Cari data" : "Search records"} value={search} onChange={e => setSearch(e.target.value)} placeholder={id ? "Cari nama, nomor, atau keterangan…" : "Search name, number or description…"}/></label><Select aria-label={ui("Status")} value={status} onChange={e => setStatus(e.target.value)}><option value="">{id ? ui("Semua status") : "All statuses"}</option>{Array.from(new Set((records.data ?? []).map(r => String(r.status ?? r.enrollment_status ?? "")).filter(Boolean))).map(s => <option key={s}>{s}</option>)}</Select>{report && <Button variant="ghost" onClick={() => window.print()}><Download size={16}/>PDF</Button>}</div>{report && <div className="school-stat-strip"><div><small>{id ? "Data pada halaman" : "Records on page"}</small><strong>{rows.length}</strong></div><div><small>{id ? "Total hasil filter pada halaman" : "Filtered page total"}</small><strong>{new Intl.NumberFormat(locale, { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(money)}</strong></div></div>}
    <div className={`school-content ${editing ? "school-content-editing" : ""}`}><div>{records.isLoading ? <p role="status">{id ? ui("Memuat…") : "Loading…"}</p> : records.isError ? <div role="alert"><p>{records.error.message}</p><Button onClick={() => void records.refetch()}>{id ? ui("Coba lagi") : "Retry"}</Button></div> : rows.length ? <div className="school-record-list">{rows.map(row => <article className="school-record" key={row.id}><div className="school-record-monogram">{rowName(row).slice(0, 1)}</div><div className="school-record-main"><strong>{rowName(row)}</strong><div className="school-record-meta">{(spec.columns ?? spec.fields.map(f => f.key).filter(k => !k.endsWith("_id"))).slice(0, 5).map(key => row[key] != null && <span key={key}>{key === "amount" ? new Intl.NumberFormat(locale, { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(row[key])) : String(row[key])}</span>)}</div>{spec.key === "school_library" && <LibraryResource row={row}/>}</div>{canEdit && <Button variant="ghost" aria-label={`${id ? "Edit" : "Edit"} ${rowName(row)}`} onClick={() => { setEditing(row); save.reset(); }}><Pencil size={16}/></Button>}</article>)}</div> : <div className="school-empty"><h3>{search ? (id ? "Tidak ada hasil" : "No results") : (id ? ui("Belum ada data") : "No records yet")}</h3><p>{id ? "Tambahkan data pertama atau ubah pencarian Anda." : "Add your first record or adjust your search."}</p></div>}<div className="school-pagination"><Button variant="ghost" disabled={!page || records.isFetching} onClick={() => setPage(p => p - 1)}>←</Button><span>{id ? ui("Halaman") : "Page"} {page + 1}</span><Button variant="ghost" disabled={(records.data?.length ?? 0) < pageSize || records.isFetching} onClick={() => setPage(p => p + 1)}>→</Button></div></div>{editing && <aside>{save.isError && <p className="school-error" role="alert">{save.error.message}</p>}<RecordForm defaults={programId ? { program_id: programId } : undefined} key={`${spec.key}-${editing === "new" ? "new" : editing.id}`} spec={spec} row={editing === "new" ? undefined : editing} pending={save.isPending} onSave={payload => save.mutate(payload)} onClose={() => setEditing(null)}/></aside>}</div></section>;
}
export function SchoolHierarchy() {
 const ui = useUiText(); const context = usePermissionStore(s => s.context); return <nav className="school-hierarchy" aria-label="School hierarchy">{[["OSEKOLA", "/dashboard"], ["Tenant", "/dashboard/core"], ["Academic year", "/dashboard/academic"], [ui("Semester"), "/dashboard/academic"], ["Classroom", "/dashboard/academic"], ["Subject", "/dashboard/academic"], ["Courses", "/dashboard/learning"], ["Lessons", "/dashboard/learning"], ["Assignment", "/dashboard/learning"], ["Submission", "/dashboard/learning"]].filter(([, href]) => (href !== "/dashboard/academic" || moduleRoleAllowed("academic", context)) && (href !== "/dashboard/learning" || moduleRoleAllowed("learning", context))).map(([label, href]) => <Link key={label} href={href}>{ui(label)}<span>›</span></Link>)}</nav>; }
