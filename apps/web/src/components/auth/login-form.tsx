"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { sanitizeNextPath } from "../../lib/auth/navigation";
import { useAuthStore } from "../../stores/auth-store";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function LoginForm() {
  const router = useRouter();
  const signIn = useAuthStore((state) => state.signIn);
  const storeError = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();
    setIsPending(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    try {
      await signIn({ email, password });
      const next = sanitizeNextPath(
        new URLSearchParams(window.location.search).get("next"),
      );
      router.replace(next);
      router.refresh();
    } catch {
      setIsPending(false);
    }
  }

  return (
    <form className="mt-7 grid gap-4" onSubmit={handleSubmit}>
      <Input
        autoComplete="email"
        disabled={isPending}
        label="Email address"
        name="email"
        placeholder="name@school.edu"
        required
        type="email"
      />
      <Input
        autoComplete="current-password"
        disabled={isPending}
        label="Password"
        minLength={8}
        name="password"
        required
        type="password"
      />
      {storeError && (
        <p className="rounded-[var(--radius-sm)] bg-red-50 p-3 text-sm text-danger" role="alert">
          {storeError}
        </p>
      )}
      <Button className="mt-1 w-full" disabled={isPending} size="lg" type="submit">
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
