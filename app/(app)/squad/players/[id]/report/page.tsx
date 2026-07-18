import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/sessions/print-button";
import {
  analyticsPeriodLabels,
  attendanceStatusLabel,
  coachAssessmentLabels,
  formatPercent,
  formatRating,
  type AnalyticsPeriod
} from "@/lib/squad/analytics";
import { getPlayerAnalytics } from "@/lib/squad/analytics-queries";
import { finalStatusLabel, formatEventDate, reliabilityMalus } from "@/lib/squad/attendance-format";
import { playerFullName } from "@/lib/squad/format";
import { createClient } from "@/lib/supabase/server";

type PlayerReportPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PlayerReportPage({ params, searchParams }: PlayerReportPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const period = parsePeriod(query.period);
  const analytics = await getPlayerAnalytics(supabase, user.id, id, period);
  if (!analytics) notFound();

  const { player, summary } = analytics;
  const fullName = playerFullName(player);
  const normalNotes = summary.records.filter((record) => record.coachNote && !record.sensitiveNote);

  return (
    <main className="mx-auto max-w-5xl bg-white px-4 py-6 text-slate-900 print:max-w-none print:px-0 print:py-0">
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          body { background: white !important; }
          .print-page { box-shadow: none !important; border: 0 !important; }
          .print-avoid-break { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/squad/players/${player.id}?period=${period}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
          <ArrowLeft className="h-4 w-4" />
          Back to player
        </Link>
        <PrintButton />
      </div>

      <article className="print-page rounded-lg border border-board-line bg-white p-6 shadow-soft print:p-0">
        <header className="border-b border-board-line pb-5">
          <p className="text-xs font-bold uppercase tracking-wide text-board-green">CoachBoard player report</p>
          <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-normal text-board-navy">{fullName}</h1>
              <p className="mt-2 text-sm text-slate-600">
                {player.position || "No position set"} · {player.playerType === "trial" ? "Trial player" : "Roster player"} · {analyticsPeriodLabels[period]}
              </p>
            </div>
            <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
              <p><span className="font-bold">Generated:</span> {formatEventDate(new Date().toISOString().slice(0, 10))}</p>
              <p><span className="font-bold">Data basis:</span> {summary.evidenceBase.label}</p>
            </div>
          </div>
        </header>

        <section className="print-avoid-break mt-6">
          <h2 className="text-lg font-bold text-board-navy">Summary</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ReportStat label="Trainings" value={String(summary.trainings)} />
            <ReportStat label="Rated trainings" value={String(summary.rated)} />
            <ReportStat label="Average rating" value={formatRating(summary.averageRating)} />
            <ReportStat label="Trend" value={summary.trend.value === null ? summary.trend.label : `${summary.trend.value > 0 ? "+" : ""}${summary.trend.value.toFixed(1)}`} />
            <ReportStat label="Attendance" value={formatPercent(summary.attendanceRate)} />
            <ReportStat label="Present incl. late" value={String(summary.attended)} />
            <ReportStat label="Late" value={String(summary.late)} />
            <ReportStat label="Reliability malus" value={summary.reliabilityPenalty.toFixed(1)} />
          </div>
          <p className="mt-3 text-sm text-slate-700">{summary.dataSummary}</p>
          <p className="mt-1 text-xs text-slate-500">{summary.evidenceBase.detail}</p>
        </section>

        <section className="print-avoid-break mt-6 grid gap-5 lg:grid-cols-2">
          <div>
            <h2 className="text-lg font-bold text-board-navy">Rating distribution</h2>
            <div className="mt-3 space-y-2">
              {([5, 4, 3, 2, 1] as const).map((rating) => (
                <div key={rating} className="grid grid-cols-[2.5rem_1fr_2rem] items-center gap-2 text-sm">
                  <span className="font-bold text-board-navy">{rating}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <span className="block h-full bg-board-green" style={{ width: summary.rated ? `${(summary.ratingDistribution[rating] / summary.rated) * 100}%` : "0%" }} />
                  </span>
                  <span className="text-right text-slate-600">{summary.ratingDistribution[rating]}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-lg font-bold text-board-navy">Attendance</h2>
            <div className="mt-3 grid gap-2 text-sm">
              {(Object.keys(summary.attendanceDistribution) as Array<keyof typeof summary.attendanceDistribution>).map((key) =>
                summary.attendanceDistribution[key] ? (
                  <p key={key} className="flex justify-between border-b border-slate-100 pb-1">
                    <span>{attendanceStatusLabel(key)}</span>
                    <span className="font-bold text-board-navy">{summary.attendanceDistribution[key]}</span>
                  </p>
                ) : null
              )}
            </div>
          </div>
        </section>

        <section className="print-avoid-break mt-6">
          <h2 className="text-lg font-bold text-board-navy">Detailed categories</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {summary.categorySummaries.map((category) => (
              <div key={category.key} className="rounded-md border border-board-line p-3">
                <p className="font-bold text-board-navy">{category.label}</p>
                <p className="mt-1 text-sm text-slate-700">Average: {formatRating(category.average)} · {category.count} rated</p>
                <p className="mt-1 text-xs text-slate-500">{category.trend.description}</p>
              </div>
            ))}
          </div>
        </section>

        {summary.assessment ? (
          <section className="print-avoid-break mt-6 rounded-md bg-green-50 p-4">
            <h2 className="text-lg font-bold text-board-navy">Coach assessment</h2>
            <p className="mt-2 font-bold text-green-800">{coachAssessmentLabels[summary.assessment.assessment]}</p>
            {summary.assessment.reason ? <p className="mt-1 whitespace-pre-wrap text-sm text-green-900">{summary.assessment.reason}</p> : null}
            <p className="mt-2 text-xs font-semibold text-green-800">
              Assessment date: {formatEventDate(summary.assessment.assessmentDate)}
              {summary.assessment.reviewDate ? ` · Review: ${formatEventDate(summary.assessment.reviewDate)}` : ""}
            </p>
          </section>
        ) : null}

        <section className="mt-6">
          <h2 className="text-lg font-bold text-board-navy">Training history</h2>
          <div className="mt-3 space-y-3">
            {summary.records.length ? (
              summary.records.map((record) => (
                <article key={record.id} className="print-avoid-break rounded-md border border-board-line p-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <p className="font-bold text-board-navy">{record.event ? `${formatEventDate(record.event.date)} · ${record.event.label || "Training"}` : "Training"}</p>
                    <p className="text-sm font-bold text-slate-700">{record.overallRating ? `Rating ${record.overallRating}` : "No rating"}</p>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    Actual: {finalStatusLabel(record.finalStatus)} · Reliability malus: {reliabilityMalus(record)}
                  </p>
                  {record.coachNote && !record.sensitiveNote ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{record.coachNote}</p> : null}
                </article>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-board-line p-4 text-sm text-slate-600">No training history in this period.</p>
            )}
          </div>
        </section>

        {normalNotes.length ? (
          <section className="print-avoid-break mt-6">
            <h2 className="text-lg font-bold text-board-navy">Coach notes</h2>
            <p className="mt-1 text-xs text-slate-500">Sensitive notes are intentionally not shown on printable reports.</p>
          </section>
        ) : null}

        <section className="print-avoid-break mt-6 rounded-md bg-slate-50 p-4 text-sm text-slate-700">
          <h2 className="text-base font-bold text-board-navy">How analytics are calculated</h2>
          <p className="mt-2">Average ratings only use saved final overall ratings from attended trainings. Unrated trainings are not treated as 3.</p>
          <p className="mt-1">Attendance and reliability are separate from performance. Late attendance counts as present, with reliability malus only when the late penalty is enabled.</p>
          <p className="mt-1">Trends compare the latest five rated trainings with the previous five rated trainings where enough data exists.</p>
        </section>
      </article>
    </main>
  );
}

function ReportStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-board-navy">{value}</p>
    </div>
  );
}

function parsePeriod(value?: string | string[]): AnalyticsPeriod {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "last5" || raw === "last10" || raw === "30d" || raw === "90d" || raw === "season" || raw === "all" ? raw : "season";
}
