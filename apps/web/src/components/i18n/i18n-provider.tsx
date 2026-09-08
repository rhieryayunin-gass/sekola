"use client";
import { createContext, useContext, type ReactNode } from "react";
import { defaultLocale, messages, type Locale, type MessageKey } from "../../lib/i18n";
const I18nContext = createContext<{ locale: Locale; t: (key: MessageKey) => string }>({ locale: defaultLocale, t: (key) => messages[defaultLocale][key] });
export function I18nProvider({ children, locale }: { children: ReactNode; locale: Locale }) { return <I18nContext.Provider value={{ locale, t: (key) => messages[locale][key] }}>{children}</I18nContext.Provider>; }
export function useTranslations() { return useContext(I18nContext); }
