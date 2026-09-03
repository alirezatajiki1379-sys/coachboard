"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMessages, type Locale } from "@/lib/i18n";

export function PrintButton({ className, locale = "en" }: { className?: string; locale?: Locale }) {
  const messages = getMessages(locale);
  return (
    <Button type="button" className={className} onClick={() => window.print()} title={messages.export.actions.printTitle}>
      <Printer className="h-4 w-4" />
      {messages.export.actions.printSavePdf}
    </Button>
  );
}
