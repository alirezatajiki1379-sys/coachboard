import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { localeCookieName, localeFromAcceptLanguage, normalizeLocale } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "CoachBoard",
  description: "Football training planner for coaches"
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  const locale = normalizeLocale(cookieStore.get(localeCookieName)?.value) ?? localeFromAcceptLanguage(requestHeaders.get("accept-language")) ?? "en";
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
