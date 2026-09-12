"use client";
import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { useTranslations } from "../i18n/i18n-provider";
import { useOwnerList, useOwnerSave, value, type OwnerRow } from "../../lib/owner";
import { schoolModules } from "../../lib/school";
import { useSchoolContext } from "../../lib/school";
import { Button, Select } from "../ui";
import { MediaUpload } from "../media/media-uploader";
import { OwnerDialog, OwnerForm, OwnerHeading, OwnerSearch, OwnerShell, OwnerStatus, OwnerSwitch, OwnerTable, StatusFilter, type OwnerField } from "./owner-ui";

export const plans = ["ESSENTIAL", "ELEVATE", "ENTERPRISE"];
export function useTenantFields(): OwnerField[] {
  const { t } = useTranslations();
  return [{ key: "name", label: "ownerName", required: true }, { key: "code", label: "ownerCode", required: true }, { key: "legal_name", label: "ownerLegalName" }, { key: "address", label: "ownerAddress" }, { key: "contact_email", label: "ownerEmail", type: "email" }, { key: "contact_phone", label: "ownerPhone" }, { key: "website_url", label: "ownerWebsite", type: "url" }, { key: "academic_year_label", label: "ownerAcademicYear" }, { key: "timezone", label: "ownerTimezone", required: true }, { key: "locale", label: "ownerLanguage", required: true, options: [{ value: "en-US", label: "English" }, { value: "id-ID", label: "Bahasa Indonesia" }] }, { key: "week_starts_on", label: "ownerWeekStart", required: true, type: "number", options: [{ value: "0", label: t("ownerSunday") }, { value: "1", label: t("ownerMonday") }] }];
}
export function OwnerTenants() {
  const { t } = useTranslations(); const [query, setQuery] = useState(""); const [status, setStatus] = useState(""); const [plan, setPlan] = useState(""); const [page, setPage] = useState(1); const [editing, setEditing] = useState<OwnerRow | null>();
  const q = useOwnerList("tenants", { query, status, plan }, page); const save = useOwnerSave(); const school = useSchoolContext(); const fields = useTenantFields();
  const open = (row: OwnerRow | null) => { save.reset(); setEditing(row); };
  return <OwnerShell><OwnerHeading title="ownerTenant" description="ownerTenantDesc"><Button onClick={() => open(null)}><Plus size={17}/>{t("ownerAddTenant")}</Button></OwnerHeading>
    <OwnerSearch query={query} setQuery={v => { setQuery(v); setPage(1); }}><StatusFilter status={status} change={v => { setStatus(v); setPage(1); }}/><Select aria-label={t("ownerPlan")} value={plan} onChange={e => { setPlan(e.target.value); setPage(1); }}><option value="">{t("ownerAllPlans")}</option>{plans.map(p => <option key={p}>{p}</option>)}</Select></OwnerSearch>
    {save.isError && editing === undefined && <p className="school-error" role="alert">{save.error.message}</p>}
    <OwnerTable headers={[t("ownerTenant"), t("ownerStatus"), t("ownerPlan"), ...schoolModules.map(([, title]) => title.replace("O-", "")), t("ownerActions")]} list={q.data} loading={q.isPending} error={q.isError} retry={() => void q.refetch()} page={page} setPage={setPage}>
      {q.data?.items.map(row => <tr key={row.id}><td><button className="owner-name" onClick={() => open(row)}>{value(row, "name")}</button><small>{value(row, "code")} · {value(row, "user_count")} {t("ownerUser")}</small></td><td><div className="owner-status-cell"><OwnerSwitch checked={row.is_active === true} disabled={save.isPending || row.id === school.data?.tenant.id} label={`${t("ownerStatus")} ${value(row, "name")}`} onChange={() => save.mutate({ kind: "tenant", id: row.id, payload: { is_active: !row.is_active } })}/><OwnerStatus status={row.status}/></div></td><td><Select aria-label={`${t("ownerPlan")} ${value(row, "name")}`} value={value(row, "plan_code")} disabled={save.isPending} onChange={e => save.mutate({ kind: "plan", id: row.id, payload: { plan_code: e.target.value } })}>{plans.map(p => <option key={p}>{p}</option>)}</Select></td>{schoolModules.map(([key, title]) => <td key={key}><OwnerSwitch checked={(row.modules as Record<string, boolean>)[key] !== false} disabled={save.isPending} label={`${title} · ${value(row, "name")}`} onChange={() => save.mutate({ kind: "module", id: row.id, payload: { module: key, enabled: (row.modules as Record<string, boolean>)[key] === false } })}/></td>)}<td><Button variant="ghost" size="sm" onClick={() => open(row)} aria-label={`${t("ownerEdit")} ${value(row, "name")}`}><Pencil size={16}/>{t("ownerEdit")}</Button></td></tr>)}
    </OwnerTable>
    {editing !== undefined && <OwnerDialog title={t(editing ? "ownerEditTenant" : "ownerAddTenant")} close={() => setEditing(undefined)} wide><OwnerForm key={editing?.id ?? "new"} initial={editing ?? { id: "", timezone: "Asia/Jakarta", locale: "en-US", week_starts_on: 1 }} fields={fields} pending={save.isPending} error={save.error?.message} submit={payload => save.mutate({ kind: "tenant", id: editing?.id, payload }, { onSuccess: row => { if (editing) setEditing(undefined); else setEditing(row); } })}>{editing ? <section className="owner-logo-editor"><h3>{t("ownerAvatar")}</h3><MediaUpload bucket="tenant-media" prefix={`${editing.id}/logos`} fixedName="logo"/></section> : <p className="owner-help">{t("ownerAvatarAfterSave")}</p>}</OwnerForm></OwnerDialog>}
  </OwnerShell>;
}
