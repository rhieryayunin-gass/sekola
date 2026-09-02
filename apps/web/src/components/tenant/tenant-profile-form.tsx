"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "../../lib/supabase/client";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useToast } from "../ui/toast";

interface TenantProfileFormProps {
  initialName: string;
}

interface ApiErrorResponse {
  error?: {
    message?: string | string[];
  };
}

function apiUrl() {
  const url = process.env.NEXT_PUBLIC_API_URL;

  if (!url) {
    throw new Error("Public API configuration is missing");
  }

  return url.replace(/\/$/, "");
}

export function TenantProfileForm({ initialName }: TenantProfileFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(initialName);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setIsSaving(true);

    try {
      const supabase = createClient();
      const { data, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !data.session?.access_token) {
        throw new Error("Authenticated session is unavailable");
      }

      const response = await fetch(`${apiUrl()}/tenants/me`, {
        body: JSON.stringify({ name }),
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });

      if (!response.ok) {
        const payload = (await response.json()) as ApiErrorResponse;
        const message = payload.error?.message;
        throw new Error(
          Array.isArray(message)
            ? message.join(", ")
            : message ?? "Unable to update tenant",
        );
      }

      toast({
        description: "The tenant profile is now up to date.",
        title: "Tenant saved",
        tone: "success",
      });
      router.refresh();
    } catch (submissionError) {
      const message =
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to update tenant";
      setError(message);
      toast({ title: message, tone: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <Input
        error={error}
        label="School name"
        maxLength={160}
        minLength={2}
        name="name"
        onChange={(event) => setName(event.target.value)}
        required
        value={name}
      />
      <div>
        <Button disabled={isSaving || name.trim() === initialName} type="submit">
          {isSaving ? "Saving…" : "Save tenant profile"}
        </Button>
      </div>
    </form>
  );
}
