"use client";

import { DrillVisualPreview } from "@/components/drills/drill-visual-preview";
import type { DrillVisual } from "@/types/domain";

export function SessionDrillPreview({
  visual,
  title = "Drill",
  previewMode = "detail"
}: {
  visual?: DrillVisual;
  title?: string;
  previewMode?: "thumbnail" | "detail" | "print";
}) {
  return <DrillVisualPreview visual={visual} title={title} previewMode={previewMode} className="border-0" />;
}
