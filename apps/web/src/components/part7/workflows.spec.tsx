import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "../i18n/i18n-provider";
import { usePermissionStore } from "../../stores/permission-store";
import { SchoolSetup } from "./onboarding";
import { ClassStudio } from "./class-studio";
import { AssessmentStudio } from "./assessment-studio";
import type { StudioState } from "./class-studio";
const { rpc, navigation, library } = vi.hoisted(() => ({
  rpc: vi.fn(),
  navigation: {
    params: new URLSearchParams(),
    push: vi.fn(),
    refresh: vi.fn(),
  },
  library: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => navigation.params,
  useRouter: () => navigation,
}));
vi.mock("../../lib/school", async (original) => ({
  ...(await original<typeof import("../../lib/school")>()),
  schoolRpc: rpc,
}));
vi.mock("../../lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ limit: library }) }),
  }),
}));
const course = "b3000000-0000-4000-8000-000000000007";
const context = {
  id: course,
  name: "Mathematics · Grade 5A",
  classroom: "Grade 5A",
  subject: "Mathematics",
  academic_year: "2026 / 2027",
  term: "Semester 1",
  classroom_id: "class",
  subject_id: "subject",
  semester_id: "term",
  academic_year_id: "year",
  can_manage: true,
  studio_status: "LIVE",
  student_id: null,
  participants: 28,
  is_template: false,
};
const fixture: StudioState = {
  context,
  units: [
    {
      id: "unit",
      title: "Patterns in the world",
      description:
        "Explore number patterns, explain your thinking, and connect ideas.",
      position: 1,
      week: 1,
      outcome_ids: [],
      student_ids: [],
      published: true,
    },
  ],
  lessons: [
    {
      id: "lesson",
      unit_id: "unit",
      title: "Discovering number patterns",
      material: "Look closely at the pattern. What comes next?",
      blocks: [],
      scheduled_at: null,
      is_published: true,
      opened_at: null,
      completed_at: null,
      content_version: 1,
    },
  ],
  assignments: [
    {
      id: "task",
      unit_id: "unit",
      title: "Explain your pattern",
      instructions: "Describe the rule and give an example.",
      due_at: null,
      max_score: 100,
      rubric: "Reasoning, examples, and clarity",
      is_published: true,
    },
  ],
  submissions: [
    {
      id: "submission",
      assignment_id: "task",
      student_name: "Alya · test learner",
      content: "Each step adds two.",
      attachment_url: null,
      revision: 1,
      workflow_status: "SUBMITTED",
      submitted_at: "2026-09-15T08:00:00Z",
      reviewed_at: null,
      score: null,
      feedback: null,
      draft_score: null,
      draft_feedback: null,
      draft_decision: null,
    },
  ],
  roster: [],
  outcomes: [],
};
function actor(role: string) {
  usePermissionStore.setState({
    context: {
      userId: "actor",
      roles: [{ code: role, id: role, name: role }],
      permissions: [],
    },
  });
}
function mount(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider locale="en-US">{ui}</I18nProvider>
    </QueryClientProvider>,
  );
}
async function capture(name: string) {
  if (process.env.PART7_RENDER_DIR) {
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(process.env.PART7_RENDER_DIR, { recursive: true });
    await writeFile(
      `${process.env.PART7_RENDER_DIR}/${name}.html`,
      document.body.innerHTML,
    );
  }
}
beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  navigation.params = new URLSearchParams();
  library.mockResolvedValue({ data: [] });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value() {
      this.removeAttribute("open");
    },
  });
});
describe("Part 7 user workflows", () => {
  it("shows source-based readiness and explains missing setup prerequisites", async () => {
    actor("STAFF");
    rpc.mockResolvedValue({
      school: {
        name: "Sekolah Cakrawala",
        timezone: "Asia/Jakarta",
        locale: "id-ID",
      },
      setup: { mode: "GUIDED", operations: {}, revision: 0 },
      checks: [
        "identity",
        "operations",
        "people",
        "facilities",
        "year",
        "terms",
        "curriculum",
        "mapping",
        "classes",
        "homeroom",
        "placement",
        "capacity",
        "assignments",
        "enrollment",
      ].map((key, i) => ({
        key,
        phase: i < 4 ? "core" : "academic",
        issues: 1,
        complete: false,
      })),
      score: 0,
      blockers: 14,
      year_id: null,
      term_id: null,
      can_edit: true,
      can_identity: false,
      can_academic: true,
      counts: { students: 0, teachers: 0, classes: 0 },
      activity: [],
    });
    mount(<SchoolSetup />);
    await screen.findByText("Sekolah Cakrawala");
    await capture("setup");
    fireEvent.click(
      screen.getByRole("button", { name: /Curriculum pathways/ }),
    );
    expect(
      screen.getByText("A foundation is still missing"),
    ).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith(
      "school_setup_action",
      expect.anything(),
    );
  });
  it("keeps assignment review drafts separate from explicit release", async () => {
    actor("TEACHER");
    navigation.params = new URLSearchParams("course=" + course);
    let state = structuredClone(fixture);
    rpc.mockImplementation(
      async (name: string, args?: Record<string, unknown>) => {
        if (name === "school_studio") {
          if (args?.action === "home")
            return {
              courses: [context],
              candidates: [],
              templates: [],
              today: [],
            };
          if (args?.action === "review") {
            state = {
              ...state,
              submissions: state.submissions.map((s) => ({
                ...s,
                draft_score: 80,
                draft_feedback: "Clear rule",
                draft_decision: "COMPLETED",
              })),
            };
            return { id: "submission" };
          }
          return state;
        }
        return [];
      },
    );
    mount(<ClassStudio />);
    await screen.findByText("Patterns in the world");
    await capture("class-studio");
    fireEvent.click(screen.getByRole("button", { name: "Review workspace" }));
    fireEvent.click(screen.getByRole("button", { name: "Review work" }));
    expect(
      screen.getByRole("button", { name: "Release feedback to learner" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Score / 100"), {
      target: { value: "80" },
    });
    fireEvent.change(screen.getByLabelText("Feedback draft"), {
      target: { value: "Clear rule" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save review draft" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith(
        "school_studio",
        expect.objectContaining({ action: "review" }),
      ),
    );
    expect(rpc.mock.calls.some(([, a]) => a?.action === "release")).toBe(false);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Release feedback to learner" }),
      ).toBeEnabled(),
    );
  });
  it("checks exam readiness without creating an attempt before the learner starts", async () => {
    actor("STUDENT");
    rpc.mockImplementation(
      async (name: string, args?: Record<string, unknown>) => {
        if (name === "school_exam_list")
          return [
            {
              id: "exam",
              title: "Number reasoning check",
              course_id: course,
              status: "PUBLISHED",
              question_count: 1,
              can_take: true,
            },
          ];
        if (name === "school_assessment" && args?.action === "ready")
          return {
            title: "Number reasoning check",
            starts_at: "2026-09-15T08:00:00Z",
            ends_at: "2026-09-15T09:00:00Z",
            duration_minutes: 30,
            extra_minutes: 10,
            question_count: 1,
            instructions: "Read carefully and explain your reasoning.",
          };
        return {};
      },
    );
    mount(<AssessmentStudio />);
    await screen.findByText("Number reasoning check");
    fireEvent.click(screen.getByRole("button", { name: "Check readiness" }));
    await screen.findByText("Read carefully and explain your reasoning.");
    expect(rpc.mock.calls.some(([name]) => name === "school_exam_start")).toBe(
      false,
    );
    expect(
      screen.getByRole("button", { name: "Start exam now" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(
      screen.getByRole("button", { name: "Start exam now" }),
    ).toBeEnabled();
    await capture("exam-ready");
  });
});
