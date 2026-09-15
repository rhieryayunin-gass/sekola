"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { usePermissionStore } from "../../stores/permission-store";
import { useSchoolContext } from "../../lib/school";
import { useTranslations } from "../i18n/i18n-provider";

export function SchoolSetupLink() {
  const { t } = useTranslations();
  const roles = usePermissionStore(s => s.context?.roles);
  const school = useSchoolContext();
  if (!roles?.some(r => ["OWNER", "PRINCIPAL", "STAFF", "TEACHER"].includes(r.code)) || school.data?.settings.modules.core === false) return null;
  return <Link href="/dashboard/core" className="p7-setup-link" aria-label={t("coreSetup")}><span><small>O-Core · O-Academic</small><strong>{t("coreSetup")}</strong></span><ArrowRight aria-hidden="true"/></Link>;
}
