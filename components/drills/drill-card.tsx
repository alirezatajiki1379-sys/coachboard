"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart3, Clock, Edit, Eye, Users } from "lucide-react";
import Link from "next/link";
import { useOptionalI18n } from "@/components/i18n/i18n-provider";
import { useSystemText } from "@/components/i18n/use-system-text";
import { ButtonLink } from "@/components/ui/button";
import { DrillActions } from "@/components/drills/drill-actions";
import { DrillVisualPreview } from "@/components/drills/drill-visual-preview";
import { DrillMaterialLabel } from "@/components/drills/drill-material-label";
import { drillAgeLabel, drillUsageDate } from "@/lib/drills/display";
import type { Drill, DrillVisual } from "@/types/domain";
import type { DrillUsageStats } from "@/lib/drills/usage";

type DrillCardProps = {
  drill: Drill & { visual?: DrillVisual; usage?: DrillUsageStats };
  view?: "active" | "published" | "drafts" | "archived" | "trash";
  selectionMode?: boolean;
  selected?: boolean;
  onSelectionToggle?: () => void;
  selectionLabel?: string;
};

export function DrillCard({ drill, view = "active", selectionMode = false, selected = false, onSelectionToggle, selectionLabel }: DrillCardProps) {
  const ui = useSystemText();
  const locale = useOptionalI18n()?.locale ?? "en";
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const materialsPopoverRef = useRef<HTMLDivElement | null>(null);
  const visibleMaterials = drill.materials.slice(0, 4);
  const extraMaterialCount = Math.max(0, drill.materials.length - visibleMaterials.length);

  useEffect(() => {
    if (!materialsOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (materialsPopoverRef.current?.contains(event.target as Node)) return;
      setMaterialsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMaterialsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [materialsOpen]);

  return (
    <article className={`group relative min-w-0 break-words rounded-lg border bg-white shadow-soft transition ${selected ? "border-board-green ring-2 ring-board-green/20" : "border-board-line"}`}>
      {onSelectionToggle ? (
        <label
          className={`absolute left-3 top-3 z-20 flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md border bg-white/95 shadow-sm transition focus-within:ring-2 focus-within:ring-board-green ${selectionMode || selected ? "border-board-green opacity-100" : "border-board-line opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}
          title={selectionLabel ?? ui("Select Drill: {title}", { title: drill.title })}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelectionToggle}
            aria-label={selectionLabel ?? ui("Select Drill: {title}", { title: drill.title })}
            className="h-5 w-5 rounded border-slate-300 text-board-green focus:ring-board-green"
          />
        </label>
      ) : null}
      <Link href={`/drills/${drill.id}`} aria-label={ui("Open drill: {title}", { title: drill.title })} className="block overflow-hidden rounded-t-lg bg-board-grass focus-visible:outline focus-visible:outline-2 focus-visible:outline-board-green">
        <DrillVisualPreview visual={drill.visual} title={drill.title} previewMode="thumbnail" />
      </Link>
      <div className="p-5">
        <div className="min-w-0">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
            <div className="min-w-0 max-w-full">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase text-board-green">{ui(drill.mainFocus)}</p>
                {drill.status === "draft" ? <StatusBadge label="Draft" /> : null}
                {drill.status === "draft" ? <StatusBadge label="Reusable Draft" neutral /> : null}
                {view === "archived" ? <StatusBadge label="Archived" /> : null}
                {view === "trash" ? <StatusBadge label="Trash" danger /> : null}
              </div>
              <h2 translate="no" className="mt-1 line-clamp-2 text-xl font-bold tracking-normal text-board-navy"><Link href={`/drills/${drill.id}`} className="hover:underline focus-visible:outline-board-green">{drill.title}</Link></h2>
              {drill.subFocus ? <p translate="no" className="mt-1 text-xs text-slate-500">{drill.subFocus}</p> : null}
            </div>
            <div className="shrink-0">
              <DrillActions drillId={drill.id} isFavorite={drill.isFavorite} view={view} compact isDraft={drill.status === "draft"} />
            </div>
          </div>

          <p translate="no" className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
            {drill.shortDescription || ui("No short description yet.")}
          </p>

          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
            <span className="rounded-md bg-slate-100 px-2 py-1">{drillAgeLabel(drill, locale)}</span>
            <span className="rounded-md bg-slate-100 px-2 py-1">{drill.trainingBlocks.map((block) => ui(block)).join(", ")}</span>
            <span className="rounded-md bg-slate-100 px-2 py-1">{ui(drill.drillType)}</span>
          </div>

          <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            <span className="inline-flex items-center gap-2">
              <Clock className="h-4 w-4 text-board-green" />
              {drill.durationMinutes} min
            </span>
            <span className="inline-flex items-center gap-2">
              <Users className="h-4 w-4 text-board-green" />
              {ui("{min}-{max} players", { min: drill.minPlayers, max: drill.maxPlayers })}
            </span>
          </div>

          <details className="mt-3 text-xs text-slate-600">
            <summary className="min-h-10 cursor-pointer py-2 font-semibold">
              <span className="inline-flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-board-green" />
                {drill.usage?.usageUnavailable ? ui("Usage unavailable") : drill.usage?.historicalUseCount ? ui("Used {count} times", { count: drill.usage.historicalUseCount }) : ui("Never used")}
              </span>
            </summary>
            {!drill.usage?.usageUnavailable ? <div className="space-y-1 pb-2">
              <p>{drill.usage?.lastUsedAt ? `${ui("Last used")}: ${drillUsageDate(drill.usage.lastUsedAt, locale)}` : ui("No historical use")}</p>
              <p>{drill.usage?.reviewedUseCount && drill.usage.averageEffectiveness != null ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(drill.usage.averageEffectiveness)} / 5 · ${ui("Reviews")}: ${drill.usage.reviewedUseCount}` : ui("No feedback yet")}</p>
            </div> : null}
          </details>

          <div className="relative mt-4">
            <p className="text-[11px] font-bold uppercase text-board-green">{ui("Materials")}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {visibleMaterials.length ? (
                <>
                  {visibleMaterials.map((material, index) => (
                    <span
                      key={`${material.type}-${material.color ?? "none"}-${material.variant ?? "none"}-${material.label ?? "none"}-${index}`}
                      className="min-w-0 max-w-full rounded-md border border-board-line bg-board-cream px-2 py-1 text-xs font-semibold leading-snug text-board-navy"
                    >
                      <DrillMaterialLabel material={material} locale={locale} />
                    </span>
                  ))}
                  {extraMaterialCount ? (
                    <span ref={materialsPopoverRef} className="inline-flex">
                      <button
                        type="button"
                        aria-expanded={materialsOpen}
                        onClick={() => setMaterialsOpen((open) => !open)}
                        className="min-h-11 min-w-11 rounded-md border border-dashed border-board-line bg-white px-2 py-1 text-xs font-semibold leading-none text-slate-500 transition hover:border-board-green hover:text-board-green focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-board-green sm:min-h-0 sm:min-w-0"
                      >
                        {ui("+{count} more", { count: extraMaterialCount })}
                      </button>
                      {materialsOpen ? (
                        <div className="absolute left-0 top-full z-20 mt-2 w-full max-w-72 rounded-lg border border-board-line bg-white p-3 text-left shadow-soft">
                          <p className="text-[11px] font-bold uppercase text-board-green">{ui("All materials")}</p>
                          <div className="mt-2 flex max-h-[min(20rem,calc(100dvh-8rem))] flex-wrap gap-1.5 overflow-y-auto overscroll-contain pr-1">
                            {drill.materials.map((material, index) => (
                              <span
                                key={`popover-${material.type}-${material.color ?? "none"}-${material.variant ?? "none"}-${material.label ?? "none"}-${index}`}
                                className="min-w-0 max-w-full rounded-md border border-board-line bg-board-cream px-2 py-1 text-xs font-semibold leading-snug text-board-navy"
                              >
                                <DrillMaterialLabel material={material} locale={locale} />
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-xs font-semibold text-slate-400">{ui("No materials")}</span>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink href={`/drills/${drill.id}`} variant="secondary" className="h-9 px-3">
              <Eye className="h-4 w-4" />
              {ui("Preview")}
            </ButtonLink>
            {view !== "trash" ? <ButtonLink href={`/drills/${drill.id}/edit`} variant="secondary" className="h-9 px-3">
              <Edit className="h-4 w-4" />
              {ui(drill.status === "draft" ? "Continue editing" : "Edit")}
            </ButtonLink> : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function StatusBadge({ label, danger = false, neutral = false }: { label: string; danger?: boolean; neutral?: boolean }) {
  const ui = useSystemText();
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${danger ? "bg-red-50 text-red-700" : neutral ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
      {ui(label)}
    </span>
  );
}
