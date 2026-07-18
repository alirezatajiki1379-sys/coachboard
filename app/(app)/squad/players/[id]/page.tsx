import Link from "next/link";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BarChart3, CalendarDays, FileText, Footprints, Mail, Phone, Printer } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PlayerActions } from "@/components/squad/player-actions";
import { PlayerDevelopmentSection } from "@/components/squad/player-development";
import { createPlayerCoachAssessment } from "@/lib/squad/analytics-actions";
import {
  analyticsPeriodLabels,
  coachAssessmentLabels,
  formatPercent,
  formatRating,
  type AnalyticsPeriod
} from "@/lib/squad/analytics";
import { getPlayerAnalytics } from "@/lib/squad/analytics-queries";
import { createClient } from "@/lib/supabase/server";
import { getPlayerDevelopmentProfile } from "@/lib/squad/development";
import { formatPlayerBirthDate, playerFullName } from "@/lib/squad/format";
import { finalStatusLabel, formatEventDate, plannedReasonLabel, plannedStatusLabel, reliabilityMalus } from "@/lib/squad/attendance-format";

type PlayerDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const playerDetailPeriods = (Object.keys(analyticsPeriodLabels) as AnalyticsPeriod[]).filter((period) => period !== "custom");

export default async function PlayerDetailPage({ params, searchParams }: PlayerDetailPageProps) {
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
  const development = await getPlayerDevelopmentProfile(supabase, user.id, id);
  const { player, summary, assessmentHistory } = analytics;
  const history = summary.records;

  const fullName = playerFullName(player);
  const rated = history.filter((entry) => entry.overallRating);
  const averageRating = rated.length ? (rated.reduce((sum, entry) => sum + (entry.overallRating ?? 0), 0) / rated.length).toFixed(1) : "-";
  const lateCount = history.filter((entry) => entry.finalStatus === "Z").length;
  const unexcusedCount = history.filter((entry) => entry.finalStatus === "U").length;
  const malus = history.reduce((sum, entry) => sum + reliabilityMalus(entry), 0);

  return (
    <div className="space-y-6">
      <Link href="/squad" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
        <ArrowLeft className="h-4 w-4" />
        Back to squad
      </Link>

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">{fullName}</h1>
            <div className="mt-3">
              {player.position ? (
                <span className="inline-flex rounded-full bg-green-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-board-green ring-1 ring-green-100">
                  Position: {player.position}
                </span>
              ) : (
                <span className="text-sm font-semibold text-slate-500">No position set</span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-600">
              {player.dateOfBirth ? <span className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2 py-1"><CalendarDays className="h-4 w-4" />{formatPlayerBirthDate(player.dateOfBirth)}</span> : null}
              {player.strongFoot ? <span className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2 py-1"><Footprints className="h-4 w-4" />{player.strongFoot}</span> : null}
              {player.club ? <span className="rounded-md bg-slate-100 px-2 py-1">{player.club}</span> : null}
              {player.archivedAt ? <span className="rounded-md bg-amber-50 px-2 py-1 font-bold text-amber-700">Archived</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!player.archivedAt ? (
              <ButtonLink href={`/squad/players/${player.id}/edit`} variant="secondary">
                Edit
              </ButtonLink>
            ) : null}
            <ButtonLink href={`/squad/players/${player.id}/report?period=${period}`} variant="secondary">
              <Printer className="h-4 w-4" />
              Report
            </ButtonLink>
            <PlayerActions playerId={player.id} archived={Boolean(player.archivedAt)} />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-board-navy"><BarChart3 className="h-5 w-5" />Player analytics</h2>
            <p className="mt-1 text-sm text-slate-600">Period: {analyticsPeriodLabels[period]}. Unrated trainings stay unrated and are not counted as 3.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {playerDetailPeriods.map((item) => (
              <Link
                key={item}
                href={item === "season" ? `/squad/players/${player.id}` : `/squad/players/${player.id}?period=${item}`}
                className={`rounded-md px-3 py-2 text-sm font-semibold ${period === item ? "bg-board-green text-white" : "bg-slate-100 text-slate-600 hover:bg-green-50 hover:text-board-green"}`}
              >
                {analyticsPeriodLabels[item]}
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Trainings" value={String(summary.trainings)} />
          <Stat label="Attendance" value={formatPercent(summary.attendanceRate)} />
          <Stat label="Average rating" value={formatRating(summary.averageRating)} />
          <Stat label="Trend" value={summary.trend.value === null ? summary.trend.label : `${summary.trend.value > 0 ? "+" : ""}${summary.trend.value.toFixed(1)} · ${summary.trend.label}`} />
          <Stat label="Rated trainings" value={String(summary.rated)} />
          <Stat label="Data basis" value={summary.evidenceBase.label} />
          <Stat label="Reliability" value={summary.reliabilityPenalty.toFixed(1)} />
          <Stat label="Latest rating" value={summary.latestRating ? String(summary.latestRating) : "No rating"} />
        </div>
        <p className="mt-3 text-sm text-slate-600">{summary.trend.description}</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-md bg-slate-50 p-4">
            <p className="text-sm font-bold text-board-navy">Detail categories</p>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              {summary.categorySummaries.some((category) => category.count) ? (
                summary.categorySummaries.map((category) => (
                  <p key={category.key} className="flex justify-between gap-3">
                    <span>{category.label}</span>
                    <span className="font-semibold text-board-navy">{formatRating(category.average)} · {category.count} rated</span>
                  </p>
                ))
              ) : (
                <p>No category ratings available for this period.</p>
              )}
            </div>
            {summary.highestRatedArea && summary.lowestRatedArea ? (
              <p className="mt-3 text-xs font-semibold text-slate-500">
                Highest-rated area: {summary.highestRatedArea.label}. Lowest-rated area: {summary.lowestRatedArea.label}.
              </p>
            ) : null}
          </div>
          <div className="rounded-md bg-slate-50 p-4">
            <p className="text-sm font-bold text-board-navy">Data summary</p>
            <p className="mt-2 text-sm text-slate-600">{summary.dataSummary}</p>
            <p className="mt-2 text-xs text-slate-500">This is a cautious summary of existing data, not a squad decision.</p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title="Contact">
          <DetailRow icon={<Phone className="h-4 w-4" />} label="Player phone" value={player.playerPhone} href={player.playerPhone ? `tel:${player.playerPhone}` : undefined} />
          <DetailRow icon={<Phone className="h-4 w-4" />} label="Parent phone" value={player.parentPhone} href={player.parentPhone ? `tel:${player.parentPhone}` : undefined} />
          <DetailRow icon={<Mail className="h-4 w-4" />} label="Parent email" value={player.parentEmail} href={player.parentEmail ? `mailto:${player.parentEmail}` : undefined} />
        </DetailSection>

        <DetailSection title="Player notes">
          <DetailRow label="Old development note" value={player.developmentGoal} />
          <DetailRow label="Work on" value={player.workOn} />
          <DetailRow label="Hobbies" value={player.hobbies} />
          <DetailRow label="Coach notes" value={player.notes} />
        </DetailSection>
      </div>

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="flex items-center gap-2 text-lg font-bold text-board-navy"><FileText className="h-5 w-5" />Coach assessment</h2>
        <p className="mt-1 text-sm text-slate-600">Manual assessment is separate from automatic data summaries.</p>
        {summary.assessment ? (
          <div className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">
            <p className="font-bold">{coachAssessmentLabels[summary.assessment.assessment]}</p>
            {summary.assessment.reason ? <p className="mt-1 whitespace-pre-wrap">{summary.assessment.reason}</p> : null}
            <p className="mt-1 text-xs font-semibold">Assessment date: {formatEventDate(summary.assessment.assessmentDate)}{summary.assessment.reviewDate ? ` · Review: ${formatEventDate(summary.assessment.reviewDate)}` : ""}</p>
          </div>
        ) : (
          <p className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-600">No coach assessment yet.</p>
        )}
        <form action={createPlayerCoachAssessment} className="mt-4 grid gap-3 md:grid-cols-2">
          <input type="hidden" name="playerId" value={player.id} />
          <input type="hidden" name="returnTo" value={`/squad/players/${player.id}?period=${period}`} />
          <label>
            <span className="text-sm font-medium text-slate-700">Assessment</span>
            <select name="assessment" defaultValue={summary.assessment?.assessment ?? "decision_open"} className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
              {Object.entries(coachAssessmentLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-sm font-medium text-slate-700">Assessment date</span>
            <input name="assessmentDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
          </label>
          <label>
            <span className="text-sm font-medium text-slate-700">Review date</span>
            <input name="reviewDate" type="date" defaultValue={summary.assessment?.reviewDate ?? ""} className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
          </label>
          <label className="md:col-span-2">
            <span className="text-sm font-medium text-slate-700">Reason</span>
            <textarea name="reason" defaultValue={summary.assessment?.reason ?? ""} rows={3} className="mt-1 w-full rounded-md border border-board-line bg-white px-3 py-2 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
          </label>
          <div className="md:col-span-2">
            <button type="submit" className="inline-flex h-10 items-center justify-center rounded-md bg-board-green px-4 text-sm font-bold text-white hover:bg-green-700">
              Save coach assessment
            </button>
          </div>
        </form>
        {assessmentHistory.length > 1 ? (
          <div className="mt-4 rounded-md border border-board-line p-3">
            <p className="text-sm font-bold text-board-navy">Previous assessments</p>
            <div className="mt-2 space-y-2 text-sm text-slate-600">
              {assessmentHistory.slice(1, 5).map((assessment) => (
                <p key={assessment.id}>{formatEventDate(assessment.assessmentDate)} · {coachAssessmentLabels[assessment.assessment]}</p>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <PlayerDevelopmentSection playerId={player.id} development={development} />

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">Training history</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Attendances" value={String(history.filter((entry) => entry.finalStatus === "present" || entry.finalStatus === "Z").length)} />
          <Stat label="Rated trainings" value={String(rated.length)} />
          <Stat label="Average rating" value={averageRating} />
          <Stat label="Late" value={String(lateCount)} />
          <Stat label="Reliability malus" value={String(malus)} />
        </div>
        {unexcusedCount ? <p className="mt-3 text-sm font-semibold text-red-700">{unexcusedCount} unexcused absence{unexcusedCount === 1 ? "" : "s"}</p> : null}
        <div className="mt-5 space-y-3">
          {history.length ? (
            history.map((entry) => (
              <article key={entry.id} className="rounded-md border border-board-line bg-board-paper p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-board-navy">
                      {entry.event ? (
                        <Link href={`/trainings/${entry.event.id}`} className="underline-offset-4 hover:text-board-green hover:underline">
                          {formatEventDate(entry.event.date)} · {entry.event.label || "Training"}
                        </Link>
                      ) : "Training"}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Planned: {plannedStatusLabel(entry.plannedStatus)} · Actual: {finalStatusLabel(entry.finalStatus)}
                      {entry.overallRating ? ` · Rating: ${entry.overallRating}` : ""}
                      {entry.plannedReason ? ` · Reason: ${plannedReasonLabel(entry.plannedReason)}` : ""}
                      {entry.lateMinutes ? ` · Late: ${entry.lateMinutes} min` : ""}
                      {` · Malus: ${reliabilityMalus(entry)}`}
                    </p>
                  </div>
                  {entry.sensitiveNote ? <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-700">Sensitive note</span> : null}
                </div>
                {entry.coachNote && !entry.sensitiveNote ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{entry.coachNote}</p> : null}
              </article>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-board-line p-4 text-sm text-slate-600">No training history yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <h2 className="text-lg font-bold text-board-navy">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function DetailRow({ label, value, icon, href }: { label: string; value?: string; icon?: ReactNode; href?: string }) {
  const content = value || "Not added yet";
  return (
    <div>
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </p>
      {href && value ? (
        <a href={href} className="mt-1 block whitespace-pre-line text-sm font-semibold text-board-navy underline-offset-4 hover:underline">{content}</a>
      ) : (
        <p className="mt-1 whitespace-pre-line text-sm font-semibold text-board-navy">{content}</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
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
