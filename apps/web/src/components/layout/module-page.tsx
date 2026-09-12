"use client";
import type { ReactNode } from "react";
import { useTranslations } from "../i18n/i18n-provider";
import { usePermissionStore } from "../../stores/permission-store";
import { availableModules } from "../../lib/modules";
import type { MessageKey } from "../../lib/i18n";
import { Button } from "../ui/button";
import { useSchoolContext } from "../../lib/school";

export function AccessState() {
  const { t } = useTranslations();
  const failed = usePermissionStore(s => s.error);
  const load = usePermissionStore(s => s.load);
  return <div className="ose-status glass-panel" role={failed ? "alert" : "status"}><h2>{t(failed ? "accessError" : "loadingAccess")}</h2>{failed && <><p>{t("accessErrorDesc")}</p><Button onClick={() => void load()}>{t("retry")}</Button></>}</div>;
}
export function ModulePage({ name, title, description, permission, children }: { name?: string; title: MessageKey; description: MessageKey; permission?: string; children: ReactNode }) {
  const { t } = useTranslations();
  const context = usePermissionStore(s => s.context);
  const school = useSchoolContext();
  if (!context) return <AccessState/>;
  const moduleKey = name && ["people", "operations", "users", "tenant"].includes(name) ? "core" : name;
  const enabled = !moduleKey || school.data?.settings.modules[moduleKey] !== false;
  const allowed = enabled && (permission ? context.permissions.some(p => p.code === permission) : name ? (name === "core" || availableModules(context).some(m => m.key === name)) : true);
  return <div className="ose-module-page"><div className="ose-page-heading"><div><p className="ose-eyebrow">osekola workspace</p><h1>{t(title)}</h1><p>{t(description)}</p></div></div>{allowed ? children : <div className="ose-status glass-panel"><h2>{t("accessLimited")}</h2><p>{t("accessLimitedDesc")}</p></div>}</div>;
}
