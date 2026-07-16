import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CoachBoard",
  description: "Football training planner for coaches"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
