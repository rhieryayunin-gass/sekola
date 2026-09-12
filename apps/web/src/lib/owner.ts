"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { schoolRpc } from "./school";
import { usePermissionStore } from "../stores/permission-store";
import type { MessageKey } from "./i18n";

export const ownerNavigation: { label: MessageKey; href: string }[] = [
  { label: "dashboard", href: "/dashboard" }, { label: "ownerTenant", href: "/dashboard/tenant" },
  { label: "ownerFinance", href: "/dashboard/finance" }, { label: "ownerPartner", href: "/dashboard/partners" },
  { label: "ownerUser", href: "/dashboard/users" },
];
export type OwnerRow = { id: string; [key: string]: unknown };
export type OwnerList = { items: OwnerRow[]; total: number; page: number; page_size: number };
export type OwnerSummary = { tenants: number; active_tenants: number; users: number; active_users: number; partners: number; active_partners: number; income: number; expenses: number; receivables: number; overdue: number };
export function useIsOwner() {
  return usePermissionStore(s => !!s.context?.roles.some(r => r.code === "OWNER") && !!s.context.permissions.some(p => p.code === "tenants.update_all"));
}
export function useOwnerList(kind: string, filters: Record<string, string> = {}, page = 1, enabled = true) {
  const owner = useIsOwner(); const userId = usePermissionStore(s => s.context?.userId);
  return useQuery({ queryKey: ["owner", userId, kind, filters, page], enabled: owner && enabled,
    queryFn: () => schoolRpc<OwnerList>("school_owner_list", { kind, filters, page_number: page, page_size: 20 }) });
}
export function useOwnerSummary() {
  const owner = useIsOwner(); const userId = usePermissionStore(s => s.context?.userId);
  return useQuery({ queryKey: ["owner", userId, "summary"], enabled: owner, queryFn: () => schoolRpc<OwnerSummary>("school_owner_summary") });
}
export function useOwnerSave() {
  const cache = useQueryClient();
  return useMutation({ mutationFn: ({ kind, payload, id }: { kind: string; payload: Record<string, unknown>; id?: string }) => schoolRpc<OwnerRow>("school_owner_save", { kind, payload, record_id: id ?? null }),
    onSuccess: async () => { await Promise.all([cache.invalidateQueries({ queryKey: ["owner"] }), cache.invalidateQueries({ queryKey: ["school-context"] }), cache.invalidateQueries({ queryKey: ["media", "context"] })]); } });
}
export const value = (row: OwnerRow, key: string) => String(row[key] ?? "");
export const amount = (n: unknown, locale: string) => new Intl.NumberFormat(locale, { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(n ?? 0));
export const date = (n: unknown, locale: string) => n ? new Date(String(n).slice(0, 10) + "T12:00:00Z").toLocaleDateString(locale, { dateStyle: "medium" }) : "—";
