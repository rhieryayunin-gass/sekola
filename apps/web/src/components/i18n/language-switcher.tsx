"use client";
import { useRouter } from "next/navigation";
import { type ChangeEvent } from "react";
import { useTranslations } from "./i18n-provider";
export function LanguageSwitcher() {
  const router = useRouter(); const { locale, t } = useTranslations();
  function change(event: ChangeEvent<HTMLSelectElement>) {
    document.cookie = `osekola_locale=${event.target.value}; path=/; max-age=31536000; samesite=lax`;
    document.cookie = `atsekola_locale=${event.target.value}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }
  return <label><span className="sr-only">{t("language")}</span><select aria-label={t("language")} className="ose-control ose-language" onChange={change} value={locale}><option value="id-ID" aria-label="Bahasa Indonesia">ID</option><option value="en-US" aria-label="English">EN</option></select></label>;
}
