"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Search, X } from "lucide-react";
import { useTranslations } from "../i18n/i18n-provider";
import { useAuthStore } from "../../stores/auth-store";
import { AccessState } from "../layout/module-page";
import { usePermissionStore } from "../../stores/permission-store";
import { useIsOwner, type OwnerList, type OwnerRow, value } from "../../lib/owner";
import { Button, Input, Select } from "../ui";
import type { MessageKey } from "../../lib/i18n";

export function OwnerShell({ children }: { children: ReactNode }) {
  const { t } = useTranslations(); const user = useAuthStore(s => s.user); const context = usePermissionStore(s => s.context); const owner = useIsOwner();
  if (!context) return <AccessState/>;
  if (!owner) return <div className="ose-status glass-panel"><h1>{t("accessLimited")}</h1><p>{t("accessLimitedDesc")}</p></div>;
  return <section className="owner-workspace"><header className="owner-banner"><div><p className="ose-eyebrow">OSEKOLA WORKSPACE OWNER</p><h1>{t("hello")}, {user?.user_metadata.full_name || user?.email?.split("@")[0] || t("account")}.</h1><p>{t("ownerWelcome")}</p></div><Image src="/illustrations/owner.webp" alt="" width={1536} height={1024} sizes="(max-width: 640px) 160px, 320px" priority/></header>{children}</section>;
}
export function OwnerHeading({ title, description, children }: { title: MessageKey; description: MessageKey; children?: ReactNode }) {
  const { t } = useTranslations(); return <div className="owner-heading"><div><h2>{t(title)}</h2><p>{t(description)}</p></div><div className="owner-actions">{children}</div></div>;
}
export function OwnerDialog({ title, children, close, wide = false }: { title: string; children: ReactNode; close: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null); const heading = useId(); const { t } = useTranslations();
  useEffect(() => { const el = ref.current; const focused = document.activeElement as HTMLElement | null; const overflow = document.body.style.overflow; el?.showModal(); document.body.style.overflow = "hidden"; return () => { el?.close(); document.body.style.overflow = overflow; focused?.focus(); }; }, []);
  return <dialog ref={ref} className={`owner-dialog ${wide ? "owner-dialog-wide" : ""}`} aria-labelledby={heading} onClose={close} onClick={e => { if (e.target !== ref.current) return; const r = ref.current.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); }}><header><h2 id={heading}>{title}</h2><Button variant="ghost" onClick={close} aria-label={t("ownerClose")}><X size={20}/></Button></header>{children}</dialog>;
}
export function OwnerSearch({ query, setQuery, children }: { query: string; setQuery: (v: string) => void; children?: ReactNode }) {
  const { t } = useTranslations(); return <div className="owner-toolbar"><label className="school-search"><Search size={18}/><input value={query} onChange={e => setQuery(e.target.value)} maxLength={160} placeholder={t("ownerSearch")} aria-label={t("ownerSearch")}/></label>{children}</div>;
}
export function StatusFilter({ status, change, deleted = false }: { status: string; change: (s: string) => void; deleted?: boolean }) {
  const { t } = useTranslations(); return <Select aria-label={t("ownerStatus")} value={status} onChange={e => change(e.target.value)}><option value="">{t("ownerAllStatus")}</option><option value="ACTIVE">{t("ownerActive")}</option><option value="INACTIVE">{t("ownerInactive")}</option>{deleted && <option value="DELETED">{t("ownerArchived")}</option>}</Select>;
}
export function OwnerSwitch({ checked, onChange, label, disabled }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return <button type="button" className="owner-switch" role="switch" aria-checked={checked} aria-label={label} title={label} onClick={onChange} disabled={disabled}><span/></button>;
}
export function OwnerTable({ headers, list, loading, error, retry, page, setPage, children }: { headers: string[]; list?: OwnerList; loading: boolean; error: boolean; retry: () => void; page: number; setPage: (p: number) => void; children: ReactNode }) {
  const { t } = useTranslations(); return <div className="owner-table-panel glass-panel">{loading ? <p className="owner-empty" role="status">{t("loading")}</p> : error ? <div className="owner-empty" role="alert"><p>{t("loadError")}</p><Button onClick={retry}>{t("retry")}</Button></div> : !list?.items.length ? <p className="owner-empty">{t("ownerEmpty")}</p> : <><div className="owner-table-scroll"><table className="owner-table"><thead><tr>{headers.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div><footer><span>{list.total.toLocaleString()} {t("ownerRecords")}</span><div><Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("ownerPrevious")}</Button><span>{page} / {Math.max(1, Math.ceil(list.total / list.page_size))}</span><Button size="sm" variant="ghost" disabled={page * list.page_size >= list.total} onClick={() => setPage(page + 1)}>{t("ownerNext")}</Button></div></footer></>}</div>;
}
export function OwnerMetric({ label, value: metric, detail, href, onClick }: { label: string; value: string; detail: string; href?: string; onClick?: () => void }) {
  const content = <><span>{label}<ArrowUpRight size={18}/></span><strong>{metric}</strong><small>{detail}</small></>;
  return href ? <Link className="owner-metric glass-panel" href={href}>{content}</Link> : <button type="button" className="owner-metric glass-panel" onClick={onClick}>{content}</button>;
}
export type OwnerField = { key: string; label: MessageKey; type?: string; required?: boolean; min?: number | string; max?: number; options?: { value: string; label: string }[] };
export function OwnerForm({ fields, initial, submit, pending, error, children, saveLabel }: { fields: OwnerField[]; initial?: OwnerRow; submit: (data: Record<string, unknown>) => void; pending: boolean; error?: string; children?: ReactNode; saveLabel?: string }) {
  const { t } = useTranslations(); const [form, setForm] = useState<Record<string, string>>(() => Object.fromEntries(fields.map(f => [f.key, initial ? value(initial, f.key) : ""])));
  return <form className="owner-form" onSubmit={e => { e.preventDefault(); submit(Object.fromEntries(fields.map(f => [f.key, f.type === "number" ? Number(form[f.key]) : f.type === "password" ? form[f.key] : form[f.key]?.trim() || null]))); }}><div className="owner-fields">{fields.map(f => <div key={f.key} className={f.type === "textarea" ? "owner-field-wide" : ""}>{f.options ? <Select label={t(f.label)} required={f.required} value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}><option value="">{t("ownerChoose")}</option>{f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</Select> : <Input label={t(f.label)} type={f.type ?? "text"} required={f.required} min={f.min} max={f.max} step={f.type === "number" ? "0.01" : undefined} minLength={f.type === "password" ? 12 : undefined} autoComplete={f.type === "password" ? "new-password" : undefined} maxLength={f.type === "password" ? 128 : f.type === "email" ? 254 : 500} value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}/>}</div>)}</div>{children}{error && <p role="alert" className="school-error">{error}</p>}<div className="owner-form-footer"><Button type="submit" disabled={pending}>{pending ? t("ownerSaving") : saveLabel ?? t("ownerSave")}</Button></div></form>;
}
export function OwnerStatus({ status }: { status: unknown }) {
  const { t } = useTranslations(); const key = String(status ?? "NONE"); const labels: Record<string, MessageKey> = { ACTIVE: "ownerActive", INACTIVE: "ownerInactive", PAID: "ownerPaid", OPEN: "ownerOpen", OVERDUE: "ownerOverdue", NONE: "ownerNoInvoice", DELETED: "ownerArchived", PENDING: "ownerUnpaid", RECEIVED: "ownerPaid" };
  return <span className="owner-badge" data-status={key}>{labels[key] ? t(labels[key]) : key}</span>;
}
