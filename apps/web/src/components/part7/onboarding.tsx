"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronRight,
  GraduationCap,
  Layers3,
  LockKeyhole,
  MapPin,
  Plus,
  Rocket,
  Upload,
  Users,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  schoolRpc,
  useCatalog,
  type SchoolRow,
  rowName,
} from "../../lib/school";
import { usePermissionStore } from "../../stores/permission-store";
import {
  RecordForm,
  RecordWorkspace,
  type ResourceSpec,
} from "../school/record-workspace";
import { academicSpecs, peopleSpecs } from "../school/resource-specs";
import { CurriculumManager } from "../curriculum/curriculum-manager";
import { Button, Input, Select } from "../ui";
import {
  ErrorNotice,
  FormField,
  textData,
  useActor,
  useP7,
  useRefresh,
} from "./shared";
import { AccountImport } from "./account-import";
import { parseSchoolFile } from "../../lib/school-import";

type CheckRow = {
  key: string;
  phase: string;
  issues: number;
  complete: boolean;
};
type Setup = {
  school: {
    id: string;
    name: string;
    legal_name: string;
    address: string;
    contact_email: string;
    contact_phone: string;
    timezone: string;
    locale: string;
    week_starts_on: number;
  };
  setup: {
    mode: string;
    operations: Record<string, unknown>;
    revision: number;
    launched_at?: string;
  };
  checks: CheckRow[];
  score: number;
  blockers: number;
  year_id: string | null;
  term_id: string | null;
  can_edit: boolean;
  can_identity: boolean;
  can_academic: boolean;
  can_facilities: boolean;
  counts: { students: number; teachers: number; classes: number };
  activity: { action: string; resource_type: string; created_at: string }[];
};
const steps = [
  ["home", "Your school", "Sekolah Anda"],
  ["identity", "Identity & operations", "Identitas & operasional"],
  ["facilities", "Spaces & facilities", "Ruang & fasilitas"],
  ["year", "Year & terms", "Tahun & periode"],
  ["curriculum", "Curriculum pathways", "Jalur kurikulum"],
  ["classes", "Class architecture", "Struktur kelas"],
  ["people", "People & migration", "Komunitas & migrasi"],
  ["placement", "Allocation board", "Penempatan"],
  ["assessment", "Learning & assessment", "Pembelajaran & penilaian"],
  ["readiness", "Readiness & launch", "Kesiapan & peluncuran"],
] as const;
const dependencies: Record<string, string[]> = {
  curriculum: ["year"],
  classes: ["year"],
  placement: ["year", "terms", "classes"],
};
export function SchoolSetup({ academic = false }: { academic?: boolean }) {
  const roles = usePermissionStore((s) => s.context?.roles ?? []);
  const available = roles.some((r) =>
    ["STAFF"].includes(r.code),
  );
  return available ? (
    <Suspense>
      <SetupContent academic={academic} />
    </Suspense>
  ) : (
    <RecordWorkspace specs={peopleSpecs} />
  );
}
function SetupContent({ academic }: { academic: boolean }) {
  const tr = useP7(),
    actor = useActor(),
    refresh = useRefresh(),
    params = useSearchParams();
  const [step, setStep] = useState(
    steps.some((s) => s[0] === params.get("section"))
      ? params.get("section")!
      : academic
        ? "curriculum"
        : "home",
  );
  const [preview, setPreview] = useState("");
  const q = useQuery({
    queryKey: ["p7", "setup", actor],
    enabled: !!actor,
    queryFn: () => schoolRpc<Setup>("school_setup_state"),
  });
  const mutate = useMutation({
    mutationFn: ({
      action,
      payload,
    }: {
      action: string;
      payload?: Record<string, unknown>;
    }) => schoolRpc("school_setup_action", { action, payload: payload ?? {} }),
    onSuccess: refresh,
  });
  const data = q.data;
  const complete = (key: string) =>
    data?.checks.find((c) => c.key === key)?.complete;
  const blocked = (key: string) =>
    dependencies[key]?.filter((k) => !complete(k)) ?? [];
  const name = (key: string) => steps.find((s) => s[0] === key);
  const label = (key: string) => {
    const s = name(key);
    return s
      ? tr(s[1], s[2])
      : ({
          homeroom: tr("Homeroom teachers"),
          mapping: tr("Programme stages, subjects & scales"),
          terms: tr("Active term"),
          capacity: tr("Class capacity"),
          assignments: tr("Teaching assignments"),
          enrollment: tr("Class curriculum mapping"),
          operations: tr("Operating hours & administrative units"),
        }[key] ?? key);
  };
  if (q.isPending)
    return <p role="status">{tr("Preparing your school journey…")}</p>;
  if (!data) return <ErrorNotice error={q.error} />;
  return (
    <section className="p7" data-testid="school-setup">
      <header className="p7-hero">
        <div>
          <p className="ose-eyebrow">BUILD YOUR DIGITAL SCHOOL</p>
          <h1>{data.school.name}</h1>
          <p>
            {tr(
              "One connected journey, from school foundation to the first day of learning.",
            )}
          </p>
          <div className="p7-pills">
            {data.setup.launched_at && (
              <span>
                <CheckCircle2 size={14} />
                {tr("Launched")}
              </span>
            )}
          </div>
        </div>
        <div
          className="p10-speedometer" role="meter" aria-label={tr("Readiness")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.score}
          style={{ "--angle": `${data.score * 1.8 - 90}deg`, "--progress": `${data.score / 2}%` } as React.CSSProperties}
        >
          <span className="p10-speedometer-needle"/>
          <div>
            <strong>{data.score}%</strong>
            <small>{tr("Readiness")}</small>
          </div>
        </div>
      </header>
      <nav className="p7-journey p8-journey" aria-label={tr("School setup journey")}>
        {[
          {keys:["home","identity","facilities","people"],en:"Profile & operations",id:"Profil & operasional"},
          {keys:["year","curriculum"],en:"Learning programmes",id:"Program pembelajaran"},
          {keys:["classes","placement"],en:"Classes & participants",id:"Kelas & peserta"},
          {keys:["assessment"],en:"Learning & assessment",id:"Pembelajaran & penilaian"},
          {keys:["readiness"],en:"Review & activate",id:"Tinjau & aktifkan"},
        ].filter((g,i)=>data.can_academic||i===0||i===4).map((g,i)=><button key={g.en} aria-current={g.keys.includes(step)?"step":undefined} onClick={()=>{setStep(g.keys[0]);setPreview("");}}><span>{i+1}</span>{tr(g.en,g.id)}</button>)}
      </nav>
      <div className="p8-substeps">{steps.filter(([key])=>{
       const groups=[["home","identity","facilities","people"],["year","curriculum"],["classes","placement"],["assessment"],["readiness"]];return groups.find(g=>g.includes(step))?.includes(key);
      }).map(([key,en,id])=><Button key={key} variant={step===key?"secondary":"ghost"} onClick={()=>setStep(key)}>{tr(en,id)}</Button>)}</div>
      <ErrorNotice error={mutate.error} />
      <div className="p7-layout p10-setup-layout">
        <main className="p7-canvas">
          {step === "home" && (
            <>
              <div className="p7-section-head">
                <div>
                  <p className="ose-eyebrow">YOUR SCHOOL, CONNECTED</p>
                  <h2>{tr("A clear next step. Every time.")}</h2>
                </div>
                <Rocket className="p7-icon" />
              </div>
              <div className="p7-metrics">
                {Object.entries(data.counts).map(([k, v]) => (
                  <article key={k}>
                    <strong>{v}</strong>
                    <span>
                      {k === "students"
                        ? tr("Students")
                        : k === "teachers"
                          ? tr("Teachers")
                          : tr("Classes")}
                    </span>
                  </article>
                ))}
              </div>
              <div className="p7-card-grid">
                {[
                  [
                    "GUIDED",
                    "Guided setup",
                    "Panduan bertahap",
                    "Work through each step with checks along the way.",
                    "Lengkapi setiap tahap dengan pemeriksaan otomatis.",
                  ],
                  [
                    "IMPORT",
                    "Fast import",
                    "Impor cepat",
                    "Map your CSV or Excel data, review it, then commit.",
                    "Petakan data CSV atau Excel, tinjau, lalu simpan.",
                  ],
                  [
                    "ASSISTED",
                    "Assisted migration",
                    "Migrasi terbantu",
                    "Use issue explanations and the migration plan to resolve gaps.",
                    "Gunakan penjelasan masalah dan rencana migrasi untuk melengkapi data.",
                  ],
                ].map(([mode, en, id, desc, descId]) => (
                  <button
                    className="p7-choice"
                    data-selected={data.setup.mode === mode}
                    key={mode}
                    disabled={!data.can_edit || mutate.isPending}
                    onClick={() => {
                      mutate.mutate({
                        action: "preferences",
                        payload: {
                          revision: data.setup.revision,
                          mode,
                          operations: data.setup.operations,
                        },
                      });
                      setStep(mode === "GUIDED" ? "identity" : "people");
                    }}
                  >
                    <Layers3 />
                    <h3>{tr(en, id)}</h3>
                    <p>{tr(desc, descId)}</p>
                    <ArrowRight />
                  </button>
                ))}
              </div>
              <Button
                onClick={() =>
                  setStep(
                    data.checks.find((c) => !c.complete)?.key === "identity"
                      ? "identity"
                      : "readiness",
                  )
                }
              >
                {tr("Start building your school")}
                <ArrowRight size={16} />
              </Button>
            </>
          )}
          {!data.can_academic &&
          ["year", "curriculum", "classes", "placement"].includes(step) ? (
            <p className="p7-note">
              {tr("Academic setup is managed by your school Staff.")}
            </p>
          ) : blocked(step).length > 0 ? (
            <div className="p7-empty">
              <LockKeyhole />
              <h2>{tr("A foundation is still missing")}</h2>
              <p>
                {tr("Complete these sources to continue:")}{" "}
                {blocked(step).map(label).join(", ")}
              </p>
              <Button
                onClick={() =>
                  setStep(
                    blocked(step)[0] === "terms" ? "year" : blocked(step)[0],
                  )
                }
              >
                {tr("Open prerequisite")}
              </Button>
            </div>
          ) : (
            <>
              {step === "identity" && (
                <>
                  <h2>{tr("School identity")}</h2>
                  {!data.can_identity && (
                    <p className="p7-note">
                      {tr(
                        "Your account administrator can update the school identity.",
                      )}
                    </p>
                  )}
                  <form
                    className="p7-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      mutate.mutate({
                        action: "identity",
                        payload: textData(e.currentTarget),
                      });
                    }}
                  >
                    <fieldset disabled={!data.can_identity || mutate.isPending}>
                      <div className="p7-form-grid">
                        {[
                          ["name", tr("School name")],
                          ["legal_name", tr("Legal name")],
                          ["address", tr("Address")],
                          ["contact_email", tr("Contact email")],
                          ["contact_phone", tr("Contact phone")],
                        ].map(([key, l]) => (
                          <Input
                            key={key}
                            name={key}
                            label={l}
                            defaultValue={String(
                              data.school[key as keyof Setup["school"]] ?? "",
                            )}
                            required={[
                              "name",
                              "address",
                              "contact_email",
                            ].includes(key)}
                          />
                        ))}
                        <Select
                          name="timezone"
                          label={tr("Timezone")}
                          defaultValue={data.school.timezone}
                        >
                          {[
                            "Asia/Jakarta",
                            "Asia/Makassar",
                            "Asia/Jayapura",
                          ].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </Select>
                        <Select
                          name="locale"
                          label={tr("School language")}
                          defaultValue={data.school.locale}
                        >
                          <option value="en-US">English</option>
                          <option value="id-ID">Bahasa Indonesia</option>
                        </Select>
                      </div>
                      <Button type="submit">{tr("Save identity")}</Button>
                    </fieldset>
                  </form>
                  <OperationsForm
                    key={data.setup.revision}
                    data={data}
                    pending={mutate.isPending}
                    onSave={(payload) =>
                      mutate.mutate({ action: "preferences", payload })
                    }
                  />
                </>
              )}
              {step === "facilities" && (
                <SetupRecords
                  spec={peopleSpecs.find((s) => s.key === "school_assets")!}
                  canEdit={data.can_facilities}
                  cards
                />
              )}
              {step === "year" && (
                <>
                  <div className="p7-section-head">
                    <div>
                      <h2>{tr("Your academic ribbon")}</h2>
                      <p>
                        {tr(
                          "Periods feed the shared Calendar Center and every class.",
                        )}
                      </p>
                    </div>
                    <Link href="/dashboard/calendar" className="ose-link">
                      {tr("Calendar Center")} ↗
                    </Link>
                  </div>
                  <AcademicRibbon canEdit={data.can_edit} />
                  <SetupRecords
                    spec={academicSpecs[0]}
                    canEdit={data.can_edit}
                  />
                  {complete("year") && (
                    <SetupRecords
                      spec={academicSpecs[1]}
                      canEdit={data.can_edit}
                    />
                  )}
                </>
              )}
              {step === "curriculum" && <CurriculumManager />}
              {step === "assessment" && <CurriculumManager assessment />}
              {step === "classes" && (
                <SetupRecords
                  spec={{
                    ...academicSpecs[2],
                    fields: [
                      ...academicSpecs[2].fields,
                      {
                        key: "grade_level",
                        label: tr("Grade"),
                        optional: true,
                      },
                      {
                        key: "stream",
                        label: tr("Stream / section"),
                        optional: true,
                      },
                      { key: "campus", label: tr("Campus"), optional: true },
                    ],
                  }}
                  canEdit={data.can_edit}
                  cards
                />
              )}
              {step === "people" && (
                <>
                  <div className="p7-section-head">
                    <div>
                      <h2>{tr("Migration Center")}</h2>
                      <p>
                        {tr(
                          "Preview, correct and commit. Existing records remain your source of truth.",
                        )}
                      </p>
                    </div>
                    <Upload className="p7-icon" />
                  </div>
                  <AccountImport />
                  {data.can_edit && <MigrationCenter />}
                  <div className="p7-links">
                    <Link href="/dashboard/users">
                      {tr("Accounts, staff & school leaders")} ↗
                    </Link>
                    <Link href="/dashboard/users">
                      {tr("School community")} ↗
                    </Link>
                  </div>
                  <RecordWorkspace
                    specs={peopleSpecs.filter((s) =>
                      ["teachers", "students", "school_guardians"].includes(
                        s.key,
                      ),
                    )}
                  />
                </>
              )}
              {step === "placement" && (
                <AllocationBoard
                  canEdit={data.can_edit}
                  year={data.year_id}
                  term={data.term_id}
                />
              )}
              {step === "readiness" && (
                <>
                  <h2>{tr("Ready for the first school day?")}</h2>
                  <p>
                    {tr("Readiness is calculated from current school records.")}
                  </p>
                  <div className="p7-checks">
                    {data.checks.map((c) => (
                      <button
                        key={c.key}
                        onClick={() =>
                          setStep(
                            ["terms"].includes(c.key)
                              ? "year"
                              : ["mapping", "enrollment"].includes(c.key)
                                ? "curriculum"
                                : ["homeroom", "capacity"].includes(c.key)
                                  ? "classes"
                                  : ["assignments"].includes(c.key)
                                    ? "placement"
                                    : c.key === "operations"
                                      ? "identity"
                                      : c.key,
                          )
                        }
                      >
                        {c.complete ? (
                          <CheckCircle2 className="p7-success" />
                        ) : (
                          <AlertTriangle className="p7-warning" />
                        )}
                        <strong>{label(c.key)}</strong>
                        <span>
                          {c.complete
                            ? tr("Complete")
                            : `${c.issues} ${tr("to resolve")}`}
                        </span>
                        <ChevronRight size={18} />
                      </button>
                    ))}
                  </div>
                  <h3>{tr("Preview the connected journey")}</h3>
                  <div className="p7-pills">
                    {["TEACHER", "STUDENT", "PARENT"].map((role) => (
                      <button key={role} onClick={() => setPreview(role)}>
                        {role}
                      </button>
                    ))}
                  </div>
                  {preview && (
                    <div className="p7-preview">
                      <p className="ose-eyebrow">
                        {tr("Simulation · no role or data changes")}
                      </p>
                      <h3>
                        {preview === "TEACHER"
                          ? "Class Studio"
                          : preview === "STUDENT"
                            ? "My Learning Today"
                            : tr("Family learning report")}
                      </h3>
                      <p>
                        {preview === "TEACHER"
                          ? tr(
                              "Assigned classes → draft units → published activities → review queue.",
                            )
                          : preview === "STUDENT"
                            ? tr(
                                "Assigned classes → published material → tasks → released feedback.",
                              )
                            : tr(
                                "Linked children → deadlines → released results.",
                              )}
                      </p>
                      <p>
                        {data.counts.classes} {tr("classes configured")} ·{" "}
                        {data.counts.students} {tr("student records")}
                      </p>
                    </div>
                  )}
                  <Button
                    disabled={
                      !data.can_edit ||
                      !!data.blockers ||
                      mutate.isPending ||
                      !!data.setup.launched_at
                    }
                    onClick={() => mutate.mutate({ action: "launch" })}
                  >
                    <Rocket size={17} />
                    {data.setup.launched_at
                      ? tr("School launched")
                      : tr("Go live")}
                  </Button>
                </>
              )}
            </>
          )}
        </main>

      </div>
    </section>
  );
}
function OperationsForm({
  data,
  pending,
  onSave,
}: {
  data: Setup;
  pending: boolean;
  onSave: (p: Record<string, unknown>) => void;
}) {
  const tr = useP7();
  return (
    <form
      className="p7-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = textData(e.currentTarget);
        onSave({
          revision: data.setup.revision,
          mode: data.setup.mode,
          operations: {
            ...f,
            units: String(f.units)
              .split("\n")
              .map((v) => v.trim())
              .filter(Boolean),
            campuses: String(f.campuses)
              .split("\n")
              .map((v) => v.trim())
              .filter(Boolean),
          },
        });
      }}
    >
      <h2>{tr("Operational foundation")}</h2>
      <fieldset disabled={!data.can_edit || pending}>
        <div className="p7-form-grid">
          {[
            ["hours", tr("Operating hours")],
            ["campuses", tr("Campuses — one per line")],
            ["units", tr("Administrative units — one per line")],
            ["school_levels", tr("School levels")],
            ["school_status", tr("School status")],
            ["approval_notes", tr("Approval responsibilities")],
            ["communication_notes", tr("Communication arrangements")],
            ["migration_notes", tr("Migration plan / assistance needed")],
          ].map(([key, l]) => (
            <FormField key={key} label={l}>
              <textarea
                name={key}
                rows={3}
                maxLength={3000}
                defaultValue={
                  Array.isArray(data.setup.operations[key])
                    ? (data.setup.operations[key] as string[]).join("\n")
                    : String(data.setup.operations[key] ?? "")
                }
              />
            </FormField>
          ))}
        </div>
        <Button type="submit">{tr("Save operations")}</Button>
      </fieldset>
    </form>
  );
}
export function SetupRecords({
  spec,
  canEdit,
  cards = false,
}: {
  spec: ResourceSpec;
  canEdit: boolean;
  cards?: boolean;
}) {
  const tr = useP7(),
    actor = useActor(),
    refresh = useRefresh();
  const [edit, setEdit] = useState<SchoolRow | "new" | null>(null),
    [search, setSearch] = useState("");
  const catalog = useCatalog(spec.key, spec.key !== "school_assets");
  const direct = useQuery({
    queryKey: ["p7", "assets", actor],
    enabled: !!actor && spec.key === "school_assets",
    queryFn: async () => {
      const { createClient } = await import("../../lib/supabase/client");
      const r = await createClient()
        .from("school_assets")
        .select("*")
        .limit(500);
      if (r.error) throw r.error;
      return r.data as SchoolRow[];
    },
  });
  const q = spec.key === "school_assets" ? direct : catalog;
  const save = useMutation({
    mutationFn: async (p: Record<string, unknown>) => {
      if (spec.key === "school_assets") {
        await schoolRpc("school_save", {
          resource: spec.key,
          payload: p,
          record_id: edit && edit !== "new" ? edit.id : null,
        });
        return;
      }
      const r = await schoolRpc<{
        valid: boolean;
        errors: { message: string }[];
      }>("school_setup_records", {
        resource: spec.key,
        rows: [
          { ...p, ...(edit && edit !== "new" ? { record_id: edit.id } : {}) },
        ],
        dry_run: false,
      });
      if (!r.valid) throw new Error(r.errors.map((e) => e.message).join("; "));
    },
    onSuccess: async () => {
      setEdit(null);
      await refresh();
    },
  });
  return (
    <section className="p7-records">
      <div className="p7-section-head">
        <h2>{spec.title}</h2>
        {canEdit && (
          <Button onClick={() => setEdit("new")}>
            <Plus size={16} />
            {tr("Add")}
          </Button>
        )}
      </div>
      <Input
        aria-label={tr("Filter records")}
        placeholder={tr("Find a name…")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <ErrorNotice error={q.error ?? save.error} />
      {q.isFetching && <p role="status">{tr("Loading…")}</p>}
      <div className={cards ? "p7-card-grid" : "p7-record-list"}>
        {q.data
          ?.filter((r) =>
            JSON.stringify(r).toLowerCase().includes(search.toLowerCase()),
          )
          .map((r) => (
            <article key={r.id} className="p7-record">
              <MapPin size={20} />
              <h3>{rowName(r)}</h3>
              <p>
                {String(r.grade_level ?? r.category ?? r.starts_on ?? "")}
                {r.ends_on ? ` → ${r.ends_on}` : ""}
              </p>
              {r.capacity != null && (
                <span>
                  {tr("Capacity")} {String(r.capacity)}
                </span>
              )}
              {canEdit && (
                <Button variant="ghost" onClick={() => setEdit(r)}>
                  {tr("Edit")}
                </Button>
              )}
            </article>
          ))}
      </div>
      {!q.isFetching && !q.data?.length && (
        <p className="p7-empty">{tr("Add your first record to continue.")}</p>
      )}
      {edit && (
        <div className="p7-editor-panel">
          <RecordForm
            spec={spec}
            row={edit === "new" ? undefined : edit}
            pending={save.isPending}
            onSave={(p) => save.mutate(p)}
            onClose={() => setEdit(null)}
          />
        </div>
      )}
    </section>
  );
}
function AcademicRibbon({ canEdit }: { canEdit: boolean }) {
  const years = useCatalog("academic_years"),
    terms = useCatalog("semesters");
  return (
    <div className="p7-ribbon">
      {years.data?.map((y) => (
        <div key={y.id}>
          <strong>{rowName(y)}</strong>
          <div>
            {terms.data
              ?.filter((t) => t.academic_year_id === y.id)
              .map((t) => (
                <TermRibbon
                  key={`${t.id}:${t.starts_on}:${t.ends_on}`}
                  year={y}
                  term={t}
                  canEdit={canEdit}
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
function AllocationBoard({
  canEdit,
  year,
  term,
}: {
  canEdit: boolean;
  year: string | null;
  term: string | null;
}) {
  const tr = useP7(),
    refresh = useRefresh();
  const students = useCatalog("students"),
    teachers = useCatalog("teachers"),
    classes = useCatalog("classrooms"),
    assignments = useCatalog("student_assignments");
  const [selected, setSelected] = useState<string[]>([]),
    [target, setTarget] = useState(""),
    [filter, setFilter] = useState("");
  const save = useMutation({
    mutationFn: async ({
      resource,
      rows,
    }: {
      resource: string;
      rows: Record<string, unknown>[];
    }) => {
      const r = await schoolRpc<{
        valid: boolean;
        errors: { message: string }[];
      }>("school_setup_records", { resource, rows, dry_run: false });
      if (!r.valid) throw new Error(r.errors.map((e) => e.message).join("; "));
    },
    onSuccess: async () => {
      setSelected([]);
      await refresh();
    },
  });
  const roster = assignments.data?.filter(
    (a) => a.semester_id === term && a.is_active,
  );
  const transfer = (cid: string) =>
    selected.map((student_id) => ({
      academic_year_id: year,
      semester_id: term,
      classroom_id: cid,
      student_id,
      ...(roster?.find((r) => r.student_id === student_id)
        ? { record_id: roster.find((r) => r.student_id === student_id)!.id }
        : {}),
    }));
  return (
    <>
      <h2>{tr("Everyone in the right class")}</h2>
      <p>
        {tr(
          "Select learners and move them together. Drag a teacher onto a class to assign a homeroom teacher, or use the class editor.",
        )}
      </p>
      <ErrorNotice error={save.error} />
      <div className="p7-teacher-strip">
        {teachers.data?.map((t) => (
          <span
            key={t.id}
            draggable={canEdit}
            onDragStart={(e) =>
              e.dataTransfer.setData(
                "application/osekola-teacher",
                String(t.user_id),
              )
            }
          >
            <GraduationCap size={16} />
            {rowName(t)}
          </span>
        ))}
      </div>
      <div className="p7-card-grid">
        {classes.data
          ?.filter((c) => c.academic_year_id === year)
          .map((c) => {
            const size =
              roster?.filter((a) => a.classroom_id === c.id).length ?? 0;
            return (
              <article
                className="p7-record"
                key={c.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const teacher = e.dataTransfer.getData(
                    "application/osekola-teacher",
                  );
                  if (canEdit && teacher)
                    save.mutate({
                      resource: "classrooms",
                      rows: [
                        { record_id: c.id, homeroom_teacher_user_id: teacher },
                      ],
                    });
                }}
              >
                <h3>{rowName(c)}</h3>
                <p>
                  {teachers.data?.find(
                    (t) => t.user_id === c.homeroom_teacher_user_id,
                  )?.name ?? tr("No homeroom teacher")}
                </p>
                <span className={size > Number(c.capacity) ? "p7-warning" : ""}>
                  <Users size={14} />
                  {size} / {String(c.capacity)}
                </span>
              </article>
            );
          })}
      </div>
      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={tr("Find a learner")}
        aria-label={tr("Find a learner")}
      />
      <div className="p7-roster">
        {students.data
          ?.filter((s) =>
            rowName(s).toLowerCase().includes(filter.toLowerCase()),
          )
          .map((s) => (
            <label key={s.id}>
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={selected.includes(s.id)}
                onChange={(e) =>
                  setSelected((old) =>
                    e.target.checked
                      ? [...old, s.id]
                      : old.filter((id) => id !== s.id),
                  )
                }
              />
              <span>{rowName(s)}</span>
              <small>
                {classes.data?.find(
                  (c) =>
                    c.id ===
                    roster?.find((a) => a.student_id === s.id)?.classroom_id,
                )?.name ?? tr("Unplaced")}
              </small>
            </label>
          ))}
      </div>
      <div className="p7-toolbar">
        <Select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          aria-label={tr("Destination class")}
        >
          <option value="">{tr("Choose destination")}</option>
          {classes.data
            ?.filter((c) => c.academic_year_id === year)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {rowName(c)}
              </option>
            ))}
        </Select>
        <Button
          disabled={!canEdit || !target || !selected.length || save.isPending}
          onClick={() =>
            save.mutate({
              resource: "student_assignments",
              rows: transfer(target),
            })
          }
        >
          {tr("Place selected learners")} ({selected.length})
        </Button>
      </div>
      <SetupRecords canEdit={canEdit} spec={academicSpecs[4]} />
    </>
  );
}
function MigrationCenter() {
  const tr = useP7(),
    refresh = useRefresh();
  const specs = [
    ...academicSpecs.slice(0, 6),
    ...peopleSpecs.filter((s) =>
      ["teachers", "students", "school_guardians", "school_assets"].includes(
        s.key,
      ),
    ),
  ];
  const [resource, setResource] = useState(specs[0].key),
    [data, setData] = useState<string[][]>([]),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [error, setError] = useState("");
  const spec = specs.find((s) => s.key === resource)!;
  const batch = () =>
    data.slice(1).map((row) =>
      Object.fromEntries(
        spec.fields
          .filter((f) => mapping[f.key] !== undefined && mapping[f.key] !== "")
          .map((f) => {
            const value = row[Number(mapping[f.key])]?.trim() ?? "";
            return [
              f.key,
              f.type === "number"
                ? Number(value)
                : f.type === "checkbox"
                  ? ["true", "1", "yes", "ya"].includes(value.toLowerCase())
                  : value,
            ];
          })
          .filter(([, v]) => v !== ""),
      ),
    );
  const action = useMutation({
    mutationFn: async (dry_run: boolean) => {
      const rows = batch();
      const relations: Record<string, string> = {
        academic_year_id: "academic_years",
        semester_id: "semesters",
        classroom_id: "classrooms",
        subject_id: "subjects",
        teacher_id: "teachers",
        student_id: "students",
        user_id: "users",
        parent_user_id: "users",
        homeroom_teacher_user_id: "users",
        room_id: "rooms",
      };
      for (const [field, catalog] of Object.entries(relations)) {
        if (
          !rows.some(
            (row) => row[field] && !/^[0-9a-f-]{36}$/i.test(String(row[field])),
          )
        )
          continue;
        const choices: SchoolRow[] = [];
        for (let offset = 0; offset < 10000; offset += 500) {
          const page = await schoolRpc<SchoolRow[]>("school_catalog", {
            resource: catalog,
            page_offset: offset,
          });
          choices.push(...page);
          if (page.length < 500) break;
        }
        for (const [i, row] of rows.entries()) {
          if (!row[field] || /^[0-9a-f-]{36}$/i.test(String(row[field])))
            continue;
          const matching = choices.filter((c) =>
            [rowName(c), c.code, c.student_number, c.employee_number].some(
              (v) =>
                String(v ?? "").toLowerCase() ===
                String(row[field]).toLowerCase(),
            ),
          );
          if (matching.length !== 1)
            throw new Error(
              `${tr("Row")} ${i + 1}: ${field} — ${tr("Choose an unambiguous name or use the record ID.")}`,
            );
          row[field] = matching[0].id;
        }
      }
      return schoolRpc<{
        valid: boolean;
        committed: boolean;
        errors: { row: number; message: string }[];
        rows: number;
      }>("school_setup_records", { resource, rows, dry_run });
    },
    onSuccess: async (r) => {
      if (r.committed) await refresh();
    },
  });
  return (
    <div className="p7-import">
      <div className="p7-toolbar">
        <Select
          value={resource}
          onChange={(e) => {
            setResource(e.target.value);
            setMapping({});
            action.reset();
          }}
          aria-label={tr("Data type")}
        >
          {specs.map((s) => (
            <option key={s.key} value={s.key}>
              {s.title}
            </option>
          ))}
        </Select>
        <Input
          type="file"
          accept=".csv,.xlsx"
          aria-label={tr("Upload CSV or Excel")}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setError("");
            action.reset();
            try {
              const rows = await parseSchoolFile(f);
              setData(rows);
              setMapping(
                Object.fromEntries(
                  spec.fields.flatMap((field) => {
                    const index = rows[0]?.findIndex(
                      (s) => s.toLowerCase() === field.key,
                    );
                    return index != null && index >= 0
                      ? [[field.key, String(index)]]
                      : [];
                  }),
                ),
              );
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          }}
        />
      </div>
      <p>
        {tr(
          "Up to 500 rows. Link records by a unique name or ID. Dates: YYYY-MM-DD. Accounts must be prepared by your account administrator.",
        )}
      </p>
      <ErrorNotice error={error || action.error} />
      {data.length > 0 && (
        <>
          <div className="p7-form-grid">
            {spec.fields.map((f) => (
              <Select
                key={f.key}
                label={f.label}
                value={mapping[f.key] ?? ""}
                onChange={(e) => {
                  setMapping((m) => ({ ...m, [f.key]: e.target.value }));
                  action.reset();
                }}
              >
                <option value="">—</option>
                {data[0].map((s, i) => (
                  <option key={i} value={i}>
                    {s || i + 1}
                  </option>
                ))}
              </Select>
            ))}
          </div>
          <div className="p7-table-scroll">
            <table>
              <thead>
                <tr>
                  {data[0].map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.slice(1, 21).map((row, r) => (
                  <tr key={r}>
                    {data[0].map((_, c) => (
                      <td key={c}>
                        <input
                          aria-label={`${r + 2}:${c + 1}`}
                          value={row[c] ?? ""}
                          onChange={(e) => {
                            setData((old) =>
                              old.map((v, i) =>
                                i === r + 1
                                  ? v.map((val, j) =>
                                      j === c ? e.target.value : val,
                                    )
                                  : v,
                              ),
                            );
                            action.reset();
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            {data.length - 1}{" "}
            {tr(
              "rows in this import; first 20 editable below. Re-upload to correct later rows.",
            )}
          </p>
          <Button
            disabled={action.isPending}
            onClick={() => action.mutate(true)}
          >
            {tr("Validate preview")}
          </Button>
          <Button
            disabled={
              !action.data?.valid || action.isPending || action.data.committed
            }
            onClick={() => action.mutate(false)}
          >
            {tr("Commit validated import")}
          </Button>
          {action.data && (
            <p role="status">
              {action.data.committed
                ? tr("Import committed")
                : action.data.valid
                  ? tr("Preview valid. Nothing has been saved yet.")
                  : tr("Fix the highlighted issues before saving.")}
            </p>
          )}
          {action.data?.errors.map((e, i) => (
            <p className="p7-error" key={i}>
              {tr("Row")} {e.row}: {e.message}
            </p>
          ))}
        </>
      )}
    </div>
  );
}

function TermRibbon({
  year,
  term,
  canEdit,
}: {
  year: SchoolRow;
  term: SchoolRow;
  canEdit: boolean;
}) {
  const tr = useP7(),
    refresh = useRefresh(),
    day = 86400000,
    base = Date.parse(String(year.starts_on)),
    max = Math.round((Date.parse(String(year.ends_on)) - base) / day);
  const originalStart = Math.round(
      (Date.parse(String(term.starts_on)) - base) / day,
    ),
    originalEnd = Math.round((Date.parse(String(term.ends_on)) - base) / day);
  const [start, setStart] = useState(originalStart),
    [end, setEnd] = useState(originalEnd);
  const date = (value: number) =>
    new Date(base + value * day).toISOString().slice(0, 10);
  const save = useMutation({
    mutationFn: async () => {
      const r = await schoolRpc<{
        valid: boolean;
        errors: { message: string }[];
      }>("school_setup_records", {
        resource: "semesters",
        rows: [
          { record_id: term.id, starts_on: date(start), ends_on: date(end) },
        ],
        dry_run: false,
      });
      if (!r.valid) throw new Error(r.errors.map((e) => e.message).join("; "));
    },
    onSuccess: refresh,
  });
  return (
    <span>
      <b>{rowName(term)}</b>
      <small>
        {date(start)} → {date(end)}
      </small>
      {canEdit && (
        <>
          <input
            type="range"
            aria-label={`${tr("Period start")}: ${rowName(term)}`}
            min={0}
            max={Math.max(1, end - 1)}
            value={start}
            onChange={(e) => setStart(Number(e.target.value))}
          />
          <input
            type="range"
            aria-label={`${tr("Period end")}: ${rowName(term)}`}
            min={start + 1}
            max={max}
            value={end}
            onChange={(e) => setEnd(Number(e.target.value))}
          />
          <Button
            variant="ghost"
            disabled={
              save.isPending || (start === originalStart && end === originalEnd)
            }
            onClick={() => save.mutate()}
          >
            {tr("Apply period dates")}
          </Button>
          <ErrorNotice error={save.error} />
        </>
      )}
    </span>
  );
}
