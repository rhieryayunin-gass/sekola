"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Eye,
  Layers3,
  Plus,
  Send,
  Target,
  X,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { schoolRpc, type SchoolRow } from "../../lib/school";
import { createClient } from "../../lib/supabase/client";
import { Button, Input, Select } from "../ui";
import { RecordForm } from "../school/record-workspace";
import { learningSpecs } from "../school/resource-specs";
import { LibraryResource } from "../school/library-resource";
import { QuestionWorkspace } from "../school/question-workspace";
import { CurriculumLearning } from "../curriculum/curriculum-learning";
import { LearningMediaLink } from "../media/learning-media-link";
import {
  FocusPanel,
  ErrorNotice,
  FormField,
  textData,
  cleanData,
  useActor,
  useP7,
  useRefresh,
} from "./shared";
export type CourseContext = {
  id: string;
  name: string;
  classroom: string;
  subject: string;
  academic_year: string;
  term: string;
  classroom_id: string;
  subject_id: string;
  semester_id: string;
  academic_year_id: string;
  can_manage: boolean;
  studio_status: string;
  student_id: string | null;
  participants: number;
  is_template: boolean;
};
type Unit = {
  id: string;
  title: string;
  description: string;
  position: number;
  week: number | null;
  outcome_ids: string[];
  student_ids: string[];
  published: boolean;
  source_exam_id?: string;
};
type Block = {
  type: "TEXT" | "REFLECTION" | "LIBRARY";
  text?: string;
  library_id?: string;
};
type Lesson = {
  id: string;
  unit_id: string | null;
  title: string;
  material: string;
  blocks: Block[];
  scheduled_at: string | null;
  is_published: boolean;
  opened_at: string | null;
  completed_at: string | null;
  content_version: number;
  attachment_url?: string;
};
type Assignment = {
  id: string;
  unit_id: string | null;
  title: string;
  instructions: string;
  due_at: string | null;
  max_score: number;
  rubric: string;
  is_published: boolean;
};
type Submission = {
  id: string;
  assignment_id: string;
  student_name: string;
  content: string;
  attachment_url: string | null;
  revision: number;
  workflow_status: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  score: number | null;
  feedback: string | null;
  draft_score: number | null;
  draft_feedback: string | null;
  draft_decision: string | null;
};
export type StudioState = {
  context: CourseContext;
  units: Unit[];
  lessons: Lesson[];
  assignments: Assignment[];
  submissions: Submission[];
  roster: { id: string; name: string }[];
  outcomes: { id: string; name: string; code: string; program: string }[];
};
type Home = {
  today: {
    id: string;
    course_id: string;
    course: string;
    title: string;
    kind: string;
    date: string | null;
  }[];
  courses: CourseContext[];
  templates: CourseContext[];
  candidates: {
    id: string;
    subject: string;
    classroom: string;
    academic_year: string;
    term: string;
  }[];
};
export function ClassStudio() {
  const tr = useP7(),
    actor = useActor(),
    params = useSearchParams(),
    router = useRouter(),
    refresh = useRefresh();
  const selected = params.get("course");
  const home = useQuery({
    queryKey: ["p7", "studio-home", actor],
    enabled: !!actor,
    queryFn: () => schoolRpc<Home>("school_studio", { action: "home" }),
  });
  const prepare = useMutation({
    mutationFn: (id: string) =>
      schoolRpc<CourseContext>("school_studio", {
        action: "prepare",
        payload: { id },
      }),
    onSuccess: async (c) => {
      await refresh();
      router.push(`/dashboard/learning?course=${c.id}`);
    },
  });
  if (selected)
    return (
      <ClassCanvas
        key={`${actor}:${selected}`}
        courseId={selected}
        courses={[
          ...(home.data?.courses ?? []),
          ...(home.data?.templates ?? []),
        ]}
      />
    );
  return (
    <section className="p7" data-testid="class-studio">
      <header className="p7-hero">
        <div>
          <p className="ose-eyebrow">O-LEARNING</p>
          <h1>{tr("Your next learning moment.")}</h1>
          <p>
            {tr(
              "Class Studio brings your classes, activities and feedback into one place.",
            )}
          </p>
        </div>
        <BookOpen className="p7-hero-icon" />
      </header>
      <ErrorNotice error={home.error ?? prepare.error} />
      {home.isPending && <p role="status">{tr("Preparing your classes…")}</p>}
      {home.data?.today.length ? (
        <>
          <div className="p7-section-head">
            <h2>{tr("Your focus today")}</h2>
            <span className="p7-tag">{home.data.today.length}</span>
          </div>
          <div className="p7-card-grid">
            {home.data.today.map((item) => (
              <Link
                className="p7-choice"
                key={`${item.kind}:${item.id}`}
                href={`/dashboard/learning?course=${item.course_id}&${item.kind === "REVIEW" ? "review" : "activity"}=${item.id}&kind=${item.kind === "CONTINUE" ? "lesson" : "assignment"}`}
              >
                <span className="p7-tag">
                  {tr(
                    (
                      {
                        REVIEW: "Ready for your review",
                        TASK: "Your next task",
                        CONTINUE: "Continue learning",
                        FEEDBACK: "Released feedback",
                      } as Record<string, string>
                    )[item.kind],
                  )}
                </span>
                <h3>{item.title}</h3>
                <p>{item.course}</p>
                {item.date && (
                  <small>{new Date(item.date).toLocaleString()}</small>
                )}
                <ArrowRight size={18} />
              </Link>
            ))}
          </div>
        </>
      ) : null}
      <div className="p7-card-grid">
        {home.data?.courses.map((c) => (
          <Link
            className="p7-choice"
            key={c.id}
            href={`/dashboard/learning?course=${c.id}`}
          >
            <span className="p7-tag">{c.classroom}</span>
            <h2>{c.subject}</h2>
            <p>
              {c.academic_year} · {c.term}
            </p>
            <div className="p7-pills">
              <span>
                {c.studio_status === "LIVE" ? tr("Live") : tr("Draft space")}
              </span>
              <span>
                {c.participants} {tr("learners")}
              </span>
            </div>
            <ArrowRight />
          </Link>
        ))}
      </div>
      {home.data?.candidates.length ? (
        <>
          <h2>{tr("Your spaces are ready to prepare")}</h2>
          <p>
            {tr(
              "Inherited from O-Academic. Review the class and publish your first activity.",
            )}
          </p>
          <div className="p7-card-grid">
            {home.data.candidates.map((c) => (
              <article key={c.id} className="p7-record">
                <GraduationCard subject={c.subject} classroom={c.classroom} />
                <p>
                  {c.academic_year} · {c.term}
                </p>
                <Button
                  disabled={prepare.isPending}
                  onClick={() => prepare.mutate(c.id)}
                >
                  {tr("Prepare space")}
                </Button>
              </article>
            ))}
          </div>
        </>
      ) : null}
      {home.data &&
        !home.data.courses.length &&
        !home.data.candidates.length && (
          <div className="p7-empty">
            <Layers3 />
            <h2>{tr("Your school is preparing your classes")}</h2>
            <p>
              {tr(
                "Your Academic assignment determines the classes you can access.",
              )}
            </p>
            <Link href="/dashboard/connect">
              {tr("Ask your school team")} ↗
            </Link>
          </div>
        )}
    </section>
  );
}
function GraduationCard({
  subject,
  classroom,
}: {
  subject: string;
  classroom: string;
}) {
  return (
    <>
      <span className="p7-tag">{classroom}</span>
      <h3>{subject}</h3>
    </>
  );
}
function ClassCanvas({
  courseId,
  courses,
}: {
  courseId: string;
  courses: CourseContext[];
}) {
  const tr = useP7(),
    actor = useActor(),
    refresh = useRefresh(),
    params = useSearchParams();
  const [view, setView] = useState("units"),
    [tab, setTab] = useState("journey"),
    [preview, setPreview] = useState(false),
    [editing, setEditing] = useState<{
      kind: "unit" | "lesson" | "assignment";
      row?: Unit | Lesson | Assignment;
      unit?: string;
    } | null>(null),
    [detail, setDetail] = useState<{
      kind: "lesson" | "assignment";
      id: string;
    } | null>(
      params.get("activity")
        ? {
            kind: params.get("kind") === "lesson" ? "lesson" : "assignment",
            id: params.get("activity")!,
          }
        : null,
    ),
    [grading, setGrading] = useState<string | null>(params.get("review")),
    [source, setSource] = useState("");
  const q = useQuery({
    queryKey: ["p7", "studio", actor, courseId],
    queryFn: () =>
      schoolRpc<StudioState>("school_studio", {
        action: "state",
        payload: { course_id: courseId },
      }),
  });
  const library = useQuery({
    queryKey: ["p7", "library", actor],
    queryFn: async () => {
      const r = await createClient()
        .from("school_library")
        .select("*")
        .limit(500);
      if (r.error) throw r.error;
      return r.data as SchoolRow[];
    },
  });
  const act = useMutation({
    mutationFn: ({
      action,
      payload = {},
    }: {
      action: string;
      payload?: Record<string, unknown>;
    }) =>
      schoolRpc("school_studio", {
        action,
        payload: { ...payload, course_id: courseId },
      }),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
  });
  const d = q.data;
  if (!d)
    return (
      <>
        <ErrorNotice error={q.error} />
        {q.isPending && <p role="status">{tr("Opening your class…")}</p>}
      </>
    );
  const manager = d.context.can_manage && !preview;
  const todayTasks = d.assignments.filter(
    (a) =>
      a.is_published &&
      !d.submissions.some(
        (s) =>
          s.assignment_id === a.id &&
          ["SUBMITTED", "COMPLETED"].includes(s.workflow_status),
      ),
  );
  const reviews = d.submissions.filter(
    (s) => s.workflow_status === "SUBMITTED",
  );
  const units = d.units
    .filter((u) => manager || u.published)
    .sort((a, b) =>
      view === "weeks"
        ? (a.week ?? 60) - (b.week ?? 60)
        : a.position - b.position,
    );
  const groups: [string, Unit | undefined][] = [
    ...units.map((u) => [u.id, u] as [string, Unit]),
    ...(d.lessons.some((l) => !l.unit_id) ||
    d.assignments.some((a) => !a.unit_id)
      ? [["existing", undefined] as [string, undefined]]
      : []),
  ];
  const renderActivity = (
    item: Lesson | Assignment,
    kind: "lesson" | "assignment",
  ) => (
    <button
      key={item.id}
      className="p7-activity"
      onClick={() => {
        setDetail({ kind, id: item.id });
        if (kind === "lesson" && !manager && !preview)
          act.mutate({ action: "progress", payload: { id: item.id } });
      }}
    >
      {kind === "lesson" ? <BookOpen size={20} /> : <ClipboardList size={20} />}
      <div>
        <strong>{item.title}</strong>
        <small>
          {kind === "lesson" ? tr("Material") : tr("Assignment")} ·{" "}
          {item.is_published ? tr("Published") : tr("Draft")}
        </small>
      </div>
      <ChevronTag />
    </button>
  );
  return (
    <section className="p7" data-testid="class-canvas">
      <Link href="/dashboard/learning" className="p7-back">
        <ArrowLeft size={16} />
        {tr("All classes")}
      </Link>
      <div className="p7-context">
        <span>{d.context.academic_year}</span>
        <span>{d.context.term}</span>
        <span>{d.context.subject}</span>
        <strong>{d.context.classroom}</strong>
        <Link href="/dashboard/academic">{tr("Source settings")} ↗</Link>
      </div>
      <header className="p7-hero compact">
        <div>
          <p className="ose-eyebrow">
            {manager ? "CLASS STUDIO" : "MY LEARNING TODAY"}
          </p>
          <h1>{d.context.name}</h1>
          <p>
            {d.context.participants} {tr("learners · inherited from Academic")}
          </p>
        </div>
        {d.context.can_manage && (
          <Button
            variant="ghost"
            onClick={() => {
              setPreview((v) => !v);
              setDetail(null);
            }}
          >
            <Eye size={16} />
            {preview ? tr("Back to teacher") : tr("Student preview")}
          </Button>
        )}
      </header>
      {preview && (
        <p className="p7-note">
          {tr(
            "Preview of published content. Your role and saved data do not change.",
          )}
        </p>
      )}
      <ErrorNotice error={q.error ?? act.error} />
      <div className="p7-metrics">
        <button onClick={() => setTab("journey")}>
          <strong>
            {manager
              ? d.lessons.filter((l) => !l.is_published).length
              : todayTasks.length}
          </strong>
          <span>
            {manager ? tr("Activities to prepare") : tr("Tasks to do")}
          </span>
        </button>
        <button onClick={() => setTab("review")}>
          <strong>
            {manager
              ? reviews.length
              : d.submissions.filter((s) => s.reviewed_at).length}
          </strong>
          <span>{manager ? tr("Awaiting review") : tr("New feedback")}</span>
        </button>
        <article>
          <strong>{d.units.length}</strong>
          <span>{tr("Learning units")}</span>
        </article>
      </div>
      <nav className="p7-tabs">
        {[
          ["journey", tr("Learning journey")],
          [
            "review",
            manager ? tr("Review workspace") : tr("My work & feedback"),
          ],
          ...(manager
            ? [
                ["bank", tr("Question bank")],
                ["library", tr("Resource library")],
              ]
            : []),
          ["outcomes", tr("Curriculum evidence")],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-current={tab === key ? "page" : undefined}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "journey" && (
        <>
          <div className="p7-toolbar">
            <div className="p7-pills">
              {[
                ["units", tr("Units")],
                ["weeks", tr("Weeks")],
                ["list", tr("Compact list")],
              ].map(([v, l]) => (
                <button
                  aria-pressed={view === v}
                  key={v}
                  onClick={() => setView(v)}
                >
                  {l}
                </button>
              ))}
            </div>
            {manager && (
              <>
                <label className="p7-consent">
                  <input
                    type="checkbox"
                    checked={d.context.is_template}
                    disabled={act.isPending}
                    onChange={(e) =>
                      act.mutate({
                        action: "space",
                        payload: {
                          status: d.context.studio_status,
                          is_template: e.target.checked,
                        },
                      })
                    }
                  />
                  {tr("Share as school template")}
                </label>
                <Button onClick={() => setEditing({ kind: "unit" })}>
                  <Plus size={16} />
                  {tr("Add unit")}
                </Button>
                <Button
                  variant="ghost"
                  disabled={act.isPending}
                  onClick={() =>
                    act.mutate({
                      action: "space",
                      payload: {
                        status:
                          d.context.studio_status === "LIVE" ? "DRAFT" : "LIVE",
                        is_template: d.context.is_template,
                      },
                    })
                  }
                >
                  {d.context.studio_status === "LIVE"
                    ? tr("Pause class publication")
                    : tr("Publish class space")}
                </Button>
              </>
            )}
          </div>
          {!groups.length && (
            <div className="p7-empty">
              <BookOpen />
              <h2>
                {manager
                  ? tr("Start with the first unit")
                  : tr("Your teacher is preparing the first activity")}
              </h2>
              {manager && (
                <>
                  <label className="p7-consent">
                    <input
                      type="checkbox"
                      checked={d.context.is_template}
                      disabled={act.isPending}
                      onChange={(e) =>
                        act.mutate({
                          action: "space",
                          payload: {
                            status: d.context.studio_status,
                            is_template: e.target.checked,
                          },
                        })
                      }
                    />
                    {tr("Share as school template")}
                  </label>
                  <Button onClick={() => setEditing({ kind: "unit" })}>
                    {tr("Start empty")}
                  </Button>
                  <div className="p7-toolbar">
                    <Select
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      aria-label={tr("Copy structure from course")}
                    >
                      <option value="">
                        {tr("Choose previous course / template")}
                      </option>
                      {courses
                        .filter(
                          (c) =>
                            c.id !== courseId &&
                            (c.can_manage || c.is_template),
                        )
                        .map((c) => (
                          <option value={c.id} key={c.id}>
                            {c.name} · {c.academic_year}
                          </option>
                        ))}
                    </Select>
                    <Button
                      disabled={!source || act.isPending}
                      onClick={() =>
                        act.mutate({
                          action: "copy",
                          payload: { source_course_id: source },
                        })
                      }
                    >
                      {tr("Copy selected structure")}
                    </Button>
                  </div>
                  <p>
                    {tr(
                      "Dates, learners, submissions and grades are never copied.",
                    )}
                  </p>
                </>
              )}
            </div>
          )}
          <div
            className={`p7-journey-canvas ${view === "list" ? "is-list" : ""}`}
          >
            {groups.map(([id, u]) => (
              <article className="p7-unit" key={id}>
                <header>
                  <div>
                    <p className="ose-eyebrow">
                      {u
                        ? `${tr("UNIT")} ${u.position}${u.week ? ` · ${tr("WEEK")} ${u.week}` : ""}`
                        : tr("EXISTING ACTIVITIES")}
                    </p>
                    <h2>{u?.title ?? tr("From your existing workspace")}</h2>
                    <p>{u?.description}</p>
                    <div className="p7-pills">
                      {u?.outcome_ids.map((oid) => {
                        const outcome = d.outcomes.find((o) => o.id === oid);
                        return outcome ? (
                          <span key={oid}>
                            <Target size={13} />
                            {outcome.code} · {outcome.program}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>
                  {manager && u && (
                    <Button
                      variant="ghost"
                      onClick={() => setEditing({ kind: "unit", row: u })}
                    >
                      {u.published
                        ? tr("Published · edit")
                        : tr("Draft · edit")}
                    </Button>
                  )}
                </header>
                <div className="p7-unit-activities">
                  {d.lessons
                    .filter(
                      (l) =>
                        l.unit_id === (u?.id ?? null) &&
                        (manager || l.is_published),
                    )
                    .map((l) => renderActivity(l, "lesson"))}
                  {d.assignments
                    .filter(
                      (a) =>
                        a.unit_id === (u?.id ?? null) &&
                        (manager || a.is_published),
                    )
                    .map((a) => renderActivity(a, "assignment"))}
                  <Link
                    className="p7-activity p7-assessment-link"
                    href={`/dashboard/exams?course=${courseId}${u ? `&unit=${u.id}` : ""}${manager ? "&create=1" : ""}`}
                  >
                    <Target />
                    <div>
                      <strong>
                        {manager
                          ? tr("Add assessment")
                          : tr("Open linked assessments")}
                      </strong>
                      <small>
                        O-Exam <ArrowRight size={12} />
                      </small>
                    </div>
                  </Link>
                </div>
                {manager && (
                  <div className="p7-toolbar">
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setEditing({ kind: "lesson", unit: u?.id })
                      }
                    >
                      <Plus size={15} />
                      {tr("Material")}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setEditing({ kind: "assignment", unit: u?.id })
                      }
                    >
                      <Plus size={15} />
                      {tr("Assignment")}
                    </Button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}
      {tab === "review" && (
        <>
          <div className="p7-review-list">
            {d.submissions.map((s) => (
              <article key={s.id} className="p7-record">
                <span className="p7-tag">
                  {s.workflow_status.replaceAll("_", " ")}
                </span>
                <h3>
                  {d.assignments.find((a) => a.id === s.assignment_id)?.title}
                </h3>
                <p>
                  {manager
                    ? s.student_name
                    : (s.feedback ?? tr("Feedback has not been released."))}
                </p>
                {s.score != null && (
                  <strong>
                    {s.score} /{" "}
                    {
                      d.assignments.find((a) => a.id === s.assignment_id)
                        ?.max_score
                    }
                  </strong>
                )}
                <Button
                  variant="ghost"
                  onClick={() =>
                    manager
                      ? setGrading(s.id)
                      : setDetail({ kind: "assignment", id: s.assignment_id })
                  }
                >
                  {manager ? tr("Review work") : tr("Open work")}
                </Button>
              </article>
            ))}
          </div>
          {!d.submissions.length && (
            <p className="p7-empty">{tr("Submitted work will appear here.")}</p>
          )}
        </>
      )}
      {tab === "library" && manager && (
        <ClassLibrary state={d} resources={library.data ?? []} />
      )}
      {tab === "bank" && manager && <QuestionWorkspace courseId={courseId} />}
      {tab === "outcomes" && <CurriculumLearning courseId={courseId} />}
      {editing && (
        <ActivityEditor
          key={`${editing.kind}:${editing.row?.id ?? "new"}:${editing.unit}`}
          kind={editing.kind}
          row={editing.row}
          initialUnit={editing.unit}
          state={d}
          library={library.data ?? []}
          pending={act.isPending}
          error={act.error}
          onClose={() => setEditing(null)}
          onSave={(p) => act.mutate({ action: editing.kind, payload: p })}
        />
      )}
      {detail && (
        <FocusPanel onClose={() => setDetail(null)}>
          <div className="p7-section-head">
            <p className="ose-eyebrow">{tr("FOCUS MODE")}</p>
            <Button
              variant="ghost"
              onClick={() => setDetail(null)}
              aria-label={tr("Close activity")}
            >
              <X />
            </Button>
          </div>
          {detail.kind === "lesson"
            ? (() => {
                const l = d.lessons.find((v) => v.id === detail.id);
                return l ? (
                  <>
                    <h2>{l.title}</h2>
                    <p className="p7-reading">{l.material}</p>
                    {l.attachment_url &&
                      /^(https:\/\/|\/api\/media\/file\?)/.test(
                        l.attachment_url,
                      ) && (
                        <a
                          href={l.attachment_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {tr("Open attachment")} ↗
                        </a>
                      )}
                    {l.blocks.map((b, i) => (
                      <div
                        className={`p7-content-block ${b.type.toLowerCase()}`}
                        key={i}
                      >
                        {b.type === "LIBRARY" ? (
                          (() => {
                            const r = library.data?.find(
                              (r) => r.id === b.library_id,
                            );
                            return r ? (
                              <>
                                <h3>{String(r.title)}</h3>
                                <LibraryResource row={r} />
                              </>
                            ) : null;
                          })()
                        ) : (
                          <p className="p7-reading">{b.text}</p>
                        )}
                      </div>
                    ))}
                    {manager ? (
                      <Button
                        onClick={() => {
                          setEditing({ kind: "lesson", row: l });
                          setDetail(null);
                        }}
                      >
                        {tr("Edit / new version")}
                      </Button>
                    ) : (
                      <>
                        <p>
                          {l.completed_at
                            ? tr(
                                "Activity marked complete. Mastery is assessed separately.",
                              )
                            : tr(
                                "Opening this material does not indicate mastery.",
                              )}
                        </p>
                        <Button
                          disabled={preview || act.isPending}
                          onClick={() =>
                            act.mutate({
                              action: "progress",
                              payload: { id: l.id, complete: true },
                            })
                          }
                        >
                          <CheckCircle2 size={16} />
                          {tr("Mark activity complete")}
                        </Button>
                      </>
                    )}
                  </>
                ) : null;
              })()
            : (() => {
                const a = d.assignments.find((v) => v.id === detail.id);
                return a ? (
                  <>
                    <h2>{a.title}</h2>
                    <p className="p7-reading">{a.instructions}</p>
                    <p>{a.rubric}</p>
                    {manager ? (
                      <Button
                        onClick={() => {
                          setEditing({ kind: "assignment", row: a });
                          setDetail(null);
                        }}
                      >
                        {tr("Edit assignment")}
                      </Button>
                    ) : (
                      <SubmissionEditor
                        key={
                          d.submissions.find((s) => s.assignment_id === a.id)
                            ?.revision ?? "new"
                        }
                        assignment={a}
                        courseId={courseId}
                        submission={d.submissions.find(
                          (s) => s.assignment_id === a.id,
                        )}
                        disabled={preview}
                      />
                    )}
                  </>
                ) : null;
              })()}
        </FocusPanel>
      )}
      {grading && manager && d.submissions.some((s) => s.id === grading) && (
        <ReviewPanel
          key={grading}
          state={d}
          submissionId={grading}
          onClose={() => setGrading(null)}
          onNext={() => {
            const index = d.submissions.findIndex((s) => s.id === grading);
            setGrading(d.submissions[index + 1]?.id ?? null);
          }}
        />
      )}
    </section>
  );
}
function ChevronTag() {
  return <ArrowRight size={16} />;
}
function ActivityEditor({
  kind,
  row,
  initialUnit,
  state,
  library,
  pending,
  error,
  onClose,
  onSave,
}: {
  kind: "unit" | "lesson" | "assignment";
  row?: Unit | Lesson | Assignment;
  initialUnit?: string;
  state: StudioState;
  library: SchoolRow[];
  pending: boolean;
  error: unknown;
  onClose: () => void;
  onSave: (p: Record<string, unknown>) => void;
}) {
  const tr = useP7();
  const u = row as Unit | undefined,
    l = row as Lesson | undefined,
    a = row as Assignment | undefined;
  const [blocks, setBlocks] = useState<Block[]>(l?.blocks ?? []),
    [outcomes, setOutcomes] = useState(u?.outcome_ids ?? []),
    [targets, setTargets] = useState(u?.student_ids ?? []);
  const move = (i: number, j: number) =>
    setBlocks((b) => {
      const next = [...b];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  return (
    <FocusPanel onClose={onClose}>
      <form
        className="p7-form"
        onSubmit={(e) => {
          e.preventDefault();
          const values = textData(e.currentTarget);
          onSave({
            ...cleanData({
              ...values,
              ...(values.scheduled_at
                ? {
                    scheduled_at: new Date(
                      String(values.scheduled_at),
                    ).toISOString(),
                  }
                : {}),
              ...(values.due_at
                ? { due_at: new Date(String(values.due_at)).toISOString() }
                : {}),
            }),
            ...(row ? { id: row.id } : {}),
            ...(kind === "unit"
              ? {
                  outcome_ids: outcomes,
                  student_ids: targets,
                  published: values.published === "on",
                }
              : { is_published: values.is_published === "on" }),
            ...(kind === "lesson" ? { blocks } : {}),
            ...(kind === "assignment" && !row
              ? { max_score: Number(values.max_score) }
              : {}),
          });
        }}
      >
        <div className="p7-section-head">
          <h2>
            {kind === "unit"
              ? tr("Build a learning unit")
              : kind === "lesson"
                ? tr("Compose a learning page")
                : tr("Design an assignment")}
          </h2>
          <Button
            variant="ghost"
            type="button"
            onClick={onClose}
            aria-label={tr("Close editor")}
          >
            <X />
          </Button>
        </div>
        <Input
          name="title"
          label={tr("Title")}
          required
          minLength={2}
          maxLength={160}
          defaultValue={row?.title}
        />
        {kind === "unit" ? (
          <>
            <FormField label={tr("Unit overview")}>
              <textarea
                name="description"
                defaultValue={u?.description}
                maxLength={10000}
              />
            </FormField>
            <div className="p7-form-grid">
              <Input
                type="number"
                name="position"
                label={tr("Position")}
                min={1}
                max={1000}
                defaultValue={u?.position ?? state.units.length + 1}
              />
              <Input
                type="number"
                name="week"
                label={tr("Week (optional)")}
                min={1}
                max={60}
                defaultValue={u?.week ?? ""}
              />
            </div>
            <h3>{tr("Mapped learning goals")}</h3>
            <div className="p7-checkboxes">
              {state.outcomes.map((o) => (
                <label key={o.id}>
                  <input
                    type="checkbox"
                    checked={outcomes.includes(o.id)}
                    onChange={(e) =>
                      setOutcomes((v) =>
                        e.target.checked
                          ? [...v, o.id]
                          : v.filter((id) => id !== o.id),
                      )
                    }
                  />
                  {o.code} · {o.name}
                  <small>{o.program}</small>
                </label>
              ))}
            </div>
            {!state.outcomes.length && (
              <p>
                {tr("Map curriculum outcomes in Academic to link goals here.")}
              </p>
            )}
            <details>
              <summary>
                {tr("Target learners (empty means whole class)")}
              </summary>
              <div className="p7-checkboxes">
                {state.roster.map((s) => (
                  <label key={s.id}>
                    <input
                      type="checkbox"
                      checked={targets.includes(s.id)}
                      onChange={(e) =>
                        setTargets((v) =>
                          e.target.checked
                            ? [...v, s.id]
                            : v.filter((id) => id !== s.id),
                        )
                      }
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </details>
            <label>
              <input
                type="checkbox"
                name="published"
                defaultChecked={u?.published}
              />
              {tr("Publish unit")}
            </label>
          </>
        ) : (
          <>
            <Select
              name="unit_id"
              label={tr("Learning unit")}
              defaultValue={l?.unit_id ?? initialUnit ?? ""}
            >
              <option value="">{tr("General class activity")}</option>
              {state.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.title}
                </option>
              ))}
            </Select>
            {kind === "lesson" ? (
              <>
                <FormField label={tr("Introduction")}>
                  <textarea
                    name="material"
                    defaultValue={l?.material}
                    maxLength={10000}
                  />
                </FormField>
                <div className="p7-block-editor">
                  {blocks.map((b, i) => (
                    <article key={i}>
                      <div className="p7-toolbar">
                        <span>
                          {i + 1} · {b.type}
                        </span>
                        <Button
                          variant="ghost"
                          type="button"
                          disabled={i === 0}
                          onClick={() => move(i, i - 1)}
                          aria-label={tr("Move block up")}
                        >
                          <ArrowUp size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          type="button"
                          disabled={i === blocks.length - 1}
                          onClick={() => move(i, i + 1)}
                          aria-label={tr("Move block down")}
                        >
                          <ArrowDown size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={() =>
                            setBlocks((v) => v.filter((_, j) => j !== i))
                          }
                          aria-label={tr("Remove block")}
                        >
                          <X size={14} />
                        </Button>
                      </div>
                      {b.type === "LIBRARY" ? (
                        <Select
                          value={b.library_id ?? ""}
                          required
                          onChange={(e) =>
                            setBlocks((v) =>
                              v.map((b, j) =>
                                j === i
                                  ? { ...b, library_id: e.target.value }
                                  : b,
                              ),
                            )
                          }
                        >
                          <option value="">
                            {tr("Choose a reusable resource")}
                          </option>
                          {library.map((r) => (
                            <option key={r.id} value={r.id}>
                              {String(r.title)} · {String(r.kind)}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <textarea
                          value={b.text ?? ""}
                          maxLength={10000}
                          aria-label={b.type}
                          onChange={(e) =>
                            setBlocks((v) =>
                              v.map((b, j) =>
                                j === i ? { ...b, text: e.target.value } : b,
                              ),
                            )
                          }
                        />
                      )}
                    </article>
                  ))}
                </div>
                <div className="p7-toolbar">
                  {(["TEXT", "REFLECTION", "LIBRARY"] as const).map((type) => (
                    <Button
                      type="button"
                      variant="ghost"
                      key={type}
                      disabled={blocks.length >= 50}
                      onClick={() => setBlocks((v) => [...v, { type }])}
                    >
                      <Plus size={14} />
                      {type === "TEXT"
                        ? tr("Text")
                        : type === "REFLECTION"
                          ? tr("Reflection")
                          : tr("Library resource")}
                    </Button>
                  ))}
                </div>
                <LearningMediaLink />
                <Input
                  name="scheduled_at"
                  type="datetime-local"
                  label={tr("Schedule (optional)")}
                  defaultValue={toLocal(l?.scheduled_at)}
                />
                {l?.is_published && (
                  <Select
                    name="version_action"
                    required
                    label={tr("Published material change")}
                  >
                    <option value="">{tr("Choose an action")}</option>
                    <option value="NEW_VERSION">
                      {tr("Create a new version; retain history")}
                    </option>
                  </Select>
                )}
              </>
            ) : (
              <>
                <FormField label={tr("Instructions")}>
                  <textarea
                    name="instructions"
                    defaultValue={a?.instructions}
                    maxLength={10000}
                  />
                </FormField>
                <FormField label={tr("Rubric / assessment criteria")}>
                  <textarea
                    name="rubric"
                    defaultValue={a?.rubric}
                    maxLength={10000}
                  />
                </FormField>
                <Input
                  name="due_at"
                  type="datetime-local"
                  label={tr("Due date")}
                  defaultValue={toLocal(a?.due_at)}
                />
                <Input
                  name="max_score"
                  label={tr("Maximum score")}
                  type="number"
                  min={1}
                  max={10000}
                  defaultValue={a?.max_score ?? 100}
                  disabled={!!row}
                />
              </>
            )}
            <label>
              <input
                type="checkbox"
                name="is_published"
                defaultChecked={l?.is_published}
              />
              {tr("Publish activity")}
            </label>
            <p className="p7-note">
              {tr(
                "Learners only see published activities in a live class and published unit.",
              )}
            </p>
          </>
        )}
        <ErrorNotice error={error} />
        <Button disabled={pending} type="submit">
          {pending ? "…" : tr("Save activity")}
        </Button>
      </form>
    </FocusPanel>
  );
}
function toLocal(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function SubmissionEditor({
  assignment,
  courseId,
  submission,
  disabled,
}: {
  assignment: Assignment;
  courseId: string;
  submission?: Submission;
  disabled: boolean;
}) {
  const tr = useP7(),
    refresh = useRefresh();
  const [content, setContent] = useState(submission?.content ?? ""),
    [attachment, setAttachment] = useState(submission?.attachment_url ?? "");
  const locked =
    !!submission &&
    !["DRAFT", "CHANGES_REQUESTED"].includes(submission.workflow_status);
  const save = useMutation({
    mutationFn: (submit: boolean) =>
      schoolRpc("school_studio", {
        action: "submit",
        payload: {
          course_id: courseId,
          assignment_id: assignment.id,
          content,
          attachment_url: attachment,
          submit,
          revision: submission?.revision ?? 0,
        },
      }),
    onSuccess: refresh,
  });
  return (
    <div>
      <p className="p7-tag">
        {submission?.workflow_status ?? tr("Not started")}
      </p>
      {submission?.feedback && <blockquote>{submission.feedback}</blockquote>}
      <FormField label={tr("Your work")}>
        <textarea
          rows={10}
          maxLength={20000}
          value={content}
          disabled={locked || disabled}
          onChange={(e) => setContent(e.target.value)}
        />
      </FormField>
      <Input
        label={tr("School media attachment link (optional)")}
        value={attachment}
        disabled={locked || disabled}
        onChange={(e) => setAttachment(e.target.value)}
      />
      <ErrorNotice error={save.error} />
      <div className="p7-toolbar">
        <Button
          variant="ghost"
          disabled={locked || disabled || save.isPending}
          onClick={() => save.mutate(false)}
        >
          {tr("Save draft")}
        </Button>
        <Button
          disabled={
            locked ||
            disabled ||
            save.isPending ||
            (!content.trim() && !attachment)
          }
          onClick={() => save.mutate(true)}
        >
          <Send size={16} />
          {tr("Submit work")}
        </Button>
      </div>
      {save.isSuccess && <p role="status">{tr("Saved on the server.")}</p>}
      {submission && (
        <SubmissionHistory courseId={courseId} id={submission.id} />
      )}
    </div>
  );
}
function SubmissionHistory({ courseId, id }: { courseId: string; id: string }) {
  const tr = useP7(),
    actor = useActor();
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["p7", "submission-history", actor, id],
    enabled: open,
    queryFn: () =>
      schoolRpc<
        {
          revision: number;
          content: string;
          submitted_at: string | null;
          feedback: string | null;
        }[]
      >("school_studio", {
        action: "history",
        payload: { course_id: courseId, id },
      }),
  });
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{tr("Previous versions")}</summary>
      <ErrorNotice error={q.error} />
      {q.data?.map((v) => (
        <article className="p7-content-block" key={v.revision}>
          <small>
            {tr("Version")} {v.revision}
          </small>
          <p className="p7-reading">{v.content}</p>
          <p>{v.feedback}</p>
        </article>
      ))}
    </details>
  );
}
function ReviewPanel({
  state,
  submissionId,
  onClose,
  onNext,
}: {
  state: StudioState;
  submissionId: string;
  onClose: () => void;
  onNext: () => void;
}) {
  const tr = useP7(),
    refresh = useRefresh();
  const sub = state.submissions.find((s) => s.id === submissionId)!;
  const a = state.assignments.find((a) => a.id === sub.assignment_id)!;
  const act = useMutation({
    mutationFn: ({
      action,
      payload = {},
    }: {
      action: string;
      payload?: Record<string, unknown>;
    }) =>
      schoolRpc("school_studio", {
        action,
        payload: { ...payload, course_id: state.context.id, id: sub.id },
      }),
    onSuccess: refresh,
  });
  return (
    <FocusPanel onClose={onClose}>
      <div className="p7-section-head">
        <div>
          <p className="ose-eyebrow">REVIEW WORKSPACE</p>
          <h2>{sub.student_name}</h2>
          <p>{a.title}</p>
        </div>
        <Button
          variant="ghost"
          onClick={onClose}
          aria-label={tr("Close review")}
        >
          <X />
        </Button>
      </div>
      <div className="p7-review-layout">
        <article>
          <p className="p7-reading">{sub.content}</p>
          {sub.attachment_url && (
            <a href={sub.attachment_url} target="_blank" rel="noreferrer">
              {tr("Open attachment")} ↗
            </a>
          )}
          <SubmissionHistory courseId={state.context.id} id={sub.id} />
        </article>
        <form
          className="p7-form"
          onSubmit={(e) => {
            e.preventDefault();
            act.mutate({
              action: "review",
              payload: textData(e.currentTarget),
            });
          }}
        >
          <h3>{tr("Rubric")}</h3>
          <p>{a.rubric}</p>
          <Input
            name="score"
            type="number"
            label={`${tr("Score")} / ${a.max_score}`}
            min={0}
            max={a.max_score}
            step="0.01"
            required
            defaultValue={sub.draft_score ?? sub.score ?? ""}
          />
          <FormField label={tr("Feedback draft")}>
            <textarea
              name="feedback"
              rows={6}
              maxLength={10000}
              defaultValue={sub.draft_feedback ?? sub.feedback ?? ""}
            />
          </FormField>
          <Select
            name="decision"
            label={tr("Next learning step")}
            defaultValue={sub.draft_decision ?? "COMPLETED"}
          >
            <option value="COMPLETED">{tr("Complete")}</option>
            <option value="CHANGES_REQUESTED">{tr("Request revision")}</option>
          </Select>
          <ErrorNotice error={act.error} />
          <Button type="submit" disabled={act.isPending}>
            {tr("Save review draft")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={act.isPending || !sub.draft_decision}
            onClick={() => act.mutate({ action: "release" })}
          >
            {tr("Release feedback to learner")}
          </Button>
          <small>{tr("Saving a review does not publish it.")}</small>
        </form>
      </div>
      <Button variant="ghost" onClick={onNext}>
        {tr("Next learner")}
        <ArrowRight size={16} />
      </Button>
    </FocusPanel>
  );
}

function ClassLibrary({
  state,
  resources,
}: {
  state: StudioState;
  resources: SchoolRow[];
}) {
  const tr = useP7(),
    refresh = useRefresh();
  const [editing, setEditing] = useState<SchoolRow | "new" | null>(null);
  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      schoolRpc("school_save", {
        resource: "school_library",
        payload: {
          ...payload,
          course_id: state.context.id,
          subject_id: state.context.subject_id,
        },
        record_id: editing && editing !== "new" ? editing.id : null,
      }),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
  });
  return (
    <>
      <div className="p7-section-head">
        <h2>{tr("Resource library")}</h2>
        <Button onClick={() => setEditing("new")}>
          <Plus size={16} />
          {tr("Add resource")}
        </Button>
      </div>
      <LearningMediaLink />
      <ErrorNotice error={save.error} />
      <div className="p7-card-grid">
        {resources
          .filter((r) => !r.course_id || r.course_id === state.context.id)
          .map((r) => (
            <article className="p7-record" key={r.id}>
              <span className="p7-tag">{String(r.kind)}</span>
              <h3>{String(r.title)}</h3>
              <p>{String(r.description ?? "")}</p>
              <LibraryResource row={r} />
              {r.course_id === state.context.id && (
                <Button variant="ghost" onClick={() => setEditing(r)}>
                  {tr("Edit")}
                </Button>
              )}
            </article>
          ))}
      </div>
      {editing && (
        <FocusPanel onClose={() => setEditing(null)}>
          <RecordForm
            spec={learningSpecs[4]}
            row={editing === "new" ? undefined : editing}
            defaults={{
              course_id: state.context.id,
              subject_id: state.context.subject_id,
            }}
            locked={["course_id", "subject_id"]}
            pending={save.isPending}
            onSave={(p) => save.mutate(p)}
            onClose={() => setEditing(null)}
          />
          <ErrorNotice error={save.error} />
        </FocusPanel>
      )}
    </>
  );
}
