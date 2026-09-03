"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart3, Clock, Edit, Eye, Users } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { DrillActions } from "@/components/drills/drill-actions";
import { SessionDrillPreview } from "@/components/sessions/session-drill-preview";
import { materialLineLabel } from "@/lib/drills/materials";
import { formatDrillAgeSuitability } from "@/lib/drills/age-suitability";
import type { Drill } from "@/types/domain";
import type { DrillEditorState } from "@/types/editor";
import type { DrillUsageStats } from "@/lib/drills/usage";

type DrillCardProps = {
  drill: Drill & { graphic?: DrillEditorState; usage?: DrillUsageStats };
  view?: "active" | "published" | "drafts" | "archived" | "trash";
};

export function DrillCard({ drill, view = "active" }: DrillCardProps) {
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
    <article className="rounded-lg border border-board-line bg-white shadow-soft">
      <div className="overflow-hidden rounded-t-lg bg-board-grass">
        <SessionDrillPreview graphic={drill.graphic} previewMode="thumbnail" />
      </div>
      <div className="p-5">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase text-board-green">{drill.mainFocus}</p>
                {drill.status === "draft" ? <StatusBadge label="Draft" /> : null}
                {drill.status === "draft" ? <StatusBadge label="Reusable Draft" neutral /> : null}
                {view === "archived" ? <StatusBadge label="Archived" /> : null}
                {view === "trash" ? <StatusBadge label="Trash" danger /> : null}
              </div>
              <h2 className="mt-1 line-clamp-2 text-xl font-bold tracking-normal text-board-navy">{drill.title}</h2>
            </div>
            <div className="shrink-0">
              <DrillActions drillId={drill.id} isFavorite={drill.isFavorite} view={view} compact isDraft={drill.status === "draft"} />
            </div>
          </div>

          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
            {drill.shortDescription || "No short description yet."}
          </p>

          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
            <span className="rounded-md bg-slate-100 px-2 py-1">{formatDrillAgeSuitability(drill)}</span>
            <span className="rounded-md bg-slate-100 px-2 py-1">{drill.trainingBlocks.join(", ")}</span>
            <span className="rounded-md bg-slate-100 px-2 py-1">{drill.drillType}</span>
          </div>

          <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            <span className="inline-flex items-center gap-2">
              <Clock className="h-4 w-4 text-board-green" />
              {drill.durationMinutes} min
            </span>
            <span className="inline-flex items-center gap-2">
              <Users className="h-4 w-4 text-board-green" />
              {drill.minPlayers}-{drill.maxPlayers} players
            </span>
          </div>

          <div className="mt-4 rounded-md border border-board-line bg-slate-50 px-3 py-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-600">
              <span className="inline-flex items-center gap-1.5 text-board-navy">
                <BarChart3 className="h-3.5 w-3.5 text-board-green" />
                {usageSummary(drill.usage)}
              </span>
              <span>{lastUsedSummary(drill.usage)}</span>
              <span>{effectivenessSummary(drill.usage)}</span>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-board-green">Materials</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {visibleMaterials.length ? (
                <>
                  {visibleMaterials.map((material, index) => (
                    <span
                      key={`${material.type}-${material.color ?? "none"}-${material.variant ?? "none"}-${material.label ?? "none"}-${index}`}
                      className="rounded-md border border-board-line bg-board-cream px-2 py-1 text-xs font-semibold leading-none text-board-navy"
                    >
                      {materialLineLabel(material)}
                    </span>
                  ))}
                  {extraMaterialCount ? (
                    <span ref={materialsPopoverRef} className="relative inline-flex">
                      <button
                        type="button"
                        aria-expanded={materialsOpen}
                        onClick={() => setMaterialsOpen((open) => !open)}
                        className="rounded-md border border-dashed border-board-line bg-white px-2 py-1 text-xs font-semibold leading-none text-slate-500 transition hover:border-board-green hover:text-board-green focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-board-green"
                      >
                        +{extraMaterialCount} more
                      </button>
                      {materialsOpen ? (
                        <div className="absolute right-0 top-full z-20 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-board-line bg-white p-3 text-left shadow-soft">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-board-green">All materials</p>
                          <div className="mt-2 flex max-h-[min(20rem,calc(100vh-8rem))] flex-wrap gap-1.5 overflow-y-auto pr-1">
                            {drill.materials.map((material, index) => (
                              <span
                                key={`popover-${material.type}-${material.color ?? "none"}-${material.variant ?? "none"}-${material.label ?? "none"}-${index}`}
                                className="rounded-md border border-board-line bg-board-cream px-2 py-1 text-xs font-semibold leading-none text-board-navy"
                              >
                                {materialLineLabel(material)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-xs font-semibold text-slate-400">No materials</span>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink href={`/drills/${drill.id}`} variant="secondary" className="h-9 px-3">
              <Eye className="h-4 w-4" />
              Preview
            </ButtonLink>
            {view !== "trash" ? <ButtonLink href={`/drills/${drill.id}/edit`} variant="secondary" className="h-9 px-3">
              <Edit className="h-4 w-4" />
              {drill.status === "draft" ? "Continue editing" : "Edit"}
            </ButtonLink> : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function usageSummary(usage?: DrillUsageStats) {
  if (usage?.usageUnavailable) return "Usage unavailable";
  const count = usage?.historicalUseCount ?? 0;
  if (!count) return "Never used";
  return `Used ${count} time${count === 1 ? "" : "s"}`;
}

function lastUsedSummary(usage?: DrillUsageStats) {
  if (usage?.usageUnavailable) return "";
  if (!usage?.lastUsedAt) return "No historical use";
  return `Last used ${formatShortDate(usage.lastUsedAt)}`;
}

function effectivenessSummary(usage?: DrillUsageStats) {
  if (usage?.usageUnavailable) return "";
  if (!usage?.historicalUseCount) return "No review data";
  if (!usage.reviewedUseCount || usage.averageEffectiveness == null) return "No ratings yet";
  return `${usage.averageEffectiveness.toFixed(1)} / 5 · ${usage.reviewedUseCount} review${usage.reviewedUseCount === 1 ? "" : "s"}`;
}

function formatShortDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(parsed);
}

function StatusBadge({ label, danger = false, neutral = false }: { label: string; danger?: boolean; neutral?: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${danger ? "bg-red-50 text-red-700" : neutral ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
      {label}
    </span>
  );
}
