"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ className }: { className?: string }) {
  return (
    <Button type="button" className={className} onClick={() => window.print()} title="Open the browser print dialog. Choose Save as PDF to export.">
      <Printer className="h-4 w-4" />
      Print / save PDF
    </Button>
  );
}
