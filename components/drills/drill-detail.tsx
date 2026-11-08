import Link from "next/link";
import { ArrowLeft, Edit, FileText } from "lucide-react";
import { trainingBlocks } from "@/config/options";
import { ButtonLink } from "@/components/ui/button";
import { DrillActions } from "@/components/drills/drill-actions";
import { DrillVisualPreview } from "@/components/drills/drill-visual-preview";
import { DrillMaterialLabel } from "@/components/drills/drill-material-label";
import { drillAgeLabel, drillUsageDate } from "@/lib/drills/display";
import { formatMeters } from "@/lib/drills/setup";
import { drillFeedbackStatusLabels } from "@/lib/squad/session-review";
import { createSystemTranslator } from "@/lib/i18n/system-text";
import type { DrillUsageStats } from "@/lib/drills/usage";
import type { Locale } from "@/lib/i18n";
import type { Drill, DrillVisual } from "@/types/domain";

export function DrillDetail({ drill, visual, usage, locale }: { drill: Drill; visual?: DrillVisual; usage?: DrillUsageStats; locale: Locale }) {
  const ui = createSystemTranslator(locale);
  const view = drill.deletedAt ? "trash" : drill.archivedAt ? "archived" : "active";
  const hasSetup = drill.setupArea?.length || drill.setupArea?.width || drill.setupParameters.length || drill.setupNotes?.trim();
  const hasSource = drill.sourceTitle || drill.sourcePublisher || drill.sourcePage || drill.sourceReference;
  return (
    <div className="min-w-0 space-y-6 break-words">
      <Link href="/drills" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy"><ArrowLeft className="h-4 w-4" />{ui("Back to library")}</Link>
      <header className="min-w-0 space-y-3 border-b border-board-line pb-5">
        <div className="flex flex-wrap gap-2 text-xs font-bold text-board-green">
          <span>{ui(drill.mainFocus)}</span>
          {drill.subFocus ? <span translate="no">{drill.subFocus}</span> : null}
          {drill.status === "draft" ? <span>{ui("Reusable Draft")}</span> : null}
          {view !== "active" ? <span>{ui(view === "trash" ? "Trash" : "Archived")}</span> : null}
        </div>
        <h1 translate="no" className="text-2xl font-bold text-board-navy sm:text-3xl">{drill.title}</h1>
        {drill.shortDescription ? <p translate="no" className="max-w-3xl whitespace-pre-wrap text-slate-600">{drill.shortDescription}</p> : null}
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Fact label={ui("Duration")} value={`${drill.durationMinutes} ${ui("min")}`} />
          <Fact label={ui("Players")} value={`${drill.minPlayers}-${drill.maxPlayers}`} />
          <Fact label={ui("Age suitability")} value={drillAgeLabel(drill, locale)} />
          {drill.drillType ? <Fact label={ui("Drill type")} value={ui(drill.drillType)} /> : null}
        </dl>
        <div className="flex flex-wrap gap-2">
          {view !== "trash" ? <ButtonLink href={`/drills/${drill.id}/edit`} variant="secondary"><Edit className="h-4 w-4" />{ui(drill.status === "draft" ? "Continue editing" : "Edit")}</ButtonLink> : null}
          <ButtonLink href={`/drills/${drill.id}/print`} variant="secondary"><FileText className="h-4 w-4" />{ui("Print Drill")}</ButtonLink>
          <DrillActions drillId={drill.id} isFavorite={drill.isFavorite} view={view} isDraft={drill.status === "draft"} compact />
        </div>
      </header>
      <section aria-label={ui("Drill visual")} className="max-w-4xl overflow-hidden rounded-lg border border-board-line">
        <DrillVisualPreview visual={visual} title={drill.title} />
      </section>
      <ContentBlock title={ui("Organization / Flow")} value={drill.organization} />
      <ContentBlock title={ui("Coaching points")} value={drill.coachingPoints} />
      <ContentBlock title={ui("Variations")} value={drill.variations} />
      {drill.easierVersion?.trim() || drill.harderVersion?.trim() ? <div className="grid min-w-0 gap-6 md:grid-cols-2">
        <ContentBlock title={ui("Easier version")} value={drill.easierVersion} />
        <ContentBlock title={ui("Harder version")} value={drill.harderVersion} />
      </div> : null}
      {hasSetup ? <section className="space-y-3 border-t border-board-line pt-5">
        <h2 className="text-lg font-bold text-board-navy">{ui("Setup")}</h2>
        <dl className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
          {drill.setupArea?.length ? <Fact label={ui("Length")} value={formatMeters(drill.setupArea.length, locale)} /> : null}
          {drill.setupArea?.width ? <Fact label={ui("Width")} value={formatMeters(drill.setupArea.width, locale)} /> : null}
          {drill.setupParameters.map((parameter) => <Fact key={parameter.id} label={parameter.label} value={formatMeters(parameter.value, locale)} userContent />)}
        </dl>
        {drill.setupNotes ? <p translate="no" className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{drill.setupNotes}</p> : null}
      </section> : null}
      {drill.materials.length ? <section className="space-y-3 border-t border-board-line pt-5">
        <h2 className="text-lg font-bold text-board-navy">{ui("Materials")}</h2>
        <ul className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
          {drill.materials.map((material, index) => <li key={index} className="min-w-0"><DrillMaterialLabel material={material} locale={locale} /></li>)}
        </ul>
      </section> : null}
      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
        <Fact label={ui("Difficulty")} value={`${drill.difficultyLevel}/5`} />
        <Fact label={ui("Intensity")} value={`${drill.intensityLevel}/5`} />
        {drill.trainingBlocks.length ? <Fact label={ui("Training blocks")} value={drill.trainingBlocks.map((block) => ui(block)).join(", ")} /> : null}
      </dl>
      <UsageSection usage={usage} locale={locale} />
      {hasSource ? <section className="space-y-3 border-t border-board-line pt-5">
        <h2 className="text-lg font-bold text-board-navy">{ui("Source")}</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {drill.sourcePublisher ? <Fact label={ui("Publisher")} value={drill.sourcePublisher} userContent /> : null}
          {drill.sourceTitle ? <Fact label={ui("Source title")} value={drill.sourceTitle} userContent /> : null}
          {drill.sourcePage ? <Fact label={ui("Page")} value={drill.sourcePage} userContent /> : null}
          {drill.sourceReference ? <Fact label={ui("Reference")} value={drill.sourceReference} userContent /> : null}
        </dl>
      </section> : null}
      {drill.tags.length ? <section className="space-y-2 border-t border-board-line pt-5"><h2 className="text-sm font-bold text-slate-500">{ui("Tags")}</h2><p translate="no" className="whitespace-pre-wrap text-sm text-slate-600">{drill.tags.join(", ")}</p></section> : null}
    </div>
  );
}

