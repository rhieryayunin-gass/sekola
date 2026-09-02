import { LoginForm } from "../../components/auth/login-form";

export const metadata = {
  title: "Sign in | SEKOLA AI",
};

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <section className="glass-panel w-full max-w-md rounded-[var(--radius-lg)] p-7 sm:p-9">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-[var(--radius-sm)] bg-primary font-black text-foreground">
            S
          </span>
          <div>
            <p className="font-black tracking-tight">SEKOLA AI</p>
            <p className="text-sm text-muted">School Management Platform</p>
          </div>
        </div>
        <h1 className="mt-8 text-3xl font-black tracking-tight">Welcome back</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Sign in with the account provided by your school administrator.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
