import { redirect } from "next/navigation";
import { LogoutButton } from "../../../components/auth/logout-button";
import { UserManagement } from "../../../components/users/user-management";
import { ButtonLink } from "../../../components/ui/button";
import { createClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Users | SEKOLA AI",
};

export default async function UsersPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/login");
  }

  const currentUserId =
    typeof data.claims.sub === "string" ? data.claims.sub : "";

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-8 sm:px-10">
      <header className="glass-panel flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-lg)] p-5">
        <div>
          <p className="text-sm font-black tracking-tight">SEKOLA AI</p>
          <p className="mt-1 text-sm text-muted">User master</p>
        </div>
        <div className="flex items-center gap-2">
          <ButtonLink href="/dashboard" variant="ghost">
            Dashboard
          </ButtonLink>
          <LogoutButton />
        </div>
      </header>

      <UserManagement currentUserId={currentUserId} />
    </main>
  );
}
