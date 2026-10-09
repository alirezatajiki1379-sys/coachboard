"use client";

import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { archiveDrillImportBatch } from "@/lib/drills/import-actions";

export function ArchiveImportBatchButton({ batchId, label, confirmation }: { batchId: string; label: string; confirmation: string }) {
  return <form action={archiveDrillImportBatch} onSubmit={(event) => { if (!window.confirm(confirmation)) event.preventDefault(); }}>
    <input type="hidden" name="batchId" value={batchId} />
    <Button type="submit" variant="secondary"><Archive className="h-4 w-4" />{label}</Button>
  </form>;
}
