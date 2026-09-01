"use client";

import { useEffect } from "react";
import { Button } from "../components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <section className="glass-panel max-w-lg rounded-[var(--radius-lg)] p-8 text-center">
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-danger">
          System error
        </p>
        <h1 className="text-3xl font-bold">Something went wrong</h1>
        <p className="mt-3 text-muted">
          The problem has been contained. You can safely retry this page.
        </p>
        <Button className="mt-6" onClick={reset}>
          Try again
        </Button>
      </section>
    </main>
  );
}
