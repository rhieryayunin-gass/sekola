"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { schoolRpc, useCatalog, type SchoolRow } from "../../lib/school";
import { usePermissionStore } from "../../stores/permission-store";
import { useTranslations } from "../i18n/i18n-provider";
import { Button, Input, Select } from "../ui";
export function Qualifications({
  programId = "",
  studentId,
}: {
  programId?: string;
  studentId?: string;
}) {
  const { locale } = useTranslations();
  const id = locale === "id-ID";
  const actor = usePermissionStore((s) => s.context?.userId);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const cache = useQueryClient();
  const programs = useCatalog("curriculum:programs", !studentId);
  const students = useCatalog("students", !studentId);
  const q = useQuery({
    queryKey: ["qualifications", actor, programId, studentId, page],
    enabled: !!actor,
    queryFn: () =>
      schoolRpc<SchoolRow[]>("school_qualifications", {
        action: "list",
        payload: {
          program_id: programId || null,
          student_id: studentId ?? null,
          offset: page * 100,
        },
      }),
  });
  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      schoolRpc("school_qualifications", { action: "save", payload }),
    onSuccess: async () => {
      setOpen(false);
      await cache.invalidateQueries({ queryKey: ["qualifications"] });
    },
  });
  return (
    <section className="p8-section">
      <header>
        <div>
          <h3>
            {id
              ? "Kualifikasi & ujian eksternal"
              : "Qualifications & external examinations"}
          </h3>
          <p>
            {id
              ? "Hasil resmi disimpan terpisah dari nilai internal. Koreksi atau ujian ulang membuat catatan baru."
              : "Official results are separate from internal marks. Corrections and resits create a new record."}
          </p>
        </div>
        {!studentId && (
          <Button onClick={() => setOpen(!open)}>
            {id ? "Catat hasil" : "Record result"}
          </Button>
        )}
      </header>
      {open && (
        <form
          className="p8-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const payload = Object.fromEntries(
              Array.from(f.entries()).map(([k, v]) => [k, v === "" ? null : v]),
            );
            save.mutate(payload);
          }}
        >
          <Select
            name="program_id"
            label={id ? "Program" : "Programme"}
            defaultValue={programId}
            required
          >
            <option value="">—</option>
            {programs.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {String(p.version)}
              </option>
            ))}
          </Select>
          <Select name="student_id" label={id ? "Siswa" : "Student"} required>
            <option value="">—</option>
            {students.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {String(s.name ?? s.full_name ?? s.student_number)}
              </option>
            ))}
          </Select>
          <Input
            name="specification"
            label={
              id ? "Spesifikasi / kode mapel" : "Specification / subject code"
            }
            required
            maxLength={160}
          />
          <Select name="pathway" label={id ? "Jalur" : "Pathway"}>
            <option value="LINEAR">Linear</option>
            <option value="MODULAR">Modular</option>
          </Select>
          <Input
            name="unit_code"
            label={id ? "Kode unit (jika ada)" : "Unit code (if applicable)"}
          />
          <Input
            name="session_name"
            label={
              id ? "Sesi ujian, termasuk tahun" : "Exam session, including year"
            }
            placeholder="June 2027"
            required
            maxLength={120}
          />
          <Input
            name="session_date"
            label={id ? "Tanggal ujian" : "Exam date"}
            type="date"
          />
          <Input
            name="raw_score"
            label={id ? "Nilai mentah" : "Raw score"}
            type="number"
            min={0}
            step="0.01"
          />
          <Input name="ums" label="UMS" type="number" min={0} step="0.01" />
          <Input name="unit_grade" label={id ? "Nilai unit" : "Unit grade"} />
          <Input
            name="qualification_grade"
            label={id ? "Nilai kualifikasi" : "Qualification grade"}
          />
          <Select
            name="cash_in_status"
            label={
              id
                ? "Agregasi kualifikasi (cash-in)"
                : "Qualification aggregation (cash-in)"
            }
          >
            <option value="NOT_REQUESTED">
              {id ? "Belum diajukan" : "Not requested"}
            </option>
            <option value="REQUESTED">{id ? "Diajukan" : "Requested"}</option>
            <option value="CONFIRMED">
              {id ? "Dikonfirmasi" : "Confirmed"}
            </option>
          </Select>
          <Input
            name="official_reference"
            label={id ? "Referensi hasil resmi" : "Official result reference"}
            required
            maxLength={500}
          />
          <Select
            name="supersedes_id"
            label={
              id
                ? "Menggantikan hasil sebelumnya (opsional)"
                : "Supersedes prior result (optional)"
            }
          >
            <option value="">—</option>
            {q.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {String(r.specification)} · {String(r.session_name)}
              </option>
            ))}
          </Select>
          <Select name="status" label={id ? "Visibilitas" : "Visibility"}>
            <option value="DRAFT">{id ? "Draf" : "Draft"}</option>
            <option value="PUBLISHED">{id ? "Publikasikan" : "Publish"}</option>
          </Select>
          <Button type="submit" disabled={save.isPending}>
            {id ? "Simpan hasil" : "Save result"}
          </Button>
        </form>
      )}
      {(q.isError || save.isError) && (
        <p role="alert">{q.error?.message || save.error?.message}</p>
      )}
      <div className="grid gap-3">
        {q.data?.map((r) => (
          <article className="p8-qualification-record" key={r.id}>
            <strong>
              {String(
                (r.context as { program?: { name?: string } })?.program?.name ??
                  "",
              )}{" "}
              · {String(r.specification)}
            </strong>
            <p>
              {String(
                students.data?.find((s) => s.id === r.student_id)?.name ??
                  students.data?.find((s) => s.id === r.student_id)
                    ?.student_number ??
                  "",
              )}{" "}
              · {String(r.session_name)} · {String(r.pathway)} ·{" "}
              {String(r.unit_code ?? "")}
            </p>
            <p>
              {id ? "Nilai mentah" : "Raw"}: {String(r.raw_score ?? "—")} · UMS:{" "}
              {String(r.ums ?? "—")} · {id ? "Unit" : "Unit"}:{" "}
              {String(r.unit_grade ?? "—")} ·{" "}
              {id ? "Kualifikasi" : "Qualification"}:{" "}
              {String(r.qualification_grade ?? "—")}
            </p>
            <small>
              {String(r.status)} · {String(r.official_reference)}
            </small>
          </article>
        ))}
      </div>
      <div className="school-pagination">
        <Button
          variant="ghost"
          disabled={!page}
          onClick={() => setPage((p) => p - 1)}
        >
          ←
        </Button>
        <span>{page + 1}</span>
        <Button
          variant="ghost"
          disabled={(q.data?.length ?? 0) < 100}
          onClick={() => setPage((p) => p + 1)}
        >
          →
        </Button>
      </div>
    </section>
  );
}
