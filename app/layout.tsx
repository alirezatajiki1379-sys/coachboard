import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { localeCookieName, localeFromAcceptLanguage, normalizeLocale } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "CoachBoard",
  description: "Football training planner for coaches",
  applicationName: "CoachBoard",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/coachboard-brand/favicon.ico", sizes: "any" },
      { url: "/coachboard-brand/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/coachboard-brand/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/coachboard-brand/favicon-48x48.png", sizes: "48x48", type: "image/png" }
    ],
    shortcut: "/coachboard-brand/favicon.ico",
    apple: [{ url: "/coachboard-brand/apple-touch-icon-180x180.png", sizes: "180x180", type: "image/png" }]
  }
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#13202F" };

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