function UsageSection({ usage, locale }: { usage?: DrillUsageStats; locale: Locale }) {
  const ui = createSystemTranslator(locale);
  const history = usage?.history ?? [];
  const average = usage?.reviewedUseCount ? usage.averageEffectiveness : undefined;
  return <section className="min-w-0 space-y-4 border-t border-board-line pt-5">
    <h2 className="text-lg font-bold text-board-navy">{ui("Usage")}</h2>
    {usage?.usageUnavailable ? <p className="text-sm text-slate-600">{ui("Usage data is currently unavailable. The drill itself is still safe to view and edit.")}</p> : <>
      <dl className="grid min-w-0 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Fact label={ui("Times used")} value={usage?.historicalUseCount ? String(usage.historicalUseCount) : ui("Never used")} />
        <Fact label={ui("Last used")} value={usage?.lastUsedAt ? drillUsageDate(usage.lastUsedAt, locale) : ui("Never")} />
        <Fact label={ui("Reviews")} value={String(usage?.reviewedUseCount ?? 0)} />
        <Fact label={ui("Average effectiveness")} value={average != null ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(average)} / 5` : ui("No feedback yet")} />
      </dl>
      {usage && Object.values(usage.feedbackCounts).some((count) => count > 0) ? <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {Object.entries(usage.feedbackCounts).map(([key, count]) => <Fact key={key} label={ui(drillFeedbackStatusLabels[key as keyof typeof drillFeedbackStatusLabels])} value={String(count)} />)}
      </dl> : null}
      {usage?.teamBreakdown && usage.teamBreakdown.length > 1 ? <div><h3 className="text-sm font-bold text-slate-500">{ui("Team usage")}</h3><ul className="mt-2 flex flex-wrap gap-3 text-sm">{usage.teamBreakdown.map((team) => <li key={team.teamId}><span translate="no">{team.teamName}</span>: {team.count}</li>)}</ul></div> : null}
      <div>
        <h3 className="text-sm font-bold text-slate-500">{ui("Usage history")}</h3>
        {history.length ? <div className="mt-2 divide-y divide-board-line">
          {history.slice(0, 12).map((item) => <Link key={item.instanceId} href={`/trainings/${item.eventId}`} className="block min-w-0 py-3 transition-colors hover:bg-slate-50 focus-visible:outline-board-green">
            <p className="flex flex-wrap justify-between gap-2 text-sm font-bold text-board-navy"><span>{drillUsageDate(item.date, locale)} · <span translate="no">{item.trainingTitle}</span></span>{item.effectivenessRating ? <span>{item.effectivenessRating} / 5</span> : null}</p>
            <p className="mt-1 text-xs text-slate-500"><span translate="no">{[item.teamName, item.trainingFocus].filter(Boolean).join(" · ")}</span>{item.block ? <> · <span translate="no">{trainingBlocks.some((block) => block === item.block) ? ui(item.block) : item.block}</span></> : null}{item.durationMinutes ? ` · ${item.durationMinutes} ${ui("min")}` : null}</p>
            {item.feedbackStatus ? <p className="mt-1 text-sm font-semibold text-board-green">{ui(drillFeedbackStatusLabels[item.feedbackStatus])}</p> : null}
            {item.reviewNote ? <p translate="no" className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{item.reviewNote}</p> : null}
          </Link>)}
        </div> : <p className="mt-2 text-sm text-slate-500">{ui("This reusable drill has not appeared in a historical training yet.")}</p>}
      </div>
    </>}
  </section>;
}

function Fact({ label, value, userContent = false }: { label: string; value: string; userContent?: boolean }) {
  return <div className="min-w-0"><dt className="text-xs font-semibold text-slate-500" translate={userContent ? "no" : undefined}>{label}</dt><dd className="mt-1 whitespace-pre-wrap font-semibold text-board-navy" translate={userContent ? "no" : undefined}>{value}</dd></div>;
}

function ContentBlock({ title, value }: { title: string; value?: string }) {
  if (!value?.trim()) return null;
  return <section className="min-w-0 border-t border-board-line pt-5"><h2 className="text-lg font-bold text-board-navy">{title}</h2><p translate="no" className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{value}</p></section>;
}
