"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Plus,
  ShieldCheck,
  Target,
  X,
} from "lucide-react";
import { schoolRpc } from "../../lib/school";
import { usePermissionStore } from "../../stores/permission-store";
import { Button, Input, Select } from "../ui";
import { ExamPlayer, type ExamState } from "../school/exam-workspace";
import { QuestionWorkspace } from "../school/question-workspace";
import { QuestionDiagram } from "../school/question-diagram";
import type { QuestionContent } from "../../lib/question-schema";
import {
  FocusPanel,
  ErrorNotice,
  FormField,
  useActor,
  useP7,
  useRefresh,
} from "./shared";
import type { CourseContext } from "./class-studio";
type Exam = {
  id: string;
  title: string;
  course_id: string;
  unit_id?: string;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  can_manage: boolean;
  question_count: number;
  attempt_status: string | null;
  can_take: boolean;
  kind?: string;
};
type Blueprint = { outcome_id: string; count: number; weight: number };
type Design = {
  exam: Exam & { description?: string };
  design: {
    unit_id?: string;
    kind?: string;
    duration_minutes?: number;
    instructions?: string;
    result_mode?: string;
    blueprint?: Blueprint[];
  };
  issues: string[];
  items: {
    id: string;
    question_id: string;
    position: number;
    content: QuestionContent & { outcome_id?: string; weight?: number };
  }[];
};
type AssessmentCourse = {
  context: CourseContext;
  units: { id: string; title: string }[];
  outcomes: { id: string; name: string; code: string }[];
};
export function AssessmentStudio() {
  const tr = useP7(),
    actor = useActor(),
    params = useSearchParams(),
    router = useRouter(),
    refresh = useRefresh();
  const teacher = usePermissionStore((s) =>
    s.context?.roles.some((r) => r.code === "TEACHER"),
  );
  const [ready, setReady] = useState<string | null>(null),
    [taking, setTaking] = useState<ExamState | null>(null);
  const selected = params.get("exam"),
    course = params.get("course"),
    unit = params.get("unit");
  const q = useQuery({
    queryKey: ["school-exams", actor],
    queryFn: () => schoolRpc<Exam[]>("school_exam_list"),
    refetchInterval: 30000,
  });
  const courses = useQuery({
    queryKey: ["p7", "exam-courses", actor],
    enabled: !!teacher,
    queryFn: () =>
      schoolRpc<CourseContext[]>("school_assessment", { action: "courses" }),
  });
  if (taking)
    return (
      <ExamPlayer
        key={taking.attempt.id}
        initial={taking}
        onExit={() => {
          setTaking(null);
          void refresh();
        }}
      />
    );
  if (selected || params.get("create"))
    return (
      <AssessmentEditor
        key={selected ?? `new:${course}:${unit}`}
        examId={selected ?? undefined}
        courseId={course ?? undefined}
        unitId={unit ?? undefined}
        courses={courses.data ?? []}
      />
    );
  return (
    <section className="p7" data-testid="assessment-studio">
      <header className="p7-hero">
        <div>
          <p className="ose-eyebrow">O-EXAM</p>
          <h1>
            {teacher
              ? "Assessment Studio"
              : tr("A calm space to show what you know.")}
          </h1>
          <p>
            {tr(
              "Purpose → blueprint → questions → session → feedback → the next learning step.",
            )}
          </p>
        </div>
        <Target className="p7-hero-icon" />
      </header>
      <ErrorNotice error={q.error ?? courses.error} />
      <div className="p7-toolbar">
        {course && (
          <Link
            href={`/dashboard/learning?course=${course}`}
            className="p7-back"
          >
            <ArrowLeft size={16} />
            {tr("Back to class")}
          </Link>
        )}
        {teacher && (
          <Button
            onClick={() =>
              router.push(
                `/dashboard/exams?create=1${course ? `&course=${course}` : ""}${unit ? `&unit=${unit}` : ""}`,
              )
            }
          >
            <Plus size={16} />
            {tr("Create assessment")}
          </Button>
        )}
      </div>
      <div className="p7-card-grid">
        {q.data
          ?.filter(
            (e) =>
              (!course || e.course_id === course) &&
              (!unit || e.unit_id === unit),
          )
          .map((e) => (
            <article className="p7-record" key={e.id}>
              <span className="p7-tag">
                {e.kind ?? "ASSESSMENT"} · {e.status}
              </span>
              <h2>{e.title}</h2>
              <p>
                {e.question_count} {tr("questions")}
              </p>
              <p>
                <Clock size={15} />
                {e.starts_at
                  ? new Date(e.starts_at).toLocaleString()
                  : tr("Not scheduled")}
              </p>
              {e.can_manage ? (
                <Button
                  onClick={() =>
                    router.push(
                      `/dashboard/exams?exam=${e.id}&course=${e.course_id}`,
                    )
                  }
                >
                  {tr("Open studio")}
                </Button>
              ) : (
                <Button onClick={() => setReady(e.id)}>
                  {e.attempt_status
                    ? tr("Open attempt / result")
                    : tr("Check readiness")}
                </Button>
              )}
            </article>
          ))}
      </div>
      {q.isFetching && <p role="status">{tr("Loading assessments…")}</p>}
      {q.data?.length === 0 && (
        <div className="p7-empty">
          <ClipboardCheck />
          <p>
            {teacher
              ? tr(
                  "Create an assessment from an assigned class or a learning unit.",
                )
              : tr("Published assessments for your classes will appear here.")}
          </p>
        </div>
      )}
      {ready && (
        <ExamReady
          id={ready}
          onClose={() => setReady(null)}
          onStart={(s) => {
            setReady(null);
            setTaking(s);
          }}
        />
      )}
    </section>
  );
}
function ExamReady({
  id,
  onClose,
  onStart,
}: {
  id: string;
  onClose: () => void;
  onStart: (s: ExamState) => void;
}) {
  const tr = useP7(),
    actor = useActor();
  const [checked, setChecked] = useState(false);
  const q = useQuery({
    queryKey: ["p7", "exam-ready", actor, id],
    queryFn: () =>
      schoolRpc<{
        title: string;
        starts_at: string;
        ends_at: string;
        duration_minutes: number;
        instructions: string;
        extra_minutes: number;
        question_count: number;
        server_time: string;
        result_mode: string;
        attempt?: { id: string; status: string };
      }>("school_assessment", { action: "ready", payload: { exam_id: id } }),
  });
  const start = useMutation({
    mutationFn: () =>
      schoolRpc<ExamState>("school_exam_start", { exam_uuid: id }),
    onSuccess: onStart,
  });
  return (
    <FocusPanel onClose={onClose}>
      <div className="p7-section-head">
        <ShieldCheck />
        <Button
          onClick={onClose}
          variant="ghost"
          aria-label={tr("Close readiness check")}
        >
          <X />
        </Button>
      </div>
      <h2>{q.data?.title ?? tr("Exam ready check")}</h2>
      <ErrorNotice error={q.error ?? start.error} />
      {q.data && (
        <>
          <div className="p7-metrics">
            <article>
              <strong>{q.data.question_count}</strong>
              <span>{tr("Questions")}</span>
            </article>
            <article>
              <strong>{q.data.duration_minutes + q.data.extra_minutes}</strong>
              <span>{tr("Minutes available, subject to the exam window")}</span>
            </article>
          </div>
          <p>
            {new Date(q.data.starts_at).toLocaleString()} →{" "}
            {new Date(q.data.ends_at).toLocaleString()}
          </p>
          <p className="p7-reading">{q.data.instructions}</p>
          <p>
            {tr(
              "Starting creates or resumes the same attempt. The server controls the deadline. Results appear only after teacher review and release.",
            )}
          </p>
          <p>
            <CheckCircle2 size={16} />
            {tr("Account and assigned access verified")}
          </p>
          <label className="p7-consent">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            {tr("I have read the instructions and am ready.")}
          </label>
          <Button
            disabled={!checked || start.isPending}
            onClick={() => start.mutate()}
          >
            {start.isPending
              ? "…"
              : q.data.attempt
                ? tr("Resume / view result")
                : tr("Start exam now")}
          </Button>
        </>
      )}
    </FocusPanel>
  );
}
function AssessmentEditor({
  examId,
  courseId,
  unitId,
  courses,
}: {
  examId?: string;
  courseId?: string;
  unitId?: string;
  courses: CourseContext[];
}) {
  const actor = useActor(),
    tr = useP7();
  const q = useQuery({
    queryKey: ["p7", "assessment-design", actor, examId],
    enabled: !!examId,
    queryFn: () =>
      schoolRpc<Design>("school_assessment", {
        action: "design",
        payload: { exam_id: examId },
      }),
  });
  if (examId && !q.data)
    return (
      <>
        <ErrorNotice error={q.error} />
        <p role="status">{tr("Opening assessment…")}</p>
      </>
    );
  return (
    <Builder
      key={examId ?? "new"}
      initial={q.data}
      courseId={courseId}
      unitId={unitId}
      courses={courses}
    />
  );
}
function Builder({
  initial,
  courseId,
  unitId,
  courses,
}: {
  initial?: Design;
  courseId?: string;
  unitId?: string;
  courses: CourseContext[];
}) {
  const tr = useP7(),
    actor = useActor(),
    router = useRouter(),
    refresh = useRefresh();
  const [eid, setEid] = useState(initial?.exam.id ?? ""),
    [cid, setCid] = useState(initial?.exam.course_id ?? courseId ?? ""),
    [step, setStep] = useState(
      initial?.exam.status && initial.exam.status !== "DRAFT" ? 5 : 0,
    ),
    [values, setValues] = useState({
      title: initial?.exam.title ?? "",
      kind: initial?.design.kind ?? "QUIZ",
      unit_id: initial?.design.unit_id ?? unitId ?? "",
      duration_minutes: initial?.design.duration_minutes ?? 60,
      instructions:
        initial?.design.instructions ?? initial?.exam.description ?? "",
      result_mode: initial?.design.result_mode ?? "FEEDBACK",
      starts_at: localTime(initial?.exam.starts_at),
      ends_at: localTime(initial?.exam.ends_at),
    }),
    [blueprint, setBlueprint] = useState<Blueprint[]>(
      initial?.design.blueprint ?? [],
    ),
    [setId, setSetId] = useState(""),
    [chosen, setChosen] = useState<string[]>(
      initial?.items.map((i) => i.question_id) ?? [],
    ),
    [bankOpen, setBankOpen] = useState(false);
  const ctx = useQuery({
    queryKey: ["p7", "assessment-course", actor, cid],
    enabled: !!cid,
    queryFn: () =>
      schoolRpc<AssessmentCourse>("school_assessment", {
        action: "course",
        payload: { course_id: cid },
      }),
  });
  const design = useQuery({
    queryKey: ["p7", "assessment-design", actor, eid],
    enabled: !!eid,
    initialData: initial,
    queryFn: () =>
      schoolRpc<Design>("school_assessment", {
        action: "design",
        payload: { exam_id: eid },
      }),
  });
  const bank = useQuery({
    queryKey: ["question-bank", actor, setId],
    enabled: !!cid && step === 2,
    queryFn: () =>
      schoolRpc<{
        sets: {
          id: string;
          title: string;
          course_id: string;
          usage_scope: string;
        }[];
        items: (QuestionContent & { id: string; review_status: string })[];
      }>("school_question_bank", { set_uuid: setId || null }),
  });
  const save = useMutation({
    mutationFn: () =>
      schoolRpc<{ id: string }>("school_assessment", {
        action: "save",
        payload: {
          ...values,
          exam_id: eid || null,
          course_id: cid,
          unit_id: values.unit_id || null,
          starts_at: values.starts_at
            ? new Date(values.starts_at).toISOString()
            : null,
          ends_at: values.ends_at
            ? new Date(values.ends_at).toISOString()
            : null,
          blueprint,
        },
      }),
    onSuccess: async (r) => {
      setEid(r.id);
      await refresh();
    },
  });
  const manage = useMutation({
    mutationFn: ({
      action,
      payload = {},
    }: {
      action: string;
      payload?: unknown;
    }) => schoolRpc("school_exam_manage", { action, exam_uuid: eid, payload }),
    onSuccess: refresh,
  });
  const map = useMutation({
    mutationFn: ({
      item_id,
      outcome_id,
    }: {
      item_id: string;
      outcome_id: string;
    }) =>
      schoolRpc("school_assessment", {
        action: "map_question",
        payload: { exam_id: eid, item_id, outcome_id },
      }),
    onSuccess: refresh,
  });
  const editable = !design.data || design.data.exam.status === "DRAFT";
  const change = <K extends keyof typeof values>(
    key: K,
    value: (typeof values)[K],
  ) => setValues((v) => ({ ...v, [key]: value }));
  const stepNames = [
    tr("Purpose"),
    tr("Blueprint"),
    tr("Questions"),
    tr("Session"),
    tr("Review"),
    tr("Live & results"),
  ];
  return (
    <section className="p7" data-testid="assessment-builder">
      <Link
        href={`/dashboard/exams${cid ? `?course=${cid}` : ""}`}
        className="p7-back"
      >
        <ArrowLeft size={16} />
        {tr("All assessments")}
      </Link>
      <header className="p7-hero compact">
        <div>
          <p className="ose-eyebrow">ASSESSMENT STUDIO</p>
          <h1>{values.title || tr("Design with a purpose.")}</h1>
          <p>
            {ctx.data?.context.academic_year} › {ctx.data?.context.term} ›{" "}
            {ctx.data?.context.subject} › {ctx.data?.context.classroom}
          </p>
        </div>
        <Target className="p7-icon" />
      </header>
      <nav className="p7-stepper">
        {stepNames.map((label, i) => (
          <button
            key={i}
            aria-current={step === i ? "step" : undefined}
            disabled={i > 0 && !eid}
            onClick={() => setStep(i)}
          >
            <span>{i + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      <ErrorNotice
        error={
          ctx.error ?? design.error ?? save.error ?? manage.error ?? map.error
        }
      />
      {step < 4 && (
        <div className="p7-note">
          {editable
            ? tr(
                "Save the draft before moving on. Changes stay private until the assessment is published.",
              )
            : tr(
                "The published assessment and paper are locked. Create a linked retake for another attempt.",
              )}
        </div>
      )}
      {step === 0 && (
        <div className="p7-form">
          <Select
            label={tr("Assigned class")}
            value={cid}
            disabled={!!eid}
            onChange={(e) => {
              setCid(e.target.value);
              change("unit_id", "");
              setBlueprint([]);
            }}
          >
            <option value="">{tr("Choose a class")}</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.term}
              </option>
            ))}
          </Select>
          <Input
            label={tr("Assessment title")}
            value={values.title}
            disabled={!editable}
            onChange={(e) => change("title", e.target.value)}
            minLength={2}
            maxLength={200}
          />
          <Select
            label={tr("Purpose")}
            value={values.kind}
            disabled={!editable}
            onChange={(e) => change("kind", e.target.value)}
          >
            {[
              ["QUIZ", tr("Practice quiz")],
              ["DIAGNOSTIC", tr("Diagnostic")],
              ["TEST", tr("Unit test")],
              ["EXAM", tr("Formal exam")],
              ["RETAKE", tr("Retake")],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Select
            label={tr("Linked learning unit")}
            value={values.unit_id}
            disabled={!editable}
            onChange={(e) => change("unit_id", e.target.value)}
          >
            <option value="">{tr("Class-wide assessment")}</option>
            {ctx.data?.units.map((u) => (
              <option value={u.id} key={u.id}>
                {u.title}
              </option>
            ))}
          </Select>
          <p>
            {tr(
              "Participants are inherited from the class and unit audience at publication.",
            )}
          </p>
        </div>
      )}
      {step === 1 && (
        <div className="p7-form">
          <h2>{tr("Coverage before question count")}</h2>
          <p>
            {tr(
              "Plan the number of questions and percentage weight for each mapped goal. Leave empty for an assessment without a curriculum blueprint.",
            )}
          </p>
          <div className="p7-blueprint">
            {ctx.data?.outcomes.map((o) => {
              const b = blueprint.find((v) => v.outcome_id === o.id);
              return (
                <div key={o.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!!b}
                      disabled={!editable}
                      onChange={(e) =>
                        setBlueprint((v) =>
                          e.target.checked
                            ? [...v, { outcome_id: o.id, count: 1, weight: 0 }]
                            : v.filter((b) => b.outcome_id !== o.id),
                        )
                      }
                    />
                    <span>
                      <b>{o.code}</b> {o.name}
                    </span>
                  </label>
                  {b && (
                    <>
                      <Input
                        type="number"
                        label={tr("Questions")}
                        min={1}
                        max={100}
                        value={b.count}
                        disabled={!editable}
                        onChange={(e) =>
                          setBlueprint((v) =>
                            v.map((b) =>
                              b.outcome_id === o.id
                                ? { ...b, count: Number(e.target.value) }
                                : b,
                            ),
                          )
                        }
                      />
                      <Input
                        type="number"
                        label={tr("Weight %")}
                        min={0.01}
                        max={100}
                        step="0.01"
                        value={b.weight}
                        disabled={!editable}
                        onChange={(e) =>
                          setBlueprint((v) =>
                            v.map((b) =>
                              b.outcome_id === o.id
                                ? { ...b, weight: Number(e.target.value) }
                                : b,
                            ),
                          )
                        }
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <strong>
            {tr("Planned weight")}:{" "}
            {blueprint.reduce((s, b) => s + b.weight, 0)} / 100%
          </strong>
        </div>
      )}
      {step === 2 && (
        <>
          <h2>{tr("Compose the assessment paper")}</h2>
          {editable && (
            <>
              <Button variant="ghost" onClick={() => setBankOpen((v) => !v)}>
                <Plus size={16} />
                {tr("Write / review questions / AI draft")}
              </Button>
              {bankOpen && <QuestionWorkspace courseId={cid} />}
              <Select
                aria-label={tr("Approved question collection")}
                value={setId}
                onChange={(e) => setSetId(e.target.value)}
              >
                <option value="">{tr("Choose a bank from this class")}</option>
                {bank.data?.sets
                  .filter(
                    (s) =>
                      s.course_id === cid &&
                      (values.kind !== "QUIZ" || s.usage_scope === "PRACTICE"),
                  )
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} · {s.usage_scope}
                    </option>
                  ))}
              </Select>
              <ErrorNotice error={bank.error} />
              <div className="p7-checkboxes">
                {bank.data?.items
                  .filter((i) => i.review_status === "APPROVED")
                  .map((i) => (
                    <label key={i.id}>
                      <input
                        type="checkbox"
                        checked={chosen.includes(i.id)}
                        onChange={(e) =>
                          setChosen((v) =>
                            e.target.checked
                              ? [...v, i.id]
                              : v.filter((id) => id !== i.id),
                          )
                        }
                      />
                      {i.prompt}
                    </label>
                  ))}
              </div>
              <Button
                disabled={!chosen.length || manage.isPending}
                onClick={() =>
                  manage.mutate({ action: "questions", payload: chosen })
                }
              >
                {tr("Save paper selection")} ({chosen.length})
              </Button>
            </>
          )}
          <div className="p7-checks">
            {design.data?.items.map((i) => (
              <article className="p7-record" key={i.id}>
                <strong>
                  {i.position}. {i.content.prompt}
                </strong>
                <QuestionDiagram diagram={i.content.diagram} />
                {blueprint.length > 0 && (
                  <Select
                    label={tr("Assessed goal")}
                    value={i.content.outcome_id ?? ""}
                    disabled={!editable || map.isPending}
                    onChange={(e) =>
                      map.mutate({ item_id: i.id, outcome_id: e.target.value })
                    }
                  >
                    <option value="">{tr("Map to a blueprint goal")}</option>
                    {blueprint.map((b) => (
                      <option key={b.outcome_id} value={b.outcome_id}>
                        {
                          ctx.data?.outcomes.find((o) => o.id === b.outcome_id)
                            ?.name
                        }
                      </option>
                    ))}
                  </Select>
                )}
              </article>
            ))}
          </div>
          <p>
            {tr(
              "Published questions are copied into an immutable paper. AI drafts require teacher approval.",
            )}
          </p>
        </>
      )}
      {step === 3 && (
        <div className="p7-form">
          <div className="p7-form-grid">
            <Input
              type="datetime-local"
              label={tr("Window opens")}
              value={values.starts_at}
              disabled={!editable}
              onChange={(e) => change("starts_at", e.target.value)}
            />
            <Input
              type="datetime-local"
              label={tr("Window closes")}
              value={values.ends_at}
              disabled={!editable}
              onChange={(e) => change("ends_at", e.target.value)}
            />
            <Input
              type="number"
              label={tr("Duration in minutes")}
              min={1}
              max={480}
              value={values.duration_minutes}
              disabled={!editable}
              onChange={(e) =>
                change("duration_minutes", Number(e.target.value))
              }
            />
            <Select
              label={tr("Release content")}
              value={values.result_mode}
              disabled={!editable}
              onChange={(e) => change("result_mode", e.target.value)}
            >
              <option value="SCORE">{tr("Score only")}</option>
              <option value="FEEDBACK">{tr("Score and feedback")}</option>
              <option value="DISCUSSION">
                {tr("Score, feedback and solutions after all sessions")}
              </option>
            </Select>
          </div>
          <FormField label={tr("Student instructions")}>
            <textarea
              rows={6}
              value={values.instructions}
              disabled={!editable}
              maxLength={10000}
              onChange={(e) => change("instructions", e.target.value)}
            />
          </FormField>
          <p>
            {tr(
              "One attempt per assessment. Use a linked retake for another opportunity. Individual extra time is managed privately in the session view.",
            )}
          </p>
        </div>
      )}
      {step === 4 && (
        <>
          <h2>{tr("Ready to publish?")}</h2>
          <div className="p7-metrics">
            <article>
              <strong>{design.data?.items.length ?? 0}</strong>
              <span>{tr("Approved questions")}</span>
            </article>
            <article>
              <strong>{blueprint.length}</strong>
              <span>{tr("Learning goals")}</span>
            </article>
            <article>
              <strong>{ctx.data?.context.participants ?? 0}</strong>
              <span>{tr("Class learners before audience filtering")}</span>
            </article>
          </div>
          <div className="p7-checks">
            {design.data?.issues.length ? (
              design.data.issues.map((issue) => (
                <p className="p7-error" key={issue}>
                  {issueLabel(issue, tr)}
                </p>
              ))
            ) : (
              <p className="p7-success">
                <CheckCircle2 size={18} />
                {tr("All readiness checks pass.")}
              </p>
            )}
          </div>
          <details>
            <summary>{tr("Preview student paper")}</summary>
            {design.data?.items.map((i) => (
              <article className="p7-record" key={i.id}>
                <h3>
                  {i.position}. {i.content.prompt}
                </h3>
                <QuestionDiagram diagram={i.content.diagram} />
                {i.content.options.map((o, n) => (
                  <p key={n}>
                    {String.fromCharCode(65 + n)}. {o}
                  </p>
                ))}
              </article>
            ))}
          </details>
          <Button
            disabled={
              !editable ||
              !!design.data?.issues.length ||
              !design.data ||
              manage.isPending
            }
            onClick={() => manage.mutate({ action: "publish" })}
          >
            <ShieldCheck size={17} />
            {tr("Publish assessment")}
          </Button>
        </>
      )}
      {step === 5 && eid && (
        <LiveResults
          examId={eid}
          courseId={cid}
          status={design.data?.exam.status ?? "DRAFT"}
        />
      )}
      {editable && step < 4 && (
        <div className="p7-toolbar">
          <Button
            disabled={!cid || values.title.trim().length < 2 || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "…" : tr("Save draft")}
          </Button>
          <Button
            variant="ghost"
            disabled={!eid}
            onClick={() => setStep((s) => s + 1)}
          >
            {tr("Next step")}
            <ArrowRight size={16} />
          </Button>
          {save.isSuccess && <span role="status">{tr("Draft saved")}</span>}
        </div>
      )}
      <div className="p7-links">
        <Link href={`/dashboard/learning?course=${cid}`}>
          {tr("Return to Class Studio")} ↗
        </Link>
        <Button variant="ghost" onClick={() => router.refresh()}>
          {tr("Refresh workspace")}
        </Button>
      </div>
    </section>
  );
}
function localTime(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function issueLabel(issue: string, tr: ReturnType<typeof useP7>) {
  if (issue.startsWith("coverage:"))
    return tr("Question coverage does not match a blueprint goal.");
  return (
    {
      schedule: tr("Set a valid future exam window."),
      questions: tr("Add approved questions."),
      class_draft: tr("Publish the class space first."),
      unit_draft: tr("Publish the linked learning unit."),
      participants: tr(
        "No eligible participants. Review the class and unit audience.",
      ),
      weights: tr("Blueprint weights must total 100%."),
      unmapped_questions: tr("Map every question to a blueprint goal."),
    }[issue] ?? issue
  );
}
type LiveRow = {
  student_id: string;
  full_name: string;
  attempt_id: string | null;
  status: string;
  saved_at: string | null;
  submitted_at: string | null;
  deadline: string | null;
  score: number | null;
  reviewed_at: string | null;
  released_at: string | null;
  extra_minutes: number;
};
function LiveResults({
  examId,
  courseId,
  status,
}: {
  examId: string;
  courseId: string;
  status: string;
}) {
  const tr = useP7(),
    actor = useActor(),
    refresh = useRefresh(),
    router = useRouter();
  const [review, setReview] = useState<ExamState | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [accommodate, setAccommodate] = useState<LiveRow | null>(null);
  const q = useQuery({
    queryKey: ["p7", "exam-live", actor, examId],
    queryFn: () =>
      schoolRpc<LiveRow[]>("school_assessment", {
        action: "live",
        payload: { exam_id: examId },
      }),
    refetchInterval: 15000,
  });
  const act = useMutation({
    mutationFn: ({
      action,
      payload = {},
    }: {
      action: string;
      payload?: Record<string, unknown>;
    }) =>
      schoolRpc<{ id: string; course_id?: string }>("school_assessment", {
        action,
        payload: { exam_id: examId, ...payload },
      }),
    onSuccess: async (r, v) => {
      await refresh();
      setAccommodate(null);
      if (v.action === "remedial")
        router.push(`/dashboard/learning?course=${r.course_id}`);
      if (v.action === "retake")
        router.push(`/dashboard/exams?exam=${r.id}&course=${r.course_id}`);
    },
  });
  const inspect = useMutation({
    mutationFn: (id: string) =>
      schoolRpc<ExamState>("school_exam_state", { attempt_uuid: id }),
    onSuccess: setReview,
  });
  const grade = useMutation({
    mutationFn: (p: Record<string, unknown>) =>
      schoolRpc("school_exam_grade", p),
    onSuccess: async () => {
      setReview(null);
      await refresh();
    },
  });
  const close = useMutation({
    mutationFn: () =>
      schoolRpc("school_exam_manage", { action: "close", exam_uuid: examId }),
    onSuccess: refresh,
  });
  return (
    <>
      <h2>{tr("Live session & result review")}</h2>
      <p>
        {tr(
          "A stale save timestamp is a support signal, not a cheating decision.",
        )}
      </p>
      <ErrorNotice
        error={
          q.error ?? act.error ?? inspect.error ?? grade.error ?? close.error
        }
      />
      <div className="p7-metrics">
        {["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "GRADED"].map((s) => (
          <article key={s}>
            <strong>{q.data?.filter((a) => a.status === s).length ?? 0}</strong>
            <span>{s.replaceAll("_", " ")}</span>
          </article>
        ))}
      </div>
      <div className="p7-live-list">
        {q.data?.map((a) => (
          <article className="p7-record" key={a.student_id}>
            <label className="p7-consent">
              <input
                type="checkbox"
                disabled={!a.released_at}
                checked={selected.includes(a.student_id)}
                onChange={(e) =>
                  setSelected((v) =>
                    e.target.checked
                      ? [...v, a.student_id]
                      : v.filter((id) => id !== a.student_id),
                  )
                }
              />
              <h3>{a.full_name}</h3>
            </label>
            <span className="p7-tag">{a.status.replaceAll("_", " ")}</span>
            <p>
              {a.saved_at
                ? `${tr("Last server save")}: ${new Date(a.saved_at).toLocaleTimeString()}`
                : tr("Has not started")}
            </p>
            {a.score != null && (
              <strong>
                {a.score}/100 ·{" "}
                {a.released_at ? tr("Released") : tr("Private draft")}
              </strong>
            )}
            <div className="p7-toolbar">
              {a.attempt_id && (
                <>
                  <Button
                    variant="ghost"
                    disabled={inspect.isPending}
                    onClick={() => inspect.mutate(a.attempt_id!)}
                  >
                    {tr("Review")}
                  </Button>
                  <Button
                    disabled={
                      !a.reviewed_at ||
                      a.status !== "GRADED" ||
                      !!a.released_at ||
                      act.isPending
                    }
                    onClick={() =>
                      act.mutate({
                        action: "release",
                        payload: { attempt_id: a.attempt_id },
                      })
                    }
                  >
                    {tr("Release result")}
                  </Button>
                </>
              )}
              <Button variant="ghost" onClick={() => setAccommodate(a)}>
                {tr("Extra time")}
              </Button>
            </div>
          </article>
        ))}
      </div>
      <div className="p7-toolbar">
        <Button
          disabled={!selected.length || act.isPending}
          onClick={() =>
            act.mutate({
              action: "remedial",
              payload: {
                title: tr("Follow-up learning"),
                description: tr(
                  "Review the result and practise the selected learning goals.",
                ),
                student_ids: selected,
              },
            })
          }
        >
          {tr("Prepare follow-up in Learning")} ({selected.length})
        </Button>
        <Button
          variant="ghost"
          disabled={act.isPending}
          onClick={() => act.mutate({ action: "retake" })}
        >
          {tr("Create linked retake")}
        </Button>
        {status === "PUBLISHED" && (
          <Button
            variant="ghost"
            disabled={close.isPending}
            onClick={() => {
              if (
                confirm(
                  tr(
                    "Close this exam now? Only answers already saved may be submitted.",
                  ),
                )
              )
                close.mutate();
            }}
          >
            {tr("Close session")}
          </Button>
        )}
      </div>
      <p>
        {tr(
          "Follow-up remains a draft for teacher review. Original results are retained.",
        )}
      </p>
      {accommodate && (
        <form
          className="p7-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            act.mutate({
              action: "accommodation",
              payload: {
                student_id: accommodate.student_id,
                extra_minutes: Number(f.get("extra")),
                reason: f.get("reason"),
              },
            });
          }}
        >
          <h3>{accommodate.full_name}</h3>
          <Input
            type="number"
            name="extra"
            label={tr("Additional minutes")}
            min={0}
            max={480}
            defaultValue={accommodate.extra_minutes}
            required
          />
          <Input
            name="reason"
            label={tr("Private reason (recorded in the audit trail)")}
            minLength={3}
            maxLength={2000}
            required
          />
          <Button type="submit" disabled={act.isPending}>
            {tr("Save accommodation")}
          </Button>
        </form>
      )}
      {review && (
        <FocusPanel onClose={() => setReview(null)}>
          <div className="p7-section-head">
            <h2>{tr("Review before release")}</h2>
            <Button
              variant="ghost"
              onClick={() => setReview(null)}
              aria-label={tr("Close review")}
            >
              <X />
            </Button>
          </div>
          <form
            className="p7-review-layout"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              grade.mutate({
                attempt_uuid: review.attempt.id,
                final_score: Number(f.get("score")),
                note: f.get("feedback"),
              });
            }}
          >
            <article>
              {review.questions.map((q) => (
                <div className="p7-content-block" key={q.id}>
                  <h3>
                    {q.position}. {q.content.prompt}
                  </h3>
                  <p>
                    {tr("Learner answer")}:{" "}
                    {review.attempt.answers[q.id] ?? "—"}
                  </p>
                  <details>
                    <summary>{tr("Answer / rubric")}</summary>
                    <p>{q.content.answer}</p>
                  </details>
                </div>
              ))}
            </article>
            <aside className="p7-form">
              <Input
                name="score"
                label={tr("Final score / 100")}
                type="number"
                min={0}
                max={100}
                step="0.01"
                required
                defaultValue={review.attempt.score ?? ""}
              />
              <FormField label={tr("Feedback draft")}>
                <textarea
                  name="feedback"
                  rows={8}
                  maxLength={10000}
                  defaultValue={review.attempt.feedback ?? ""}
                />
              </FormField>
              <ErrorNotice error={grade.error} />
              <Button
                type="submit"
                disabled={
                  grade.isPending || review.attempt.status === "IN_PROGRESS"
                }
              >
                {tr("Save reviewed draft")}
              </Button>
              <p>
                {tr(
                  "This does not publish the result. Use Release result after review.",
                )}
              </p>
            </aside>
          </form>
        </FocusPanel>
      )}
      <Link href={`/dashboard/learning?course=${courseId}`}>
        {tr("Open linked learning")} ↗
      </Link>
    </>
  );
}
