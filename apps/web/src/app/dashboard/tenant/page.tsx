import { redirect } from "next/navigation";
import { LogoutButton } from "../../../components/auth/logout-button";
import { TenantProfileForm } from "../../../components/tenant/tenant-profile-form";
import { Badge } from "../../../components/ui/badge";
import { ButtonLink } from "../../../components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { apiFetch } from "../../../lib/api/server";
import { createClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tenant | SEKOLA AI",
};

interface Tenant {
  code: string;
  created_at: string;
  id: string;
  is_active: boolean;
  name: string;
  updated_at: string;
}

export default async function TenantPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/login");
  }

  const tenant = await apiFetch<Tenant>("/tenants/me");

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-8 sm:px-10">
      <header className="glass-panel flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-lg)] p-5">
        <div>
          <p className="text-sm font-black tracking-tight">SEKOLA AI</p>
          <p className="mt-1 text-sm text-muted">Tenant settings</p>
        </div>
        <div className="flex items-center gap-2">
          <ButtonLink href="/dashboard" variant="ghost">
            Dashboard
          </ButtonLink>
          <LogoutButton />
        </div>
      </header>

      <section className="mt-6">
        <Badge tone={tenant.is_active ? "success" : "warning"}>
          {tenant.is_active ? "Active tenant" : "Inactive tenant"}
        </Badge>
        <h1 className="mt-3 text-4xl font-black tracking-tight">
          {tenant.name}
        </h1>
        <p className="mt-2 text-muted">
          School identity is isolated to the tenant connected to your account.
        </p>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader>
            <CardTitle>Tenant identity</CardTitle>
            <CardDescription>
              The code is platform-managed and cannot be changed here.
            </CardDescription>
          </CardHeader>
          <dl className="grid gap-4 text-sm">
            <div>
              <dt className="text-muted">Code</dt>
              <dd className="mt-1 font-mono font-semibold">{tenant.code}</dd>
            </div>
            <div>
              <dt className="text-muted">Tenant ID</dt>
              <dd className="mt-1 break-all font-mono text-xs">{tenant.id}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>School profile</CardTitle>
            <CardDescription>
              Administrators can update only their own school name.
            </CardDescription>
          </CardHeader>
          <TenantProfileForm initialName={tenant.name} />
        </Card>
      </section>
    </main>
  );
}
