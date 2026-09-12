"use client";
import { useState } from "react";
import { KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "../i18n/i18n-provider";
import { browserApi } from "../../lib/api/browser";
import { date, useOwnerList, value, type OwnerRow } from "../../lib/owner";
import { usePermissionStore } from "../../stores/permission-store";
import { Button, Input, Select } from "../ui";
import { OwnerDialog, OwnerForm, OwnerHeading, OwnerSearch, OwnerShell, OwnerStatus, OwnerSwitch, OwnerTable, StatusFilter, type OwnerField } from "./owner-ui";

const roles = ["OWNER", "PRINCIPAL", "STAFF", "TEACHER", "STUDENT", "PARENT"];
type Action = { kind: "create" | "edit" | "password" | "archive"; row?: OwnerRow };
function useUserAction() {
  const cache = useQueryClient();
  return useMutation({ mutationFn: ({ path, method, data }: { path: string; method: string; data?: Record<string, unknown> }) => browserApi("/owner/users" + path, { method, body: data ? JSON.stringify(data) : undefined }), onSettled: () => cache.invalidateQueries({ queryKey: ["owner"] }) });
}
function UserEditor({ action, close }: { action: Action; close: () => void }) {
  const { t } = useTranslations(); const mutate = useUserAction(); const [tenantSearch, setTenantSearch] = useState(""); const [tenantPage, setTenantPage] = useState(1); const tenants = useOwnerList("tenants", { query: tenantSearch, status: "ACTIVE" }, tenantPage, action.kind === "create"); const actor = usePermissionStore(s => s.context?.userId); const [confirmed, setConfirmed] = useState("");
  const { kind, row } = action; const self = actor === row?.id;
  const fields: OwnerField[] = kind === "password" ? [{ key: "password", label: "ownerNewPassword", type: "password", required: true }] : [
    ...(!row ? [{ key: "tenant_id", label: "ownerTenant" as const, required: true, options: (tenants.data?.items ?? []).map(r => ({ value: r.id, label: value(r, "name") })) }] : []),
    { key: "full_name", label: "ownerName", required: true }, { key: "email", label: "ownerEmail", type: "email", required: true }, { key: "phone", label: "ownerPhone" },
    ...(!self ? [{ key: "role", label: "ownerRole" as const, required: true, options: roles.map(r => ({ value: r, label: r })) }] : []), ...(!row ? [{ key: "password", label: "ownerNewPassword" as const, type: "password", required: true }] : []),
  ];
  return <OwnerDialog title={t(({ create: "ownerAddUser", edit: "ownerEditUser", password: "ownerResetPassword", archive: "ownerDeleteUser" } as const)[kind])} close={close} wide={kind === "create" || kind === "edit"}>
    {kind === "archive" ? <><p>{t("ownerArchiveHelp")}</p><Input label={`${t("ownerTypeEmail")} ${value(row!, "email")}`} value={confirmed} onChange={e => setConfirmed(e.target.value)}/>{mutate.isError && <p role="alert" className="school-error">{mutate.error.message}</p>}<div className="owner-form-footer"><Button variant="danger" disabled={confirmed !== row?.email || mutate.isPending} onClick={() => mutate.mutate({ path: "/" + row!.id, method: "DELETE" }, { onSuccess: close })}>{t("ownerDeleteUser")}</Button></div></> : <>
      {kind === "create" && <><Input label={t("ownerSearchTenant")} value={tenantSearch} onChange={e => { setTenantSearch(e.target.value); setTenantPage(1); }}/><div className="owner-actions"><Button size="sm" variant="ghost" disabled={tenantPage === 1} onClick={() => setTenantPage(tenantPage - 1)}>{t("ownerPrevious")}</Button><span>{tenantPage}</span><Button size="sm" variant="ghost" disabled={!tenants.data || tenantPage * 20 >= tenants.data.total} onClick={() => setTenantPage(tenantPage + 1)}>{t("ownerNext")}</Button></div></>}
      {row && <p className="owner-dialog-description">{value(row, "email")} · {value(row, "tenant_name")}</p>}
      <OwnerForm initial={row ? { ...row, role: (row.roles as string[])?.[0] } : undefined} fields={fields} pending={mutate.isPending} error={mutate.error?.message} submit={data => mutate.mutate({ path: row ? "/" + row.id + (kind === "password" ? "/password" : "") : "", method: kind === "edit" ? "PATCH" : "POST", data: { ...data, ...(data.phone === null ? { phone: "" } : {}) } }, { onSuccess: close })}>{(kind === "password" || kind === "create") && <p className="owner-help">{t("ownerPasswordHelp")}</p>}</OwnerForm>
    </>}
  </OwnerDialog>;
}
export function OwnerUsers() {
  const { t, locale } = useTranslations(); const [query, setQuery] = useState(""); const [status, setStatus] = useState(""); const [role, setRole] = useState(""); const [page, setPage] = useState(1); const [editor, setEditor] = useState<Action>(); const q = useOwnerList("users", { query, status, role }, page); const mutate = useUserAction(); const actor = usePermissionStore(s => s.context?.userId);
  const capabilities = useQuery({ queryKey: ["owner-api", actor], enabled: !!actor, queryFn: () => browserApi<{ available: boolean }>("/owner/users/capabilities"), retry: false, refetchInterval: 30_000 });
  const available = capabilities.data?.available === true;
  return <OwnerShell><OwnerHeading title="ownerUser" description="ownerUserDesc"><Button disabled={!available} onClick={() => setEditor({ kind: "create" })}><Plus size={17}/>{t("ownerAddUser")}</Button></OwnerHeading><OwnerSearch query={query} setQuery={v => { setQuery(v); setPage(1); }}><StatusFilter status={status} deleted change={v => { setStatus(v); setPage(1); }}/><Select aria-label={t("ownerRole")} value={role} onChange={e => { setRole(e.target.value); setPage(1); }}><option value="">{t("ownerAllRoles")}</option>{roles.map(r => <option key={r}>{r}</option>)}</Select></OwnerSearch>
    {!capabilities.isPending && !available && <p className="owner-service-status" role="status">{t("ownerAccountServiceUnavailable")}</p>}
    {mutate.isError && <p className="school-error" role="alert">{mutate.error.message}</p>}
    <OwnerTable headers={[t("ownerName"), t("ownerTenant"), t("ownerRole"), t("ownerStatus"), t("ownerCreated"), t("ownerActions")]} list={q.data} loading={q.isPending} error={q.isError} retry={() => void q.refetch()} page={page} setPage={setPage}>{q.data?.items.map(row => <tr key={row.id}><td><strong>{value(row, "full_name") || "—"}</strong><small>{value(row, "email")}</small><small>{value(row, "phone")}</small></td><td>{value(row, "tenant_name")}{!row.tenant_active && <small className="school-error">{t("ownerTenantInactive")}</small>}</td><td>{(row.roles as string[]).join(", ") || "—"}</td><td><div className="owner-status-cell"><OwnerSwitch checked={row.is_active === true} disabled={!available || actor === row.id || mutate.isPending || !!row.deleted_at} label={`${t("ownerStatus")} ${value(row, "email")}`} onChange={() => mutate.mutate({ path: "/" + row.id + "/status", method: "PATCH", data: { is_active: !row.is_active } })}/><OwnerStatus status={row.status}/></div></td><td>{date(row.created_at, locale)}</td><td><div className="owner-actions">{row.deleted_at ? <Button size="sm" disabled={!available || mutate.isPending} onClick={() => mutate.mutate({ path: "/" + row.id + "/restore", method: "POST" })}>{t("ownerRestore")}</Button> : <><Button size="sm" variant="ghost" disabled={!available} aria-label={`${t("ownerEdit")} ${value(row, "email")}`} onClick={() => setEditor({ kind: "edit", row })}><Pencil size={16}/></Button><Button size="sm" variant="ghost" disabled={!available} aria-label={`${t("ownerResetPassword")} ${value(row, "email")}`} onClick={() => setEditor({ kind: "password", row })}><KeyRound size={16}/></Button>{!row.is_active && <Button size="sm" disabled={!available || mutate.isPending} onClick={() => mutate.mutate({ path: "/" + row.id + "/restore", method: "POST" })}>{t("ownerOverrideInactive")}</Button>}<Button size="sm" variant="ghost" disabled={!available || actor === row.id} aria-label={`${t("ownerDeleteUser")} ${value(row, "email")}`} onClick={() => setEditor({ kind: "archive", row })}><Trash2 size={16}/></Button></>}</div></td></tr>)}</OwnerTable>
    {editor && <UserEditor action={editor} close={() => setEditor(undefined)}/>}
  </OwnerShell>;
}
