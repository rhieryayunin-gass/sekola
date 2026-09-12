"use client";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, X, Download } from "lucide-react";
import Link from "next/link";
import { browserApi } from "../../lib/api/browser";
import { createClient } from "../../lib/supabase/client";
import { localInput } from "../../lib/calendar-occurrences";
import { rowName, schoolRpc, useCatalog, useSchoolContext, type SchoolRow } from "../../lib/school";
import { usePermissionStore } from "../../stores/permission-store";
import { LibraryResource } from "./library-resource";
import { useTranslations } from "../i18n/i18n-provider";
import { Button, Input, Select } from "../ui";

export type Field = { key: string; label: string; type?: string; options?: string[]; catalog?: string; optional?: boolean; min?: number; max?: number };
export type ResourceSpec = { key: string; title: string; path?: string; permission?: string; fields: Field[]; columns?: string[]; description?: string };
const catalogKeys: Record<string, string> = { academic_year_id: "academic_years", semester_id: "semesters", classroom_id: "classrooms", subject_id: "subjects", course_id: "courses", lesson_id: "lessons", student_id: "students", teacher_id: "teachers", user_id: "users", parent_user_id: "users", homeroom_teacher_user_id: "users", room_id: "rooms" };

function ChoiceField({ field, value, values, onChange }: { field: Field; value: string; values: Record<string, string>; onChange: (v: string) => void }) {
  const catalog = useCatalog(field.catalog ?? catalogKeys[field.key]);
  const choices = (catalog.data ?? []).filter(row => {
    for (const parent of ["academic_year_id", "semester_id", "classroom_id", "subject_id", "course_id", "lesson_id"]) {
      if (parent !== field.key && values[parent] && row[parent] && row[parent] !== values[parent]) return false;
    }
    return true;
  });
  return <><Select name={field.key} aria-label={field.label} value={value} onChange={e => onChange(e.target.value)} required={!field.optional} disabled={catalog.isLoading}><option value="">{catalog.isLoading ? "…" : field.label}</option>{choices.map(row => <option key={row.id} value={row.id}>{rowName(row)}</option>)}</Select>{catalog.isError && <button type="button" className="ose-link" onClick={() => void catalog.refetch()}>Muat ulang pilihan</button>}</>;
}
export function RecordForm({ spec, row, pending, onSave, onClose }: { spec: ResourceSpec; row?: SchoolRow; pending: boolean; onSave: (payload: Record<string, unknown>) => void; onClose: () => void }) {
  const { locale } = useTranslations(); const id = locale === "id-ID";
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(spec.fields.map(f => [f.key, row?.[f.key] == null ? (f.type === "checkbox" ? String(f.key === "is_active") : "") : f.type === "datetime-local" ? localInput(String(row[f.key])) : String(row[f.key])])));
  function change(key: string, value: string) { setValues(old => {
    const next = { ...old, [key]: value };
    const hierarchy = ["academic_year_id", "semester_id", "classroom_id", "subject_id", "course_id", "lesson_id"];
    const position = hierarchy.indexOf(key);
    if (position >= 0) for (const child of hierarchy.slice(position + 1)) if (child in next) next[child] = "";
    return next;
  }); }
  function submit(event: FormEvent) { event.preventDefault(); const payload: Record<string, unknown> = {};
    for (const field of spec.fields) {
      const value = values[field.key];
      if (!value && field.optional) { if (row) payload[field.key] = null; continue; }
      payload[field.key] = field.type === "number" ? Number(value) : field.type === "checkbox" ? value === "true" : field.type === "datetime-local" && value ? new Date(value).toISOString() : value.trim();
    }
    onSave(payload);
  }
  return <form className="school-editor" onSubmit={submit}><div className="school-section-title"><h2>{row ? (id ? "Edit" : "Edit") : (id ? "Tambah" : "Add")} {spec.title}</h2><Button type="button" variant="ghost" onClick={onClose} aria-label={id ? "Tutup" : "Close"}><X size={18}/></Button></div>{spec.fields.map(field => <label className="school-field" key={field.key}><span>{field.label}{!field.optional && " *"}</span>{field.catalog || catalogKeys[field.key] ? <ChoiceField field={field} value={values[field.key] ?? ""} values={values} onChange={v => change(field.key, v)}/> : field.options ? <Select name={field.key} value={values[field.key] ?? ""} required={!field.optional} onChange={e => change(field.key, e.target.value)}><option value="">{id ? "Pilih" : "Choose"}</option>{field.options.map(o => <option key={o} value={o}>{o.replaceAll("_", " ")}</option>)}</Select> : field.type === "textarea" ? <textarea name={field.key} value={values[field.key]} rows={4} required={!field.optional} maxLength={10000} onChange={e => change(field.key, e.target.value)}/> : field.type === "checkbox" ? <input name={field.key} type="checkbox" checked={values[field.key] === "true"} onChange={e => change(field.key, String(e.target.checked))}/> : <Input name={field.key} type={field.type ?? "text"} value={values[field.key]} required={!field.optional} min={field.min} max={field.max} onChange={e => change(field.key, e.target.value)}/>}</label>)}<Button type="submit" disabled={pending}>{pending ? "…" : id ? "Simpan" : "Save"}</Button></form>;
}
export function RecordWorkspace({ specs, initial, report = false }: { specs: ResourceSpec[]; initial?: string; report?: boolean }) {
 const has=usePermissionStore(s=>s.has);const school=useSchoolContext();
 const allowed=specs.filter(s=>s.permission?has(`${s.permission}.read`):s.key!=="school_alumni"||school.data?.staff);
 if(!allowed.length)return <p className="school-empty">Tidak ada data yang tersedia untuk peran Anda.</p>;
 return <RecordWorkspaceContent key={allowed.map(s=>s.key).join("-")} specs={allowed} initial={initial} report={report}/>;
}
function RecordWorkspaceContent({ specs, initial, report = false }: { specs: ResourceSpec[]; initial?: string; report?: boolean }) {
  const { locale } = useTranslations(); const id = locale === "id-ID";
  const userId = usePermissionStore(s => s.context?.userId); const has = usePermissionStore(s => s.has);
  const context = useSchoolContext(); const qc = useQueryClient();
  const [active, setActive] = useState(initial ?? specs[0].key); const [search, setSearch] = useState(""); const [status, setStatus] = useState(""); const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<SchoolRow | "new" | null>(null);
  const spec = specs.find(s => s.key === active) ?? specs[0];
  const records = useQuery({ queryKey: ["school-records", userId, spec.key, page], enabled: !!userId, queryFn: async () => {
    if (spec.path) return browserApi<SchoolRow[]>(`${spec.path}?page=${page + 1}&page_size=50`);
    const { data, error } = await createClient().from(spec.key).select("*").order("created_at", { ascending: false }).range(page * 50, page * 50 + 49);
    if (error) throw new Error(error.message); return data as SchoolRow[];
  } });
  const save = useMutation({ mutationFn: (payload: Record<string, unknown>) => spec.path ? browserApi(`${spec.path}${editing && editing !== "new" ? `/${editing.id}` : ""}`, { method: editing === "new" ? "POST" : "PATCH", body: JSON.stringify(payload) }) : schoolRpc("school_save", { resource: spec.key, payload, record_id: editing && editing !== "new" ? editing.id : null }), onSuccess: async () => { setEditing(null); await Promise.all([qc.invalidateQueries({ queryKey: ["school-records"] }), qc.invalidateQueries({ queryKey: ["school-catalog"] }), qc.invalidateQueries({ queryKey: ["notifications"] })]); } });
  const canCreate = spec.permission ? has(`${spec.permission}.create`) : context.data?.staff || (spec.key === "school_library" && context.data?.educator);
  const canEdit = spec.permission ? has(`${spec.permission}.update`) : canCreate;
  const rows = (records.data ?? []).filter(row => (!status || row.status === status || row.enrollment_status === status) && JSON.stringify(row).toLowerCase().includes(search.toLowerCase()));
  const money = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  return <section className="school-workspace"><div className="school-tabs" role="tablist" aria-label={id ? "Bagian modul" : "Module sections"}>{specs.map(s => <button key={s.key} type="button" role="tab" aria-selected={s.key === spec.key} onClick={() => { setActive(s.key); setPage(0); setEditing(null); setSearch(""); setStatus(""); save.reset(); }}>{s.title}</button>)}</div><div className="school-section-title"><div><h2>{spec.title}</h2><p>{spec.description ?? (id ? "Semua data terhubung dengan sekolah Anda." : "Connected records for your school.")}</p></div>{canCreate && <Button onClick={() => { setEditing("new"); save.reset(); }}><Plus size={16}/>{id ? "Tambah" : "Add"}</Button>}</div><div className="school-toolbar"><label className="school-search"><Search size={18}/><input aria-label={id ? "Cari data" : "Search records"} value={search} onChange={e => setSearch(e.target.value)} placeholder={id ? "Cari nama, nomor, atau keterangan…" : "Search name, number or description…"}/></label><Select aria-label="Status" value={status} onChange={e => setStatus(e.target.value)}><option value="">{id ? "Semua status" : "All statuses"}</option>{Array.from(new Set((records.data ?? []).map(r => String(r.status ?? r.enrollment_status ?? "")).filter(Boolean))).map(s => <option key={s}>{s}</option>)}</Select>{report && <Button variant="ghost" onClick={() => window.print()}><Download size={16}/>PDF</Button>}</div>{report && <div className="school-stat-strip"><div><small>{id ? "Data pada halaman" : "Records on page"}</small><strong>{rows.length}</strong></div><div><small>{id ? "Total hasil filter pada halaman" : "Filtered page total"}</small><strong>{new Intl.NumberFormat(locale, { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(money)}</strong></div></div>}
    <div className={`school-content ${editing ? "school-content-editing" : ""}`}><div>{records.isLoading ? <p role="status">{id ? "Memuat…" : "Loading…"}</p> : records.isError ? <div role="alert"><p>{records.error.message}</p><Button onClick={() => void records.refetch()}>{id ? "Coba lagi" : "Retry"}</Button></div> : rows.length ? <div className="school-record-list">{rows.map(row => <article className="school-record" key={row.id}><div className="school-record-monogram">{rowName(row).slice(0, 1)}</div><div className="school-record-main"><strong>{rowName(row)}</strong><div className="school-record-meta">{(spec.columns ?? spec.fields.map(f => f.key).filter(k => !k.endsWith("_id"))).slice(0, 5).map(key => row[key] != null && <span key={key}>{key === "amount" ? new Intl.NumberFormat(locale, { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(row[key])) : String(row[key])}</span>)}</div>{spec.key === "school_library" && <LibraryResource row={row}/>}</div>{canEdit && <Button variant="ghost" aria-label={`${id ? "Edit" : "Edit"} ${rowName(row)}`} onClick={() => { setEditing(row); save.reset(); }}><Pencil size={16}/></Button>}</article>)}</div> : <div className="school-empty"><h3>{search ? (id ? "Tidak ada hasil" : "No results") : (id ? "Belum ada data" : "No records yet")}</h3><p>{id ? "Tambahkan data pertama atau ubah pencarian Anda." : "Add your first record or adjust your search."}</p></div>}<div className="school-pagination"><Button variant="ghost" disabled={!page || records.isFetching} onClick={() => setPage(p => p - 1)}>←</Button><span>{id ? "Halaman" : "Page"} {page + 1}</span><Button variant="ghost" disabled={(records.data?.length ?? 0) < 50 || records.isFetching} onClick={() => setPage(p => p + 1)}>→</Button></div></div>{editing && <aside>{save.isError && <p className="school-error" role="alert">{save.error.message}</p>}<RecordForm key={`${spec.key}-${editing === "new" ? "new" : editing.id}`} spec={spec} row={editing === "new" ? undefined : editing} pending={save.isPending} onSave={payload => save.mutate(payload)} onClose={() => setEditing(null)}/></aside>}</div></section>;
}
export function SchoolHierarchy() { return <nav className="school-hierarchy" aria-label="School hierarchy">{[["OSEKOLA", "/dashboard"], ["Tenant", "/dashboard/core"], ["Academic year", "/dashboard/academic"], ["Semester", "/dashboard/academic"], ["Classroom", "/dashboard/academic"], ["Subject", "/dashboard/academic"], ["Courses", "/dashboard/learning"], ["Lessons", "/dashboard/learning"], ["Assignment", "/dashboard/learning"], ["Submission", "/dashboard/learning"]].map(([label, href]) => <Link key={label} href={href}>{label}<span>›</span></Link>)}</nav>; }
