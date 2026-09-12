import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../../lib/school", () => ({
 schoolRpc: rpc,
 useSchoolContext: () => ({ data: { tenant: { id: "school-a", name: "Demo" }, educator: true } }),
 useCatalog: (resource: string) => ({ data: resource === "courses" ? [{ id: "course-a", name: "Matematika" }] : [] }),
}));
import { QuestionWorkspace } from "./question-workspace";

describe("Teacher question authoring", () => {
 it("submits a bank and approved question when their save buttons are clicked", async () => {
  const sets: Record<string, unknown>[] = [], items: Record<string, unknown>[] = [];
  rpc.mockImplementation(async (name: string, args: { kind?: string; payload?: Record<string, unknown> }) => {
   if (name === "school_question_bank") return { sets: [...sets], items: [...items] };
   const row = { ...args.payload, id: args.kind === "set" ? "set-a" : "question-a", source: "MANUAL" };
   (args.kind === "set" ? sets : items).push(row); return row;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><QuestionWorkspace/></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Bank baru" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Nama bank soal" }), { target: { value: "Latihan bilangan" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Course" }), { target: { value: "course-a" } });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Tingkat kelas" }), { target: { value: "6" } });
  fireEvent.click(screen.getByRole("button", { name: "Simpan bank" }));
  fireEvent.click(await screen.findByRole("button", { name: "Soal manual" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Pertanyaan" }), { target: { value: "Berapakah hasil 2 + 2?" } });
  fireEvent.change(screen.getByRole("textbox", { name: /Pilihan \(satu/ }), { target: { value: "3\n4\n5\n6" } });
  fireEvent.change(screen.getByRole("textbox", { name: /Kunci \(salin/ }), { target: { value: "4" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Pembahasan" }), { target: { value: "Dua ditambah dua menjadi empat." } });
  fireEvent.change(screen.getByRole("combobox", { name: "Hasil tinjauan" }), { target: { value: "APPROVED" } });
  fireEvent.click(screen.getByRole("button", { name: "Simpan soal" }));
  await waitFor(() => expect(items).toHaveLength(1));
  expect(sets[0]).toMatchObject({ title: "Latihan bilangan", course_id: "course-a", grade_level: 6 });
  expect(items[0]).toMatchObject({ set_id: "set-a", answer: "4", review_status: "APPROVED" });
  expect(await screen.findByRole("heading", { name: "Berapakah hasil 2 + 2?" })).toBeInTheDocument();
 });
});
