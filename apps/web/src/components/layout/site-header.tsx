"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "./brand";
import { ThemeSwitcher } from "./theme-switcher";
import { LanguageSwitcher } from "../i18n/language-switcher";
import { useTranslations } from "../i18n/i18n-provider";
import { LogoutButton } from "../auth/logout-button";
import { usePermissionStore } from "../../stores/permission-store";
import { availableModules, primaryRole } from "../../lib/modules";

export function SiteHeader({ theme }: { theme: "light" | "dark" }) {
  const path = usePathname();
  const { t } = useTranslations();
  const context = usePermissionStore(s => s.context);
  const app = path.startsWith("/dashboard");
  const allowed = availableModules(context);
  const role = primaryRole(context);
  const has = (permission: string) => context?.permissions.some(p => p.code === permission);
  return <header className="ose-header">
    <a href="#ose-main" className="ose-skip">{t("skipContent")}</a>
    <div className="ose-nav">
      <Brand />
      <nav className="ose-main-nav" aria-label={t("navigation")}>
        {app ? <>
          <Link href="/dashboard" aria-current={path === "/dashboard" ? "page" : undefined}>{t("dashboard")}</Link>
          <details className="ose-menu"><summary>{t("modules")}</summary><div className="ose-module-menu">{allowed.map(m => <Link key={m.key} href={m.href}><span className="ose-mark">{m.mark}</span><span>{t(m.title)}</span></Link>)}</div></details>
          {has("calendar.read") && <Link href="/dashboard/calendar" aria-current={path === "/dashboard/calendar" ? "page" : undefined}>{t("calendar")}</Link>}
          {has("notifications.read") && <Link href="/dashboard/notifications" aria-current={path === "/dashboard/notifications" ? "page" : undefined}>{t("notifications")}</Link>}
        </> : <><Link href="/#ecosystem">{t("ecosystem")}</Link><Link href="/login">{t("signIn")}</Link></>}
      </nav>
      <div className="ose-preferences"><LanguageSwitcher /><ThemeSwitcher initial={theme}/>{app && <details className="ose-menu ose-account"><summary aria-label={t("account")}><span className="ose-avatar">{role.slice(0,1) || "•"}</span></summary><div className="ose-account-menu"><span className="ose-eyebrow">{role || t("account")}</span><Link href="/dashboard/profile">{t("profile")}</Link><LogoutButton /></div></details>}</div>
    </div>
    {app && <nav className="ose-module-nav" aria-label={t("modules")}>{allowed.map(m => <Link key={m.key} href={m.href} aria-current={path === m.href ? "page" : undefined}>{t(m.title)}</Link>)}</nav>}
  </header>;
}
