"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Layers3, Plus } from "lucide-react";
import { curriculumFrameworks } from "../../lib/curriculum-frameworks";
import { schoolRpc, useCatalog, type SchoolRow } from "../../lib/school";
import { useTranslations } from "../i18n/i18n-provider";
import { RecordWorkspace, type Field, type ResourceSpec } from "../school/record-workspace";
import { Button, Input, Select } from "../ui";
const text = (key: string, label: string, optional = false): Field => ({ key, label, optional });
const pick = (key: string, label: string, catalog: string, optional = false): Field => ({ key, label, catalog, optional, immutable: true });
const active: Field = { key: "is_active", label: "Active", type: "checkbox" };
function specs(id: boolean): ResourceSpec[] {
 const label = (en: string, ind: string) => id ? ind : en;
 const program = pick("program_id", label("Programme", "Program"), "curriculum:programs");
 const stage = pick("stage_id", label("Stage / phase", "Jenjang / fase"), "curriculum:stages");
 const subject = pick("curriculum_subject_id", label("Programme subject", "Mapel program"), "curriculum:subjects");
 const make = (key: string, title: string, fields: Field[], columns?: string[]): ResourceSpec => ({ key: `school_curriculum_${key}`, title, fields, columns, curriculum: true });
 const isActive = { ...active, label: label("Active", "Aktif") };
 return [
 make("programs", label("Programmes", "Program"), [pick("academic_year_id", label("Academic year", "Tahun ajaran"), "academic_years"), text("name", label("Name", "Nama")), { ...text("framework", label("Framework", "Kurikulum")), options: curriculumFrameworks.map(f => f.code) }, text("version", label("Curriculum / syllabus version", "Versi kurikulum / silabus")), text("language", label("Teaching language", "Bahasa pengantar")), text("source_url", label("Reference URL", "Tautan referensi"), true), { ...text("description", label("School implementation notes", "Catatan penerapan sekolah"), true), type: "textarea" }, isActive]),
 make("stages", label("Stages", "Jenjang / fase"), [program, text("code", label("Code", "Kode")), text("name", label("Name", "Nama")), { ...text("grade_from", label("From grade (optional)", "Dari kelas (opsional)"), true), type: "number", min: 0, max: 20 }, { ...text("grade_to", label("Through grade (optional)", "Sampai kelas (opsional)"), true), type: "number", min: 0, max: 20 }, isActive]),
 make("subjects", label("Programme subjects", "Mapel program"), [program, stage, pick("subject_id", label("School subject", "Mata pelajaran sekolah"), "subjects"), text("name", label("Programme subject name", "Nama mapel program")), text("syllabus_code", label("Syllabus / standard code", "Kode silabus / standar"), true), text("syllabus_version", label("Syllabus year / version", "Tahun / versi silabus"), true), text("level", label("Level (Core, Extended, SL, HL…)", "Level (Core, Extended, SL, HL…)"), true), isActive]),
 make("enrollments", label("Class & student programmes", "Program kelas & siswa"), [program, stage, pick("classroom_id", label("Class", "Kelas"), "classrooms"), pick("student_id", label("Student — leave empty for the whole class", "Siswa — kosongkan untuk seluruh kelas"), "students", true), isActive], ["is_active"]),
 make("outcomes", label("Outcomes & sequence", "Capaian & alur"), [program, subject, pick("parent_id", label("Parent outcome / CP", "Induk capaian / CP"), "curriculum:outcomes", true), text("code", label("Code", "Kode")), text("name", label("Title", "Judul")), { ...text("kind", label("Outcome type", "Jenis capaian")), options: ["CP", "TP", "KI", "KD", "LEARNING_OBJECTIVE", "ASSESSMENT_OBJECTIVE", "STANDARD", "INQUIRY", "COMPETENCY", "PERSONAL", "INTERNATIONAL", "OTHER"] }, text("strand", label("Strand / element / theme", "Elemen / tema"), true), { ...text("description", label("Learning outcome", "Capaian pembelajaran")), type: "textarea" }, { ...text("sequence", label("Sequence / ATP order", "Urutan alur / ATP")), type: "number", min: 1, max: 10000 }, { ...text("activity_type", label("Activity type", "Jenis kegiatan")), options: ["INTRACURRICULAR", "COCURRICULAR", "EXTRACURRICULAR"] }, isActive]),
 make("scales", label("Assessment scales", "Skala penilaian"), [program, text("name", label("Scale name & version", "Nama & versi skala")), { ...text("kind", label("Scale type", "Jenis skala")), options: ["NUMERIC", "DESCRIPTOR", "LETTER", "RUBRIC"] }, { ...text("minimum", label("Minimum — numeric/rubric only", "Minimum — angka/rubrik saja"), true), type: "number" }, { ...text("maximum", label("Maximum — numeric/rubric only", "Maksimum — angka/rubrik saja"), true), type: "number" }, { ...text("labels", label("Descriptors / grades — one per line", "Deskripsi / predikat — satu per baris"), true), type: "lines" }, { ...text("criteria", label("Assessment criteria / mastery evidence", "Kriteria ketercapaian / bukti penguasaan"), true), type: "textarea" }, isActive]),
 make("course_links", label("Course mappings", "Pemetaan course"), [program, pick("course_id", "Course", "curriculum:courses"), subject, isActive], ["is_active"]),
 ];
}
export function CurriculumManager() {
 const { locale } = useTranslations(); const id = locale === "id-ID";
 const [creating, setCreating] = useState(false); const [framework, setFramework] = useState("MERDEKA"); const [programId, setProgramId] = useState("");
 const programs = useCatalog("curriculum:programs"); const years = useCatalog("academic_years"); const qc = useQueryClient();
 const preset = curriculumFrameworks.find(f => f.code === framework)!;
 const create = useMutation({ mutationFn: (payload: Record<string, unknown>) => schoolRpc<SchoolRow>("school_curriculum_create_program", { payload, stages: preset.stages }), onSuccess: async p => { setCreating(false); setProgramId(p.id); await qc.invalidateQueries({ queryKey: ["school-catalog"] }); await qc.invalidateQueries({ queryKey: ["school-records"] }); } });
 return <section className="curriculum-workspace"><header className="school-section-title"><div><p className="ose-eyebrow">MULTI-CURRICULUM</p><h2>{id ? "Satu sekolah, beragam jalur belajar" : "One school, multiple learning pathways"}</h2><p>{id ? "Jalankan beberapa program pada kelas atau siswa yang sama. Hubungkan capaian dan skala penilaian setiap program ke course." : "Run several programmes for the same class or student. Connect each programme’s outcomes and assessment scales to courses."}</p></div><Layers3 size={32}/></header>
 <div className="school-toolbar"><Select aria-label={id ? "Filter program kurikulum" : "Filter curriculum programme"} value={programId} onChange={e => setProgramId(e.target.value)}><option value="">{id ? "Semua program" : "All programmes"}</option>{programs.data?.map(p => <option key={p.id} value={p.id}>{p.name} · {String(p.version)}</option>)}</Select><Button onClick={() => { setCreating(!creating); create.reset(); }}><Plus size={16}/>{id ? "Buat program dari kerangka" : "Create programme from framework"}</Button></div>
 {(programs.isError || years.isError) && <p role="alert" className="school-error">{programs.error?.message ?? years.error?.message}</p>}
 {creating && <form className="school-editor" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); create.mutate({ academic_year_id: f.get("year"), name: f.get("name"), version: f.get("version"), framework, language: f.get("language"), source_url: preset.source || null }); }}>
 <label className="school-field"><span>{id ? "Kerangka kurikulum" : "Curriculum framework"}</span><Select value={framework} onChange={e => setFramework(e.target.value)}>{curriculumFrameworks.map(f => <option key={f.code} value={f.code}>{f.name}</option>)}</Select></label>
 <label className="school-field"><span>{id ? "Tahun ajaran" : "Academic year"}</span><Select name="year" required><option value="">{id ? "Pilih tahun ajaran" : "Choose academic year"}</option>{years.data?.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}</Select></label>
 <Input name="name" label={id ? "Nama program sekolah" : "School programme name"} required minLength={2} maxLength={160}/><Input name="version" label={id ? "Versi kurikulum / tahun silabus" : "Curriculum version / syllabus years"} required maxLength={120}/><Input name="language" label={id ? "Bahasa pengantar" : "Teaching language"} defaultValue="id / en" required maxLength={40}/>
 <p>{preset.stages.length ? `${id ? "Jenjang awal" : "Starter stages"}: ${preset.stages.map(s => s.name).join(" · ")}` : (id ? "Tambahkan jenjang sesuai program sekolah setelah menyimpan." : "Add stages for your school programme after saving.")}</p>
 {preset.source && <a className="ose-link" href={preset.source} target="_blank" rel="noreferrer">{id ? "Buka referensi kurikulum" : "Open curriculum reference"}</a>}
 <p>{id ? "Selanjutnya: tetapkan mapel program → kelas/siswa → capaian & skala → pemetaan course. Jenjang dapat disesuaikan dengan sekolah." : "Next: programme subjects → classes/students → outcomes & scales → course mappings. Adapt stages to your school."}</p>
 {create.isError && <p role="alert" className="school-error">{create.error.message}</p>}<Button type="submit" disabled={create.isPending}>{create.isPending ? "…" : id ? "Simpan program" : "Save programme"}</Button></form>}
 <RecordWorkspace key={programId} specs={specs(id)} programId={programId}/></section>;
}
