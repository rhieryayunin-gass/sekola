export default function Loading() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl p-6 sm:p-10">
      <div className="animate-pulse space-y-6" aria-label="Loading page">
        <div className="h-10 w-64 rounded-xl bg-white/70" />
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div
              className="h-36 rounded-[var(--radius-lg)] bg-white/70"
              key={item}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
