"use client";

import { DrillGraphicPreview } from "@/components/drills/drill-graphic-preview";
import { useOptionalI18n } from "@/components/i18n/i18n-provider";
import { editorStateToString } from "@/lib/drills/editor";
import { formatMessage, getMessages } from "@/lib/i18n";
import type { DrillVisual } from "@/types/domain";

export function DrillVisualPreview({
  visual,
  title,
  previewMode = "detail",
  className = ""
}: {
  visual?: DrillVisual;
  title: string;
  previewMode?: "thumbnail" | "detail" | "print";
  className?: string;
}) {
  const context = useOptionalI18n();
  const text = context?.messages.drillVisual ?? getMessages("en").drillVisual;
  const alt = formatMessage(text.alt, { title });
  if (visual?.source === "upload") {
    if (visual.uploadedImageUrl) {
      return (
        <div className={`flex aspect-[16/10] w-full items-center justify-center overflow-hidden bg-slate-100 ${className}`}>
          {/* Private signed URLs are short-lived and cannot use static Next Image optimization safely. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={visual.uploadedImageUrl}
            alt={alt}
            className="h-full w-full object-contain"
          />
        </div>
      );
    }
    return <div className={`flex aspect-[16/10] w-full items-center justify-center bg-slate-100 text-xs font-bold uppercase text-slate-500 ${className}`}>{text.unavailable}</div>;
  }

  if (!visual?.graphic.objects.length) {
    return <div className={`pitch-grid flex aspect-[16/10] w-full items-center justify-center text-xs font-bold uppercase text-white/80 ${className}`}>{text.noGraphic}</div>;
  }

  return (
    <DrillGraphicPreview
      graphicJson={editorStateToString(visual.graphic)}
      autoFitContent
      className={`border-0 ${className}`}
      previewMode={previewMode}
    />
  );
}
