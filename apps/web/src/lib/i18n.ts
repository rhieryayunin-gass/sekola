import en from "../messages/en.json";
import id from "../messages/id.json";
export const locales = ["id-ID", "en-US"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "id-ID";
export const messages = { "en-US": en, "id-ID": id } as const;
export type MessageKey = keyof typeof en;
export function isLocale(value: string | undefined): value is Locale { return locales.some((locale) => locale === value); }
