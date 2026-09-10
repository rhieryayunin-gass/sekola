"use client";
import { apiBaseUrl } from "../../lib/api/base-url";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "../../lib/supabase/client";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { useToast } from "../ui/toast";

export interface TenantSettings { name: string; legal_name: string | null; address: string | null; contact_email: string | null; contact_phone: string | null; website_url: string | null; academic_year_label: string | null; week_starts_on: number; notifications_email_enabled: boolean; notifications_in_app_enabled: boolean; timezone: string; locale: "id-ID" | "en-US"; }
const empty = (value: string) => value.trim() || null;
export function TenantProfileForm({ initial }: { initial: TenantSettings }) {
  const router = useRouter(); const { toast } = useToast(); const [values, setValues] = useState(initial); const [saving, setSaving] = useState(false); const [error, setError] = useState<string>();
  const set = <K extends keyof TenantSettings>(key: K, value: TenantSettings[K]) => setValues((current) => ({ ...current, [key]: value }));
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(undefined); try { const { data, error: sessionError } = await createClient().auth.getSession(); const api = apiBaseUrl(); if (sessionError || !data.session?.access_token || !api) throw new Error("Authenticated session is unavailable"); const payload = { ...values, legal_name: empty(values.legal_name ?? ""), address: empty(values.address ?? ""), contact_email: empty(values.contact_email ?? ""), contact_phone: empty(values.contact_phone ?? ""), website_url: empty(values.website_url ?? ""), academic_year_label: empty(values.academic_year_label ?? "") }; const response = await fetch(`${api}/tenants/me`, { method: "PATCH", headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) }); if (!response.ok) throw new Error("Unable to save tenant settings"); toast({ title: "Settings saved", description: "Tenant configuration is up to date.", tone: "success" }); router.refresh(); } catch (cause) { const message = cause instanceof Error ? cause.message : "Unable to save tenant settings"; setError(message); toast({ title: message, tone: "error" }); } finally { setSaving(false); } }
  return <form className="grid gap-5" onSubmit={submit}>
    <Input label="School name" value={values.name} onChange={(e) => set("name", e.target.value)} minLength={2} maxLength={160} required error={error} />
    <Input label="Legal school name" value={values.legal_name ?? ""} onChange={(e) => set("legal_name", e.target.value)} maxLength={160} />
    <Input label="School address" value={values.address ?? ""} onChange={(e) => set("address", e.target.value)} maxLength={500} />
    <div className="grid gap-4 sm:grid-cols-2"><Input type="email" label="Contact email" value={values.contact_email ?? ""} onChange={(e) => set("contact_email", e.target.value)} /><Input label="Contact phone" value={values.contact_phone ?? ""} onChange={(e) => set("contact_phone", e.target.value)} /></div>
    <Input type="url" label="Website URL (HTTPS)" placeholder="https://school.example" value={values.website_url ?? ""} onChange={(e) => set("website_url", e.target.value)} />
    <div className="grid gap-4 sm:grid-cols-2"><Input label="Academic year" placeholder="2026/2027" value={values.academic_year_label ?? ""} onChange={(e) => set("academic_year_label", e.target.value)} /><Select label="Week starts on" value={values.week_starts_on} onChange={(e) => set("week_starts_on", Number(e.target.value))}><option value={1}>Monday</option><option value={0}>Sunday</option></Select></div>
    <div className="grid gap-4 sm:grid-cols-2"><Select label="Timezone" value={values.timezone} onChange={(e) => set("timezone", e.target.value)}><option value="Asia/Jakarta">Asia/Jakarta (WIB)</option><option value="Asia/Makassar">Asia/Makassar (WITA)</option><option value="Asia/Jayapura">Asia/Jayapura (WIT)</option></Select><Select label="Default language" value={values.locale} onChange={(e) => set("locale", e.target.value as TenantSettings["locale"])}><option value="id-ID">Bahasa Indonesia</option><option value="en-US">English</option></Select></div>
    <fieldset className="grid gap-3 rounded-[var(--radius-sm)] border border-border p-4"><legend className="px-1 text-sm font-semibold">Notification defaults</legend><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={values.notifications_email_enabled} onChange={(e) => set("notifications_email_enabled", e.target.checked)} /> Enable email notifications</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={values.notifications_in_app_enabled} onChange={(e) => set("notifications_in_app_enabled", e.target.checked)} /> Enable in-app notifications</label></fieldset>
    <Button disabled={saving} type="submit">{saving ? "Saving…" : "Save tenant settings"}</Button>
  </form>;
}
