import { createClient } from "../supabase/server";

interface ApiSuccessResponse<T> {
  data: T;
  success: true;
  timestamp: string;
}

interface ApiErrorResponse {
  error?: {
    message?: string | string[];
  };
  success?: false;
}

function getApiUrl() {
  const url = process.env.NEXT_PUBLIC_API_URL;

  if (!url) {
    throw new Error("Public API configuration is missing");
  }

  return url.replace(/\/$/, "");
}

export async function apiFetch<T>(path: string): Promise<T> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.access_token) {
    throw new Error("Authenticated session is unavailable");
  }

  const response = await fetch(`${getApiUrl()}${path}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
    },
  });

  const payload = (await response.json()) as
    | ApiSuccessResponse<T>
    | ApiErrorResponse;

  if (!response.ok || !("data" in payload)) {
    const message = "error" in payload ? payload.error?.message : undefined;
    throw new Error(
      Array.isArray(message)
        ? message.join(", ")
        : message ?? "API request failed",
    );
  }

  return payload.data;
}
