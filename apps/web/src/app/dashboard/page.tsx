import { redirect } from "next/navigation";
import { LogoutButton } from "../../components/auth/logout-button";
import { Badge } from "../../components/ui/badge";
import { ButtonLink } from "../../components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { createClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard | SEKOLA AI",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/login");
  }

  const email =
    typeof data.claims.email === "string"
      ? data.claims.email
      : "Authenticated user";

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-8 sm:px-10">
      <header className="glass-panel flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-lg)] p-5">
        <div>
          <p className="text-sm font-black tracking-tight">SEKOLA AI</p>
          <p className="mt-1 text-sm text-muted">{email}</p>
        </div>
        <LogoutButton />
      </header>

      <section className="mt-6">
        <Badge tone="success">Authenticated</Badge>
        <h1 className="mt-3 text-4xl font-black tracking-tight">Dashboard</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Your session is active. Role-aware modules will appear here as the
          Core+ roadmap progresses.
        </p>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Secure session</CardTitle>
            <CardDescription>
              Supabase SSR cookies are refreshed before protected content is rendered.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Protected routes</CardTitle>
            <CardDescription>
              Anonymous requests are redirected before dashboard access is granted.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tenant profile</CardTitle>
            <CardDescription>
              View the school identity attached to this account and manage the
              permitted tenant profile fields.
            </CardDescription>
          </CardHeader>
          <ButtonLink href="/dashboard/tenant" variant="secondary">
            Open tenant settings
          </ButtonLink>
        </Card>
      </section>
    </main>
  );
}
