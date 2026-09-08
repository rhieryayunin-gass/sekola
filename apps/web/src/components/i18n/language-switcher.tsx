"use client";
import { useRouter } from "next/navigation";
import { type ChangeEvent } from "react";
import { useTranslations } from "./i18n-provider";
export function LanguageSwitcher() { const router = useRouter(); const { locale, t } = useTranslations(); function change(event: ChangeEvent<HTMLSelectElement>) { document.cookie = `atsekola_locale=${event.target.value}; path=/; max-age=31536000; samesite=lax`; router.refresh(); } return <label className="text-xs font-medium text-muted"><span className="sr-only">{t("language")}</span><select aria-label={t("language")} className="rounded border border-border bg-white px-2 py-1 text-foreground" onChange={change} value={locale}><option value="id-ID">{t("indonesian")}</option><option value="en-US">{t("english")}</option></select></label>; }
