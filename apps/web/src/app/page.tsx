import { Badge } from "../components/ui/badge";
import { ButtonLink } from "../components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";

const foundations = [
  {
    title: "Secure by design",
    description: "Tenant isolation, permissions, and auditability are built into every module.",
  },
  {
    title: "One school ecosystem",
    description: "Academic, learning, attendance, exam, finance, and operations share one core.",
  },
  {
    title: "Bilingual foundation",
    description: "English is the internal language with Bahasa Indonesia as the second language.",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 sm:px-10 sm:py-16">
      <section className="glass-panel overflow-hidden rounded-[var(--radius-lg)] p-7 sm:p-12">
        <Badge tone="info">Project Foundation</Badge>
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-secondary">
          SEKOLA AI
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">
          A connected operating system for modern schools.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-muted sm:text-lg">
          The shared Core+ foundation keeps every school module consistent,
          secure, and ready to scale across tenants.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/" size="lg">
            Foundation ready
          </ButtonLink>
          <ButtonLink href="/" size="lg" variant="ghost">
            View roadmap
          </ButtonLink>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {foundations.map((foundation) => (
          <Card key={foundation.title}>
            <CardHeader>
              <CardTitle>{foundation.title}</CardTitle>
              <CardDescription>{foundation.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>
    </main>
  );
}
