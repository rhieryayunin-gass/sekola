import { apiBaseUrl } from "./base-url";
import { createClient } from "../supabase/client";

export async function browserApi<T>(path: string, init?: RequestInit): Promise<T> {
  const base = apiBaseUrl();
  if (!base) throw new Error("API configuration is unavailable");
  const { data } = await createClient().auth.getSession();
  if (!data.session) throw new Error("Session unavailable");
  const response = await fetch(`${base}${path}`, { ...init, headers: { Authorization: `Bearer ${data.session.access_token}`, ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  const payload = await response.json();
  if (!response.ok || payload.data === undefined) throw new Error(Array.isArray(payload.error?.message) ? payload.error.message.join(", ") : payload.error?.message ?? "Request failed");
  return payload.data as T;
}
