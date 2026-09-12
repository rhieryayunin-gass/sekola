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
import { demoUrl, marketingCopy } from "../../lib/marketing";
import { AccountAvatar, SchoolIdentity } from "../media/media-identity";
import { Bell, CalendarDays } from "lucide-react";
import { schoolModules, useSchoolContext } from "../../lib/school";
import { UnreadIndicator } from "../school/unread-indicator";

export function SiteHeader({ theme }: { theme: "light" | "dark" }) {
  const path = usePathname();
  const { t, locale } = useTranslations();
  const context = usePermissionStore(s => s.context);
  const school = useSchoolContext();
  const app = path.startsWith("/dashboard");
  const allowed = availableModules(context);
  const role = primaryRole(context);
  const has = (permission: string) => context?.permissions.some(p => p.code === permission);
  return <header className="ose-header">
    <a href="#ose-main" className="ose-skip">{t("skipContent")}</a>
    <div className={`ose-nav ${app ? "" : "ose-public-nav"}`}>
      <Brand />
      {app && <SchoolIdentity/>}
      {!app && <div className="ose-preferences"><LanguageSwitcher/><ThemeSwitcher initial={theme}/></div>}
      {!app && <nav className="ose-main-nav" aria-label={t("navigation")}><Link href="/#ecosystem">{t("ecosystem")}</Link><Link href="/#pricing">{locale === "id-ID" ? "Paket" : "Plans"}</Link><Link href="/partners">Partner</Link><Link className="ose-sign-in" href="/login">{t("signIn")}</Link><a className="ose-demo-link" href={demoUrl} target="_blank" rel="noreferrer">{marketingCopy[locale].demo}</a></nav>}
      {app && <div className="ose-preferences"><LanguageSwitcher /><ThemeSwitcher initial={theme}/>{has("calendar.read") && <Link className="school-icon-link" href="/dashboard/calendar" aria-label={t("calendar")} title={t("calendar")}><CalendarDays size={20}/></Link>}{has("notifications.read") && <Link className="school-icon-link" href="/dashboard/notifications" aria-label={t("notifications")} title={t("notifications")}><Bell size={20}/><UnreadIndicator/></Link>}<details key={path} className="ose-menu ose-account"><summary aria-label={t("account")}><AccountAvatar fallback={role.slice(0,1) || "•"}/></summary><div className="ose-account-menu"><span className="ose-eyebrow">{role || t("account")}</span><Link href="/dashboard/profile">{t("profile")}</Link><Link href="/dashboard/media">{locale === "id-ID" ? "Pusat media" : "Media center"}</Link><Link href="/dashboard/partners">Partner</Link><LogoutButton /></div></details></div>}
    </div>
    {app && <nav className="ose-module-nav school-module-nav" aria-label={t("modules")}><Link href="/dashboard" aria-current={path === "/dashboard" ? "page" : undefined}>{t("dashboard")}</Link>{schoolModules.filter(([key]) => (key === "core" || allowed.some(m => m.key === key)) && school.data?.settings.modules[key] !== false).map(([key, title, href]) => <Link key={key} href={href} aria-current={path === href ? "page" : undefined}>{title}{key === "connect" && <UnreadIndicator connect/>}</Link>)}</nav>}
  </header>;
}
