import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { localeFromAcceptLanguage } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "CoachBoard",
  description: "Football training planner for coaches"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const locale = localeFromAcceptLanguage(requestHeaders.get("accept-language")) ?? "en";
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
