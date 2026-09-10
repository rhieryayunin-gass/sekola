import { create } from "zustand";
import { createClient } from "../lib/supabase/client";

export interface PermissionContext {
  permissions: Array<{ code: string; id: string; name: string }>;
  roles: Array<{ code: string; id: string; name: string }>;
  userId: string;
}

interface PermissionState {
  context: PermissionContext | null;
  has: (code: string) => boolean;
  load: () => Promise<void>;
  reset: () => void;
}

function apiUrl() {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) throw new Error("Public API configuration is missing");
  return url.replace(/\/$/, "");
}

let requestVersion = 0;

export const usePermissionStore = create<PermissionState>((set, get) => ({
  context: null,
  has: (code) => get().context?.permissions.some((item) => item.code === code) ?? false,
  async load() {
    const version = ++requestVersion;
    const { data, error } = await createClient().auth.getSession();
    if (error || !data.session?.access_token) {
      if (version === requestVersion) set({ context: null });
      return;
    }
    const response = await fetch(`${apiUrl()}/auth/context`, {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    });
    const payload = (await response.json()) as { data?: PermissionContext };
    if (!response.ok || !payload.data) throw new Error("Unable to load permission context");
    if (version === requestVersion && payload.data.userId === data.session.user.id) set({ context: payload.data });
  },
  reset: () => { requestVersion++; set({ context: null }); },
}));
