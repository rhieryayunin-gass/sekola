import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { I18nProvider } from "../components/i18n/i18n-provider";
import { LanguageSwitcher } from "../components/i18n/language-switcher";
import { defaultLocale, isLocale } from "../lib/i18n";
import { AppProviders } from "./providers";

export const metadata: Metadata = {
  title: "SEKOLA AI",
  description: "SEKOLA AI School Management Platform",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestedLocale = (await cookies()).get("atsekola_locale")?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : defaultLocale;
  return (
    <html lang={locale}>
      <body>
        <AppProviders>
          <I18nProvider locale={locale}>
            {children}
            <div className="fixed bottom-4 right-4"><LanguageSwitcher /></div>
          </I18nProvider>
        </AppProviders>
      </body>
    </html>
  );
}
