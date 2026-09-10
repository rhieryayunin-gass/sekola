import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "../components/i18n/i18n-provider";
import { SiteHeader } from "../components/layout/site-header";
import { defaultLocale, isLocale } from "../lib/i18n";
import { AppProviders } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-poppins", display: "swap" });
export const metadata: Metadata = { title: { default: "osekola — Connected school", template: "%s | osekola" }, description: "osekola School Management Platform" };

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const requestedLocale = cookieStore.get("osekola_locale")?.value ?? cookieStore.get("atsekola_locale")?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : defaultLocale;
  const theme = cookieStore.get("osekola_theme")?.value === "dark" ? "dark" : "light";
  return (
    <html lang={locale} data-theme={theme} className={`${inter.variable} ${poppins.variable}`} suppressHydrationWarning>
      <body>
        <AppProviders>
          <I18nProvider locale={locale}>
            <SiteHeader theme={theme}/>
            {children}
          </I18nProvider>
        </AppProviders>
      </body>
    </html>
  );
}
