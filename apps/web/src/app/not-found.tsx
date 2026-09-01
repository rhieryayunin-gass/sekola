import { ButtonLink } from "../components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <section className="glass-panel max-w-lg rounded-[var(--radius-lg)] p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-secondary">
          404
        </p>
        <h1 className="mt-2 text-3xl font-bold">Page not found</h1>
        <p className="mt-3 text-muted">
          The page may have moved or is outside your access scope.
        </p>
        <ButtonLink className="mt-6" href="/">
          Return home
        </ButtonLink>
      </section>
    </main>
  );
}
