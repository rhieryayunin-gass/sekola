"use client";
import { useState } from "react";
import { useTranslations } from "../i18n/i18n-provider";

export function ThemeSwitcher({ initial }: { initial: "light" | "dark" }) {
  const [theme, setTheme] = useState(initial);
  const { t } = useTranslations();
  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    document.cookie = `osekola_theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setTheme(next);
  }
  return <button type="button" className="ose-control ose-theme" onClick={toggle} aria-label={theme === "light" ? t("darkMode") : t("lightMode")} aria-pressed={theme === "dark"}>
    {theme === "light" ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20.9 13.4A9 9 0 0 1 10.6 3.1 9 9 0 1 0 20.9 13.4Z"/></svg> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>}
  </button>;
}
