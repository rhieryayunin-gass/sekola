"use client";
import { apiBaseUrl } from "../../lib/api/base-url";
import { useState, type FormEvent } from "react";
import { createClient } from "../../lib/supabase/client";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useToast } from "../ui/toast";

export interface Profile { full_name: string | null; avatar_url: string | null; phone: string | null; emergency_contact_name: string | null; emergency_contact_phone: string | null; }
export function ProfileForm({ initial }: { initial: Profile }) {
  const [form, setForm] = useState(initial); const [saving, setSaving] = useState(false); const { toast } = useToast();
  const set = (key: keyof Profile, value: string) => setForm((state) => ({ ...state, [key]: value }));
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); try {
    const { data } = await createClient().auth.getSession(); if (!data.session) throw new Error("Authenticated session is unavailable");
    const response = await fetch(`${apiBaseUrl()}/users/me/profile`, { method:"PATCH", headers:{Authorization:`Bearer ${data.session.access_token}`,"Content-Type":"application/json"}, body:JSON.stringify(form) });
    if (!response.ok) throw new Error("Unable to update profile"); toast({ title:"Profile saved", description:"Your account details are up to date.", tone:"success" });
  } catch (error) { toast({ title:error instanceof Error ? error.message : "Unable to update profile", tone:"error" }); } finally { setSaving(false); } }
  return <form className="grid gap-4" onSubmit={submit}>
    <Input label="Full name" value={form.full_name ?? ""} onChange={(e)=>set("full_name",e.target.value)} required minLength={2} />
    <Input label="Avatar URL" type="url" value={form.avatar_url ?? ""} onChange={(e)=>set("avatar_url",e.target.value)} placeholder="https://…" />
    <Input label="Phone" value={form.phone ?? ""} onChange={(e)=>set("phone",e.target.value)} />
    <Input label="Emergency contact name" value={form.emergency_contact_name ?? ""} onChange={(e)=>set("emergency_contact_name",e.target.value)} />
    <Input label="Emergency contact phone" value={form.emergency_contact_phone ?? ""} onChange={(e)=>set("emergency_contact_phone",e.target.value)} />
    <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save account settings"}</Button>
  </form>;
}
