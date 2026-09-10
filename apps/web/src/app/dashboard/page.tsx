import { redirect } from "next/navigation";
import { LogoutButton } from "../../components/auth/logout-button";
import { PermissionGate } from "../../components/auth/permission-gate";
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

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
        <PermissionGate permission="tenants.update_own">
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
        </PermissionGate>
        <PermissionGate permission="users.read">
        <Card>
          <CardHeader>
            <CardTitle>User master</CardTitle>
            <CardDescription>
              Create, update, activate, and deactivate accounts inside the
              current tenant.
            </CardDescription>
          </CardHeader>
          <ButtonLink href="/dashboard/users" variant="secondary">
            Manage users
          </ButtonLink>
        </Card>
        </PermissionGate>
        <PermissionGate permission="calendar.read">
        <Card>
          <CardHeader>
            <CardTitle>Shared calendar</CardTitle>
            <CardDescription>
              Plan tenant events, recurring schedules, invitations, and approvals.
            </CardDescription>
          </CardHeader>
          <ButtonLink href="/dashboard/calendar" variant="secondary">
            Open calendar
          </ButtonLink>
        </Card>
        </PermissionGate>
        <PermissionGate permission="team_projects.read">
        <Card>
          <CardHeader>
            <CardTitle>Team+ workspace</CardTitle>
            <CardDescription>
              Plan projects, assign tasks, and deliver work through a Jira-style Kanban board.
            </CardDescription>
          </CardHeader>
          <ButtonLink href="/dashboard/team" variant="secondary">
            Open Team+
          </ButtonLink>
        </Card>
        </PermissionGate>
        <PermissionGate permission="rooms.read">
        <Card>
          <CardHeader><CardTitle>Operations board</CardTitle><CardDescription>Coordinate room bookings, leave, schedule changes, and approvals in a Kanban workflow.</CardDescription></CardHeader>
          <ButtonLink href="/dashboard/operations" variant="secondary">Open operations</ButtonLink>
        </Card>
        </PermissionGate>
        <PermissionGate permission="academic_analytics.read">
        <Card>
          <CardHeader><CardTitle>Institution analytics</CardTitle><CardDescription>Track academic, attendance, finance, and executive performance indicators.</CardDescription></CardHeader>
          <ButtonLink href="/dashboard/analytics" variant="secondary">Open analytics</ButtonLink>
        </Card>
        </PermissionGate>
      </section>
    </main>
  );
}
