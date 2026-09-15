"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Brand } from "./brand";
import { ThemeSwitcher } from "./theme-switcher";
import { LanguageSwitcher } from "../i18n/language-switcher";
import { useTranslations } from "../i18n/i18n-provider";
import { LogoutButton } from "../auth/logout-button";
import { usePermissionStore } from "../../stores/permission-store";
import { primaryRole } from "../../lib/modules";
import { demoUrl, marketingCopy } from "../../lib/marketing";
import { AccountAvatar, SchoolIdentity } from "../media/media-identity";
import { Bell, CalendarDays, MessageCircle } from "lucide-react";
import { useSchoolContext } from "../../lib/school";
import { UnreadIndicator } from "../school/unread-indicator";
import { ownerNavigation, useIsOwner } from "../../lib/owner";

import { roleNavigation } from "../../lib/navigation";
import { BrandIcon } from "./brand-icon";

function AccountMenu({ owner, role }: { owner: boolean; role: string }) {
  const { t } = useTranslations(); const context = usePermissionStore(s=>s.context); const school=useSchoolContext(); const navigation=owner?ownerNavigation:roleNavigation(context,school.data?.settings.modules); const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null); const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div ref={ref} className="owner-account"><button ref={trigger} type="button" className="owner-avatar-trigger" aria-label={t("account")} aria-expanded={open} aria-controls="account-popover" onClick={() => setOpen(!open)}><AccountAvatar fallback={role.slice(0, 1) || "•"}/></button>{open && <nav id="account-popover" className="owner-account-popover" aria-label={t("account")}><span className="ose-eyebrow account-role"><BrandIcon name={role} size={20}/>{role || t("account")}</span><Link href="/dashboard/profile" onClick={() => setOpen(false)}>{t("profile")}</Link>{navigation.map(item => <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>{t(item.label)}</Link>)}<LogoutButton danger={owner}/></nav>}</div>;
}

export function SiteHeader({ theme }: { theme: "light" | "dark" }) {
  const path = usePathname();
  const { t, locale } = useTranslations();
  const context = usePermissionStore(s => s.context);
  const school = useSchoolContext();
  const app = path.startsWith("/dashboard");
  const navigation = roleNavigation(context, school.data?.settings.modules);
  const role = primaryRole(context);
  const owner = useIsOwner();
  const has = (permission: string) => context?.permissions.some(p => p.code === permission);
  return <><header className={`ose-header ${app ? "ose-app-header" : "p6-public-header"}`}>
    <a href="#ose-main" className="ose-skip">{t("skipContent")}</a>
    <div className={`ose-nav ${app ? owner ? "owner-nav" : "" : "ose-public-nav"}`}>
      <Brand />
      {app && !owner && <SchoolIdentity/>}
      {!app && <div className="ose-preferences"><LanguageSwitcher/><ThemeSwitcher initial={theme}/></div>}
      {!app && <div className="ose-main-nav p6-public-actions"><Link className="ose-sign-in" href="/login">{t("signIn")}</Link><a className="ose-demo-link" href={demoUrl} target="_blank" rel="noreferrer">{marketingCopy[locale].demo}</a></div>}
      {app && <div className="ose-preferences"><LanguageSwitcher /><ThemeSwitcher initial={theme}/>{owner && has("connect.read") && school.data?.settings.modules.connect !== false && <Link className="school-icon-link" href="/dashboard/connect" aria-label="O-Connect" title="O-Connect"><MessageCircle size={20}/><UnreadIndicator connect/></Link>}{has("calendar.read") && <Link className="school-icon-link" href="/dashboard/calendar" aria-label={t("calendar")} title={t("calendar")}><CalendarDays size={20}/></Link>}{has("notifications.read") && <Link className="school-icon-link" href="/dashboard/notifications" aria-label={t("notifications")} title={t("notifications")}><Bell size={20}/><UnreadIndicator/></Link>}<AccountMenu key={path} owner={owner} role={role}/></div>}
    </div>
    {app && <nav className="ose-module-nav school-module-nav" aria-label={t("modules")}>{(owner ? ownerNavigation : navigation).map(item => <Link key={item.href} href={item.href} aria-current={path === item.href ? "page" : undefined}>{t(item.label)}{item.href === "/dashboard/connect" && <UnreadIndicator connect/>}</Link>)}</nav>}
  </header>{!app && <div className="p6-floating-nav-wrap"><nav className="p6-floating-nav" aria-label={t("navigation")}><Link href="/#ecosystem">{t("ecosystem")}</Link><Link href="/#pricing">{locale === "id-ID" ? "Paket" : "Plans"}</Link><Link href="/partners" aria-current={path === "/partners" ? "page" : undefined}>{locale === "id-ID" ? "Mitra" : "Partners"}</Link></nav></div>}</>;
}
