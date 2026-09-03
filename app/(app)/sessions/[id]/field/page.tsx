import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PrintButton } from "@/components/sessions/print-button";
import { SessionDrillPreview } from "@/components/sessions/session-drill-preview";
import { ButtonLink } from "@/components/ui/button";
import { materialSummary } from "@/lib/drills/materials";
import { formatArea, formatMeters } from "@/lib/drills/setup";
import { formatDate, getMessages, localeToIntl } from "@/lib/i18n";
import { getUserLocale } from "@/lib/i18n/server";
import { getUserSession, type SessionDrillDetail } from "@/lib/sessions/queries";
import { calculateSessionDuration, effectiveStationDuration, formatTimelineRange, groupByTrainingBlock, normalizeSimultaneousGroup, resolveGroupName, stationSetLabel, stationSetOptions } from "@/lib/sessions/utils";
import { createClient } from "@/lib/supabase/server";
import type { SessionPlayerGroup } from "@/types/domain";

type FieldViewPageProps = {
  params: Promise<{ id: string }>;
};

export default async function FieldViewPage({ params }: FieldViewPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const session = await getUserSession(supabase, user.id, id);
  if (!session) notFound();

  const locale = await getUserLocale(supabase, user.id);
  const messages = getMessages(locale);
  const total = calculateSessionDuration(session.drills);
  const blocks = groupByTrainingBlock(session.drills);
  let cursor = 0;

  return (
    <div className="print-page mx-auto max-w-[980px] bg-white text-slate-950 shadow-soft print:max-w-none print:shadow-none">
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-board-line bg-white p-4">
        <Link href={`/sessions/${session.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
          <ArrowLeft className="h-4 w-4" />
          {messages.export.actions.backToTrainingPlan}
        </Link>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <ButtonLink href={`/sessions/${session.id}/print`} variant="secondary" className="flex-1 justify-center sm:flex-none">{messages.export.actions.fullTraining}</ButtonLink>
          <PrintButton className="flex-1 justify-center sm:flex-none" locale={locale} />
        </div>
      </div>

      <article className="space-y-5 rounded-xl border border-board-line bg-white p-4 print:space-y-4 print:border-0 print:p-0 sm:p-6">
        <header className="print-avoid rounded-xl bg-board-navy p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-200">{messages.export.document.fieldView}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal">{session.title}</h1>
          <p className="mt-2 text-sm text-white/80">
            {[session.teamAgeGroup, formatDate(session.date, locale, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }), session.startTime, `${total} min`, session.location].filter(Boolean).join(" · ")}
          </p>
          {session.mainFocus ? <p className="mt-3 text-sm font-semibold">{session.mainFocus}{session.secondaryFocus ? ` · ${session.secondaryFocus}` : ""}</p> : null}
        </header>

        <section className="print-avoid grid gap-3 sm:grid-cols-3">
          <FieldMetric label={messages.export.document.expectedPlayers} value={session.expectedPlayers ? String(session.expectedPlayers) : messages.export.document.notSet} />
          <FieldMetric label={messages.export.document.totalDuration} value={`${total} min`} />
          <FieldMetric label={messages.export.document.sessionPlan} value={`${session.drills.length}`} />
        </section>

        <section className="print-avoid rounded-xl border border-board-line p-4">
          <h2 className="text-lg font-bold text-board-navy">{messages.export.document.trainingTimeline}</h2>
          <ol className="mt-3 divide-y divide-board-line">
            {blocks.flatMap((block) => block.items).map((item, index) => (
              <li key={item.id} className="grid grid-cols-[2.5rem_1fr_auto] gap-3 py-2 text-sm">
                <span className="font-bold text-board-green">{String(index + 1).padStart(2, "0")}</span>
                <span>
                  <span className="font-bold text-board-navy">{item.drill.title}</span>
                  <span className="block text-xs text-slate-500">{item.block}{item.timingMode === "simultaneous" ? ` · ${stationSetLabel(item.simultaneousGroup)}` : ""}</span>
                </span>
                <span className="font-bold text-slate-700">{item.plannedDurationMinutes} min</span>
              </li>
            ))}
          </ol>
        </section>

        {blocks.map((block) => {
          const blockStart = cursor;
          cursor += block.duration;
          return (
            <section key={block.block} className="space-y-3">
              <div className="print-avoid border-b border-board-line pb-2">
                <p className="text-xs font-bold uppercase text-board-green">{formatTimelineRange(blockStart, block.duration, session.startTime)}</p>
                <h2 className="text-xl font-bold text-board-navy">{block.block} · {block.duration} min</h2>
              </div>

              {stationSetOptions.map((set) => {
                const setItems = block.items.filter((item) => item.timingMode === "simultaneous" && normalizeSimultaneousGroup(item.simultaneousGroup) === set.id);
                if (!setItems.length) return null;
                const setDuration = Math.max(...setItems.map((item) => effectiveStationDuration(item)));
                return (
                  <section key={`${block.block}-${set.id}`} className="print-avoid rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
                    <h3 className="text-sm font-bold uppercase text-board-green">{set.label} · {setDuration} min</h3>
                    <div className="mt-3 grid gap-3">
                      {setItems.map((item, index) => <FieldDrill key={item.id} item={item} index={index + 1} playerGroups={session.playerGroups} locale={locale} />)}
                    </div>
                  </section>
                );
              })}

              {block.items.filter((item) => item.timingMode !== "simultaneous").map((item, index) => (
                <FieldDrill key={item.id} item={item} index={index + 1} playerGroups={session.playerGroups} locale={locale} />
              ))}
            </section>
          );
        })}
      </article>
    </div>
  );
}

function FieldDrill({ item, index, playerGroups, locale }: { item: SessionDrillDetail; index: number; playerGroups: SessionPlayerGroup[]; locale: "en" | "de" }) {
  const messages = getMessages(locale);
  const intlLocale = localeToIntl(locale);
  const drill = item.drill;
  const area = formatArea(drill.setupArea, intlLocale);
  const coachingPoints = splitLines(drill.coachingPoints).slice(0, 5);

  return (
    <article className="print-avoid rounded-lg border border-board-line bg-white p-3">
      <div className="grid gap-3 md:grid-cols-[300px_1fr] print:grid-cols-[260px_1fr]">
        <div className="overflow-hidden rounded-md border border-board-line bg-board-grass">
          <SessionDrillPreview graphic={item.graphic} previewMode="print" />
        </div>
        <div>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase text-board-green">{String(index).padStart(2, "0")}</p>
              <h3 className="text-lg font-bold text-board-navy">{drill.title}</h3>
            </div>
            <span className="rounded-full bg-board-paper px-3 py-1 text-xs font-bold text-board-navy">{item.plannedDurationMinutes} min</span>
          </div>

          <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
            <span className="rounded bg-slate-50 px-2 py-1">{messages.export.document.players}: {drill.minPlayers}-{drill.maxPlayers}</span>
            {area ? <span className="rounded bg-slate-50 px-2 py-1">{messages.export.document.area}: {area}</span> : null}
            {item.timingMode === "simultaneous" ? (
              <span className="rounded bg-slate-50 px-2 py-1">
                {messages.export.document.groups}: {item.participatingGroups?.length ? item.participatingGroups.map((groupId) => resolveGroupName(playerGroups, groupId)).join(", ") : messages.export.document.notSet}
              </span>
            ) : null}
          </div>

          {(drill.materials.length || drill.setupParameters.length || drill.setupNotes) ? (
            <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
              {drill.materials.length ? <p><span className="font-bold">{messages.export.document.materials}:</span> {materialSummary(drill.materials)}</p> : null}
              {drill.setupParameters.map((parameter) => (
                <p key={parameter.id}><span className="font-bold">{parameter.label}:</span> {formatMeters(parameter.value, intlLocale)}</p>
              ))}
              {drill.setupNotes ? <p className="mt-1 whitespace-pre-wrap">{drill.setupNotes}</p> : null}
            </div>
          ) : null}

          {coachingPoints.length ? (
            <div className="mt-3">
              <p className="text-xs font-bold uppercase text-board-green">{messages.export.document.coachingPoints}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {coachingPoints.map((point) => <li key={point}>{point}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function FieldMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-board-line bg-white p-3">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-board-navy">{value}</p>
    </div>
  );
}

function splitLines(value?: string) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean);
}
