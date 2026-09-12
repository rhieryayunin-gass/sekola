"use client";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "./supabase/client";
import { usePermissionStore } from "../stores/permission-store";

export type SchoolRow = { id: string; name?: string; title?: string; full_name?: string; [key: string]: unknown };
export type SchoolContext = { tenant: { id: string; name: string }; settings: { plan_code: string; modules: Record<string, boolean> }; staff: boolean; educator: boolean; platform_owner: boolean; children: { id: string; name: string; user_id: string }[] };
export async function schoolRpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await createClient().rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
export function useSchoolContext() {
  const userId = usePermissionStore(s => s.context?.userId);
  return useQuery({ queryKey: ["school-context", userId], enabled: !!userId, queryFn: () => schoolRpc<SchoolContext>("school_context"), staleTime: 30_000 });
}
export function useCatalog(resource: string) {
  const userId = usePermissionStore(s => s.context?.userId);
  return useQuery({ queryKey: ["school-catalog", userId, resource], enabled: !!userId, queryFn: async () => {
    if (resource.startsWith("finance:")) return schoolRpc<SchoolRow[]>("school_finance_options", { resource: resource.slice(8) });
    const rows: SchoolRow[] = [];
    // Each request is bounded; include large school rosters without silently losing options.
    for (let offset = 0; offset < 10_000; offset += 500) {
      const batch = await schoolRpc<SchoolRow[]>("school_catalog", { resource, page_offset: offset });
      rows.push(...batch); if (batch.length < 500) break;
    }
    return rows;
  }, staleTime: 60_000 });
}
export const rowName = (row: SchoolRow) => String(row.name ?? row.title ?? row.full_name ?? row.student_number ?? row.employee_number ?? row.invoice_number ?? "Record");
export const schoolModules = [
  ["core", "O-Core", "/dashboard/core"], ["academic", "O-Academic", "/dashboard/academic"],
  ["attendance", "O-Attendance", "/dashboard/attendance"], ["connect", "O-Connect", "/dashboard/connect"],
  ["learning", "O-Learning", "/dashboard/learning"], ["exams", "O-Exam", "/dashboard/exams"],
  ["finance", "O-Finance", "/dashboard/finance"], ["team", "O-Team", "/dashboard/team"],
] as const;
