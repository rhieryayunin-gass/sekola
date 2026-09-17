"use client";
import { useCatalog, type SchoolRow } from "../../lib/school";
import { useTranslations } from "../i18n/i18n-provider";
import { Button } from "../ui";
export function ProgramOverview({
  programs,
  select,
}: {
  programs: SchoolRow[];
  select: (id: string) => void;
}) {
  const { locale } = useTranslations();
  const id = locale === "id-ID";
  const subjects = useCatalog("curriculum:subjects"),
    scales = useCatalog("curriculum:scales"),
    enrollments = useCatalog("curriculum:enrollments"),
    outcomes = useCatalog("curriculum:outcomes");
  const ready =
    !subjects.isPending &&
    !scales.isPending &&
    !enrollments.isPending &&
    !outcomes.isPending;
  return (
    <div className="p8-program-grid">
      {programs.map((p) => {
        const count = (rows: SchoolRow[] | undefined) =>
          (rows ?? []).filter(
            (r) => r.program_id === p.id && r.is_active !== false,
          ).length;
        const nsubjects = count(subjects.data),
          nenrollments = count(enrollments.data),
          nscales = count(scales.data),
          ngoals = count(outcomes.data);
        return (
          <article className="p8-qualification-record" key={p.id}>
            <span className="owner-badge">
              {String(p.program_type ?? "CURRICULUM")}
            </span>
            <h3>{p.name}</h3>
            <p>
              {String(p.version)} · {String(p.valid_from ?? "—")} →{" "}
              {String(p.valid_until ?? "—")}
            </p>
            {ready && (
              <p>
                {nsubjects} {id ? "mapel" : "subjects"} · {ngoals}{" "}
                {id ? "tujuan" : "goals"} · {nscales} {id ? "skala" : "scales"}{" "}
                · {nenrollments} {id ? "aturan peserta" : "enrolment rules"}
              </p>
            )}
            <Button variant="ghost" onClick={() => select(p.id)}>
              {id ? "Atur program" : "Configure programme"} →
            </Button>
          </article>
        );
      })}
    </div>
  );
}
