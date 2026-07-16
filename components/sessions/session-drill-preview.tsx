"use client";

import { DrillGraphicPreview } from "@/components/drills/drill-graphic-preview";
import { editorStateToString } from "@/lib/drills/editor";
import type { DrillEditorState } from "@/types/editor";

export function SessionDrillPreview({
  graphic,
  previewMode = "detail"
}: {
  graphic?: DrillEditorState;
  previewMode?: "thumbnail" | "detail" | "print";
}) {
  if (!graphic?.objects.length) {
    return <div className="pitch-grid flex aspect-[16/10] w-full items-center justify-center text-xs font-bold uppercase text-white/80">No graphic</div>;
  }

  return (
    <DrillGraphicPreview
      graphicJson={editorStateToString(graphic)}
      autoFitContent
      className="border-0"
      previewMode={previewMode}
    />
  );
}
