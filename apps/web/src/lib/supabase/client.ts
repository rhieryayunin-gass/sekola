import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;

function getBrowserConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Public Supabase configuration is missing");
  }

  return { key, url };
}

export function createClient() {
  if (browserClient) return browserClient;

  const { key, url } = getBrowserConfiguration();
  browserClient = createBrowserClient(url, key);

  return browserClient;
}
