import Link from "next/link";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { Activity, ArrowLeft, BarChart3, CalendarDays, ClipboardList, FileText, Footprints, Phone, Printer, ShieldAlert, SlidersHorizontal, Stethoscope, Target, UserRound } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { PlayerActions } from "@/components/squad/player-actions";
import { PlayerDevelopmentSection } from "@/components/squad/player-development";
import { createPlayerCoachAssessment } from "@/lib/squad/analytics-actions";
import {
  analyticsPeriodLabels,
  coachAssessmentLabels,
  formatPercent,
  formatRating,
  type AnalyticsPeriod,
  type PlayerAnalyticsRecord
} from "@/lib/squad/analytics";
import { createPlayerContact, createPlayerMedicalPeriod, deletePlayerContact, savePlayerHeaderPreferences, updatePlayerMedicalPeriodStatus } from "@/lib/squad/player-hub-actions";
import { formatEventDate, finalStatusLabel, plannedReasonLabel, plannedStatusLabel, reliabilityMalus } from "@/lib/squad/attendance-format";
import { calculateAge, formatLongDate, formatPlayerBirthDate, playerFullName } from "@/lib/squad/format";
import { getPlayerHubData, medicalLabel, parsePlayerHubPeriod, parsePlayerHubTab, parsePlayerHubTimelineFilter, type PlayerHubData, type PlayerHubTab, type PlayerTimelineFilter } from "@/lib/squad/player-hub";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { PlayerContact, PlayerMedicalPeriod, SquadPlayer } from "@/types/domain";

type PlayerDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const tabs: Array<{ id: PlayerHubTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "analytics", label: "Analytics" },
  { id: "development", label: "Development" },
  { id: "history", label: "History" },
  { id: "attendance", label: "Attendance" },
  { id: "notes", label: "Notes" },
  { id: "details", label: "Details" }
];

const periods = (Object.keys(analyticsPeriodLabels) as AnalyticsPeriod[]).filter((period) => period !== "custom");
const timelineFilters: Array<{ id: PlayerTimelineFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "trainings", label: "Trainings" },
  { id: "ratings", label: "Ratings" },
  { id: "attendance", label: "Attendance" },
  { id: "development", label: "Development" },
  { id: "observations", label: "Observations" },
  { id: "medical", label: "Medical" },
  { id: "coach", label: "Coach assessments" }
];

export default async function PlayerDetailPage({ params, searchParams }: PlayerDetailPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const tab = parsePlayerHubTab(query.tab);
  const timelineFilter = parsePlayerHubTimelineFilter(query.filter);
  const { period, customFrom, customTo } = parsePlayerHubPeriod(query);
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const hub = await getPlayerHubData(supabase, user.id, id, period, customFrom, customTo);
  if (!hub) notFound();

  return (
    <div className="space-y-6">
      <Link href="/squad" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
        <ArrowLeft className="h-4 w-4" />
        Back to squad
      </Link>

      <PlayerHubHeader hub={hub} period={period} tab={tab} />
      <PlayerHubTabs playerId={hub.player.id} activeTab={tab} period={period} customFrom={customFrom} customTo={customTo} />

      {tab === "overview" ? <OverviewTab hub={hub} period={period} /> : null}
      {tab === "analytics" ? <AnalyticsTab hub={hub} period={period} customFrom={customFrom} customTo={customTo} /> : null}
      {tab === "development" ? <PlayerDevelopmentSection playerId={hub.player.id} development={hub.development} /> : null}
      {tab === "history" ? <HistoryTab hub={hub} filter={timelineFilter} period={period} customFrom={customFrom} customTo={customTo} /> : null}
      {tab === "attendance" ? <AttendanceTab hub={hub} /> : null}
      {tab === "notes" ? <NotesTab hub={hub} /> : null}
      {tab === "details" ? <DetailsTab hub={hub} /> : null}
    </div>
  );
}

function PlayerHubHeader({ hub, period, tab }: { hub: PlayerHubData; period: AnalyticsPeriod; tab: PlayerHubTab }) {
  const player = hub.player;
  const age = calculateAge(player.dateOfBirth);
  const initials = [player.firstName[0], player.lastName?.[0]].filter(Boolean).join("").toUpperCase();
  const latestTraining = hub.analytics.summary.latestTraining?.event?.date;
  const optionalItems = [
    hub.headerPreferences.showJerseyNumber && player.jerseyNumber ? `#${player.jerseyNumber}` : "",
    hub.headerPreferences.showHeight && player.heightCm ? `${player.heightCm} cm` : "",
    hub.headerPreferences.showWeight && player.weightKg ? `${player.weightKg} kg` : "",
    hub.headerPreferences.showCaptain && player.captainStatus && player.captainStatus !== "none" ? captainLabel(player.captainStatus) : "",
    hub.headerPreferences.showJoinedDate && player.joinedDate ? `Joined ${formatEventDate(player.joinedDate)}` : "",
    hub.headerPreferences.showLastTraining && latestTraining ? `Last training ${formatEventDate(latestTraining)}` : ""
  ].filter(Boolean);

  return (
    <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg font-bold text-board-navy ring-1 ring-board-line">{initials || "P"}</div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-bold tracking-normal text-board-navy">{playerFullName(player)}</h1>
              {player.playerType === "trial" ? <Badge tone="amber">Trial Player</Badge> : <Badge>Roster</Badge>}
              {player.archivedAt ? <Badge tone="amber">Archived</Badge> : null}
              {hub.currentMedical ? <Badge tone={hub.currentMedical.type === "injured" ? "red" : "amber"}>{medicalLabel(hub.currentMedical)}</Badge> : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-600">
              <InfoPill label="Primary position" value={player.position || "No position"} />
              {player.secondaryPositions.length ? <InfoPill label="Secondary" value={player.secondaryPositions.join(", ")} /> : null}
              {player.strongFoot ? <InfoPill icon={<Footprints className="h-4 w-4" />} label="Dominant foot" value={player.strongFoot} /> : null}
              {player.dateOfBirth ? <InfoPill icon={<CalendarDays className="h-4 w-4" />} label="Birthdate" value={`${formatLongDate(player.dateOfBirth)}${age !== undefined ? ` · ${age} years` : ""}`} /> : null}
              {optionalItems.map((item) => <span key={item} className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-board-navy">{item}</span>)}
            </div>
            {hub.currentMedical ? (
              <p className="mt-3 text-sm font-semibold text-red-700">
                Current medical status: {medicalLabel(hub.currentMedical)}
                {hub.currentMedical.endDate ? ` until ${formatEventDate(hub.currentMedical.endDate)}` : " until further notice"} · {hub.currentMedical.description}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!player.archivedAt ? <ButtonLink href={`/squad/players/${player.id}/edit`} variant="secondary">Edit details</ButtonLink> : null}
          <ButtonLink href={`/squad/players/${player.id}/report?period=${period}`} variant="secondary">
            <Printer className="h-4 w-4" />
            Report
          </ButtonLink>
          <PlayerActions playerId={player.id} archived={Boolean(player.archivedAt)} />
        </div>
      </div>

      <details className="mt-5 rounded-md bg-board-paper p-3">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-board-navy">
          <SlidersHorizontal className="h-4 w-4" />
          Customize header
        </summary>
        <form action={savePlayerHeaderPreferences} className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <input type="hidden" name="playerId" value={player.id} />
          <input type="hidden" name="returnTo" value={`/squad/players/${player.id}?tab=${tab}`} />
          {[
            ["showHeight", "Height", hub.headerPreferences.showHeight],
            ["showWeight", "Weight", hub.headerPreferences.showWeight],
            ["showJerseyNumber", "Jersey number", hub.headerPreferences.showJerseyNumber],
            ["showCaptain", "Captain", hub.headerPreferences.showCaptain],
            ["showJoinedDate", "Joined", hub.headerPreferences.showJoinedDate],
            ["showLastTraining", "Last training", hub.headerPreferences.showLastTraining]
          ].map(([name, label, checked]) => (
            <label key={String(name)} className="inline-flex items-center gap-2">
              <input name={String(name)} type="checkbox" defaultChecked={Boolean(checked)} className="h-4 w-4" />
              {label}
            </label>
          ))}
          <Button type="submit" variant="secondary" className="h-9 px-3">Save visibility</Button>
        </form>
      </details>
    </section>
  );
}

function PlayerHubTabs({ playerId, activeTab, period, customFrom, customTo }: { playerId: string; activeTab: PlayerHubTab; period: AnalyticsPeriod; customFrom?: string; customTo?: string }) {
  return (
    <nav aria-label="Player Hub tabs" className="overflow-x-auto rounded-lg border border-board-line bg-white p-2 shadow-soft">
      <div role="tablist" className="flex min-w-max gap-2">
        {tabs.map((item) => (
          <Link
            key={item.id}
            role="tab"
            aria-selected={activeTab === item.id}
            href={tabHref(playerId, item.id, period, customFrom, customTo)}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-bold transition",
              activeTab === item.id ? "bg-board-green text-white" : "text-slate-600 hover:bg-green-50 hover:text-board-green"
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function OverviewTab({ hub, period }: { hub: PlayerHubData; period: AnalyticsPeriod }) {
  const { summary } = hub.analytics;
  const highestGoal = hub.development.goals.find((goal) => goal.status === "active" && goal.priority === "high") ?? hub.development.goals.find((goal) => goal.status === "active");
  const latestObservation = hub.development.observations[0];
  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <section className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={<Activity className="h-4 w-4" />} label="Average rating" value={formatRating(summary.averageRating)} />
          <Stat icon={<BarChart3 className="h-4 w-4" />} label="Trend" value={summary.trend.value === null ? summary.trend.label : `${summary.trend.value > 0 ? "+" : ""}${summary.trend.value.toFixed(1)}`} />
          <Stat icon={<CalendarDays className="h-4 w-4" />} label="Attendance" value={formatPercent(summary.attendanceRate)} />
          <Stat icon={<ShieldAlert className="h-4 w-4" />} label="Reliability" value={summary.reliabilityPenalty.toFixed(1)} />
        </div>
        <Card title="Development summary" icon={<Target className="h-5 w-5" />}>
          {highestGoal ? (
            <div className="space-y-2 text-sm text-slate-600">
              <p><strong className="text-board-navy">{highestGoal.title}</strong></p>
              {highestGoal.reviewDate ? <p>Next review: {formatEventDate(highestGoal.reviewDate)}</p> : <p>No review date set.</p>}
              {latestObservation ? <p>Latest observation: {latestObservation.note}</p> : null}
              <Link href={tabHref(hub.player.id, "development", period)} className="font-bold text-board-green underline-offset-4 hover:underline">Open development</Link>
            </div>
          ) : (
            <p className="text-sm text-slate-600">No active development goal yet.</p>
          )}
        </Card>
        <Card title="Recent activity" icon={<ClipboardList className="h-5 w-5" />}>
          <TimelineList items={hub.timeline.slice(0, 5)} empty="No recent player activity yet." />
        </Card>
      </section>
      <section className="space-y-6">
        <Card title="Current status" icon={<UserRound className="h-5 w-5" />}>
          <DetailGrid>
            <DetailRow label="Player type" value={hub.player.playerType === "trial" ? "Trial Player" : "Roster"} />
            <DetailRow label="Position" value={hub.player.position} />
            <DetailRow label="Secondary positions" value={hub.player.secondaryPositions.join(", ")} />
            <DetailRow label="Dominant foot" value={hub.player.strongFoot} />
            <DetailRow label="Birthdate" value={hub.player.dateOfBirth ? `${formatLongDate(hub.player.dateOfBirth)} · ${calculateAge(hub.player.dateOfBirth) ?? "-"} years` : undefined} />
          </DetailGrid>
        </Card>
        <Card title="Coach assessment" icon={<FileText className="h-5 w-5" />}>
          {summary.assessment ? (
            <div className="text-sm text-slate-600">
              <p className="font-bold text-board-navy">{coachAssessmentLabels[summary.assessment.assessment]}</p>
              {summary.assessment.reason ? <p className="mt-2 whitespace-pre-wrap">{summary.assessment.reason}</p> : null}
              {summary.assessment.reviewDate ? <p className="mt-2 font-semibold">Review: {formatEventDate(summary.assessment.reviewDate)}</p> : null}
            </div>
          ) : (
            <p className="text-sm text-slate-600">No coach assessment yet.</p>
          )}
        </Card>
      </section>
    </div>
  );
}

function AnalyticsTab({ hub, period, customFrom, customTo }: { hub: PlayerHubData; period: AnalyticsPeriod; customFrom?: string; customTo?: string }) {
  const { player, analytics } = hub;
  const { summary, assessmentHistory } = analytics;
  return (
    <div className="space-y-6">
      <PeriodControls playerId={player.id} tab="analytics" period={period} customFrom={customFrom} customTo={customTo} />
      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-board-navy"><BarChart3 className="h-5 w-5" />Player analytics</h2>
            <p className="mt-1 text-sm text-slate-600">Period: {hub.periodRangeLabel}. Unrated trainings are not counted as 3.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Trainings" value={String(summary.trainings)} />
          <Stat label="Attendance" value={formatPercent(summary.attendanceRate)} />
          <Stat label="Average rating" value={formatRating(summary.averageRating)} />
          <Stat label="Trend" value={summary.trend.value === null ? summary.trend.label : `${summary.trend.value > 0 ? "+" : ""}${summary.trend.value.toFixed(1)} · ${summary.trend.label}`} />
          <Stat label="Rated trainings" value={String(summary.rated)} />
          <Stat label="Evidence" value={summary.evidenceBase.label} />
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
          </div>
          <div className="rounded-md bg-slate-50 p-4">
            <p className="text-sm font-bold text-board-navy">Data summary</p>
            <p className="mt-2 text-sm text-slate-600">{summary.dataSummary}</p>
            <p className="mt-2 text-xs text-slate-500">This is a cautious summary of existing data, not a squad decision.</p>
          </div>
        </div>
      </section>
      <CoachAssessmentPanel playerId={player.id} period={period} assessmentHistory={assessmentHistory} currentAssessment={summary.assessment} />
    </div>
  );
}

function HistoryTab({ hub, filter, period, customFrom, customTo }: { hub: PlayerHubData; filter: PlayerTimelineFilter; period: AnalyticsPeriod; customFrom?: string; customTo?: string }) {
  const items = filter === "all" ? hub.timeline : hub.timeline.filter((item) => item.type === filter);
  return (
    <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-bold text-board-navy">Unified player history</h2>
          <p className="mt-1 text-sm text-slate-600">Coach-relevant events from trainings, ratings, development, observations, medical periods and assessments.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {timelineFilters.map((item) => (
            <Link key={item.id} href={`${tabHref(hub.player.id, "history", period, customFrom, customTo)}&filter=${item.id}`} className={cn("rounded-md px-3 py-2 text-sm font-bold", filter === item.id ? "bg-board-green text-white" : "bg-slate-100 text-slate-700 hover:bg-green-50 hover:text-board-green")}>
              {item.label}
            </Link>
          ))}
        </div>
      </div>
      <TimelineList items={items} empty="No history entries for this filter yet." />
    </section>
  );
}

function AttendanceTab({ hub }: { hub: PlayerHubData }) {
  const records = hub.analytics.summary.records;
  const distribution = hub.analytics.summary.attendanceDistribution;
  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Attendance rate" value={formatPercent(hub.analytics.summary.attendanceRate)} />
        <Stat label="Present" value={String(distribution.present)} />
        <Stat label="Late" value={String(distribution.late)} />
        <Stat label="Absent" value={String(hub.analytics.summary.absent)} />
        <Stat label="Reliability" value={hub.analytics.summary.reliabilityPenalty.toFixed(1)} />
      </section>
      <Card title="Attendance record" icon={<CalendarDays className="h-5 w-5" />}>
        <div className="space-y-3">
          {records.length ? records.map((entry) => <AttendanceEntryCard key={entry.id} entry={entry} />) : <p className="rounded-md border border-dashed border-board-line p-4 text-sm text-slate-600">No attendance records for this period.</p>}
        </div>
      </Card>
    </div>
  );
}

function NotesTab({ hub }: { hub: PlayerHubData }) {
  const publicNotes = hub.analytics.summary.records.filter((entry) => entry.coachNote && !entry.sensitiveNote);
  const privateNotes = hub.analytics.summary.records.filter((entry) => entry.coachNote && entry.sensitiveNote);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Coach notes" icon={<FileText className="h-5 w-5" />}>
        <NoteList entries={publicNotes} empty="No non-private coach notes in this period." />
      </Card>
      <Card title="Private notes" icon={<ShieldAlert className="h-5 w-5" />}>
        <p className="mb-3 rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">Private · Only visible in Player Hub.</p>
        <NoteList entries={privateNotes} empty="No private notes in this period." />
      </Card>
      <Card title="Observations" icon={<Target className="h-5 w-5" />}>
        <div className="space-y-3">
          {hub.development.observations.length ? hub.development.observations.map((observation) => (
            <article key={observation.id} className="rounded-md bg-slate-50 p-3 text-sm">
              <p className="font-bold text-board-navy">{formatEventDate(observation.observationDate)}</p>
              <p className="mt-1 whitespace-pre-wrap text-slate-600">{observation.note}</p>
            </article>
          )) : <p className="text-sm text-slate-600">No observations yet.</p>}
        </div>
      </Card>
      <Card title="Medical notes" icon={<Stethoscope className="h-5 w-5" />}>
        <DetailGrid>
          <DetailRow label="Allergies" value={hub.player.allergies} />
          <DetailRow label="Medication" value={hub.player.medication} />
          <DetailRow label="Medical notes" value={hub.player.medicalNotes} />
        </DetailGrid>
      </Card>
    </div>
  );
}

function DetailsTab({ hub }: { hub: PlayerHubData }) {
  const player = hub.player;
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ButtonLink href={`/squad/players/${player.id}/edit`} variant="secondary">Edit details</ButtonLink>
      </div>
      <section className="grid gap-6 lg:grid-cols-2">
        <Card title="Personal information" icon={<UserRound className="h-5 w-5" />}>
          <DetailGrid>
            <DetailRow label="First name" value={player.firstName} />
            <DetailRow label="Last name" value={player.lastName} />
            <DetailRow label="Birthdate" value={player.dateOfBirth ? `${formatLongDate(player.dateOfBirth)} · ${calculateAge(player.dateOfBirth) ?? "-"} years` : undefined} />
            <DetailRow label="Primary position" value={player.position} />
            <DetailRow label="Secondary positions" value={player.secondaryPositions.join(", ")} />
            <DetailRow label="Dominant foot" value={player.strongFoot} />
            <DetailRow label="Jersey number" value={player.jerseyNumber} />
            <DetailRow label="Height" value={player.heightCm ? `${player.heightCm} cm` : undefined} />
            <DetailRow label="Weight" value={player.weightKg ? `${player.weightKg} kg` : undefined} />
            <DetailRow label="Captain status" value={player.captainStatus ? captainLabel(player.captainStatus) : undefined} />
            <DetailRow label="Club" value={player.club} />
            <DetailRow label="Joined date" value={player.joinedDate ? formatEventDate(player.joinedDate) : undefined} />
            <DetailRow label="Player type" value={player.playerType === "trial" ? "Trial Player" : "Roster"} />
          </DetailGrid>
        </Card>
        <Card title="Contact information" icon={<Phone className="h-5 w-5" />}>
          <DetailGrid>
            <DetailRow label="Player phone" value={player.playerPhone} href={player.playerPhone ? `tel:${player.playerPhone}` : undefined} />
            <DetailRow label="Player email" value={player.playerEmail} href={player.playerEmail ? `mailto:${player.playerEmail}` : undefined} />
            <DetailRow label="Legacy parent phone" value={player.parentPhone} href={player.parentPhone ? `tel:${player.parentPhone}` : undefined} />
            <DetailRow label="Legacy parent email" value={player.parentEmail} href={player.parentEmail ? `mailto:${player.parentEmail}` : undefined} />
          </DetailGrid>
          <ContactSection playerId={player.id} contacts={hub.contacts} />
        </Card>
      </section>
      <Card title="Development background" icon={<Target className="h-5 w-5" />}>
        <DetailGrid>
          <DetailRow label="Hobbies" value={player.hobbies} />
          <DetailRow label="Development goal summary" value={player.developmentGoal} />
          <DetailRow label="Work on" value={player.workOn} />
          <DetailRow label="General notes" value={player.notes} />
        </DetailGrid>
      </Card>
      <MedicalSection playerId={player.id} player={player} periods={hub.medicalPeriods} />
    </div>
  );
}

function CoachAssessmentPanel({ playerId, period, currentAssessment, assessmentHistory }: { playerId: string; period: AnalyticsPeriod; currentAssessment?: PlayerHubData["analytics"]["summary"]["assessment"]; assessmentHistory: PlayerHubData["analytics"]["assessmentHistory"] }) {
  return (
    <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <h2 className="flex items-center gap-2 text-lg font-bold text-board-navy"><FileText className="h-5 w-5" />Coach assessment</h2>
      <p className="mt-1 text-sm text-slate-600">Manual assessment is separate from automatic data summaries.</p>
      {currentAssessment ? (
        <div className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">
          <p className="font-bold">{coachAssessmentLabels[currentAssessment.assessment]}</p>
          {currentAssessment.reason ? <p className="mt-1 whitespace-pre-wrap">{currentAssessment.reason}</p> : null}
          <p className="mt-1 text-xs font-semibold">Assessment date: {formatEventDate(currentAssessment.assessmentDate)}{currentAssessment.reviewDate ? ` · Review: ${formatEventDate(currentAssessment.reviewDate)}` : ""}</p>
        </div>
      ) : <p className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-600">No coach assessment yet.</p>}
      <form action={createPlayerCoachAssessment} className="mt-4 grid gap-3 md:grid-cols-2">
        <input type="hidden" name="playerId" value={playerId} />
        <input type="hidden" name="returnTo" value={`/squad/players/${playerId}?tab=analytics&period=${period}`} />
        <FieldLabel label="Assessment">
          <select name="assessment" defaultValue={currentAssessment?.assessment ?? "decision_open"} className={fieldClass()}>
            {Object.entries(coachAssessmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </FieldLabel>
        <FieldLabel label="Assessment date">
          <input name="assessmentDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={fieldClass()} />
        </FieldLabel>
        <FieldLabel label="Review date">
          <input name="reviewDate" type="date" defaultValue={currentAssessment?.reviewDate ?? ""} className={fieldClass()} />
        </FieldLabel>
        <FieldLabel label="Reason" wide>
          <textarea name="reason" defaultValue={currentAssessment?.reason ?? ""} rows={3} className={textareaClass()} />
        </FieldLabel>
        <div className="md:col-span-2"><Button type="submit">Save coach assessment</Button></div>
      </form>
      {assessmentHistory.length > 1 ? (
        <div className="mt-4 rounded-md border border-board-line p-3 text-sm text-slate-600">
          <p className="font-bold text-board-navy">Previous assessments</p>
          {assessmentHistory.slice(1, 5).map((assessment) => <p key={assessment.id} className="mt-2">{formatEventDate(assessment.assessmentDate)} · {coachAssessmentLabels[assessment.assessment]}</p>)}
        </div>
      ) : null}
    </section>
  );
}

function ContactSection({ playerId, contacts }: { playerId: string; contacts: PlayerContact[] }) {
  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <p className="text-sm font-bold text-board-navy">Related contacts</p>
      <div className="mt-3 space-y-3">
        {contacts.length ? contacts.map((contact) => (
          <article key={contact.id} className="rounded-md bg-slate-50 p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <p className="font-bold text-board-navy">{contact.name || relationshipLabel(contact.relationship)}</p>
                <p className="text-slate-500">{relationshipLabel(contact.relationship)}{contact.isPrimary ? " · Primary" : ""}{contact.isEmergency ? " · Emergency" : ""}</p>
                {contact.phone ? <a href={`tel:${contact.phone}`} className="mt-1 block font-semibold text-board-navy underline-offset-4 hover:underline">{contact.phone}</a> : null}
                {contact.email ? <a href={`mailto:${contact.email}`} className="mt-1 block font-semibold text-board-navy underline-offset-4 hover:underline">{contact.email}</a> : null}
                {contact.notes ? <p className="mt-1 text-slate-600">{contact.notes}</p> : null}
              </div>
              <form action={deletePlayerContact}>
                <input type="hidden" name="playerId" value={playerId} />
                <input type="hidden" name="contactId" value={contact.id} />
                <Button type="submit" variant="ghost" className="h-9 px-3">Delete</Button>
              </form>
            </div>
          </article>
        )) : <p className="text-sm text-slate-600">No flexible contacts added yet. Legacy parent contact fields are still shown above.</p>}
      </div>
      <details className="mt-4 rounded-md bg-board-paper p-3">
        <summary className="cursor-pointer text-sm font-bold text-board-navy">Add contact</summary>
        <form action={createPlayerContact} className="mt-3 grid gap-3 md:grid-cols-2">
          <input type="hidden" name="playerId" value={playerId} />
          <FieldLabel label="Name"><input name="name" className={fieldClass()} /></FieldLabel>
          <FieldLabel label="Relationship">
            <select name="relationship" className={fieldClass()}>
              {["mother", "father", "parent", "guardian", "emergency", "other"].map((value) => <option key={value} value={value}>{relationshipLabel(value)}</option>)}
            </select>
          </FieldLabel>
          <FieldLabel label="Phone"><input name="phone" className={fieldClass()} /></FieldLabel>
          <FieldLabel label="Email"><input name="email" type="email" className={fieldClass()} /></FieldLabel>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600"><input name="isPrimary" type="checkbox" className="h-4 w-4" />Primary contact</label>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600"><input name="isEmergency" type="checkbox" className="h-4 w-4" />Emergency contact</label>
          <FieldLabel label="Notes" wide><textarea name="notes" rows={2} className={textareaClass()} /></FieldLabel>
          <div className="md:col-span-2"><Button type="submit" variant="secondary">Add contact</Button></div>
        </form>
      </details>
    </div>
  );
}

function MedicalSection({ playerId, player, periods }: { playerId: string; player: SquadPlayer; periods: PlayerMedicalPeriod[] }) {
  const active = periods.filter((period) => period.status === "active");
  return (
    <Card title="Medical availability" icon={<Stethoscope className="h-5 w-5" />}>
      <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm font-semibold text-amber-800">Private medical information. Only minimal availability labels are shown in attendance workflows.</p>
      <DetailGrid>
        <DetailRow label="Allergies" value={player.allergies} />
        <DetailRow label="Medication" value={player.medication} />
        <DetailRow label="Medical notes" value={player.medicalNotes} />
      </DetailGrid>
      <div className="mt-5 space-y-3">
        {periods.length ? periods.map((period) => (
          <article key={period.id} className={cn("rounded-md border p-3 text-sm", period.status === "active" ? "border-red-100 bg-red-50" : "border-board-line bg-slate-50")}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="font-bold text-board-navy">{medicalLabel(period)} · {period.description}</p>
                <p className="mt-1 text-slate-600">{formatEventDate(period.startDate)} - {period.endDate ? formatEventDate(period.endDate) : "Until further notice"} · {period.status}</p>
                {period.expectedReturnDate ? <p className="mt-1 text-slate-600">Expected return: {formatEventDate(period.expectedReturnDate)}</p> : null}
                {period.actualReturnDate ? <p className="mt-1 text-slate-600">Actual return: {formatEventDate(period.actualReturnDate)}</p> : null}
                {period.notes ? <p className="mt-2 whitespace-pre-wrap text-slate-700">{period.notes}</p> : null}
              </div>
              {period.status === "active" ? (
                <form action={updatePlayerMedicalPeriodStatus} className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input type="hidden" name="playerId" value={playerId} />
                  <input type="hidden" name="periodId" value={period.id} />
                  <input type="hidden" name="status" value="completed" />
                  <input name="actualReturnDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={fieldClass()} />
                  <Button type="submit" variant="secondary" className="h-11">Complete</Button>
                </form>
              ) : null}
            </div>
          </article>
        )) : <p className="rounded-md border border-dashed border-board-line p-4 text-sm text-slate-600">No medical periods recorded.</p>}
      </div>
      <details className="mt-5 rounded-md bg-board-paper p-3" open={!active.length && !periods.length}>
        <summary className="cursor-pointer text-sm font-bold text-board-navy">Add injury or sickness period</summary>
        <form action={createPlayerMedicalPeriod} className="mt-3 grid gap-3 md:grid-cols-2">
          <input type="hidden" name="playerId" value={playerId} />
          <FieldLabel label="Type">
            <select name="type" className={fieldClass()}>
              <option value="injured">Injured</option>
              <option value="sick">Sick</option>
            </select>
          </FieldLabel>
          <FieldLabel label="Status">
            <select name="status" className={fieldClass()}>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </FieldLabel>
          <FieldLabel label="From"><input name="startDate" required type="date" className={fieldClass()} /></FieldLabel>
          <FieldLabel label="To"><input name="endDate" type="date" className={fieldClass()} /></FieldLabel>
          <FieldLabel label="Expected return"><input name="expectedReturnDate" type="date" className={fieldClass()} /></FieldLabel>
          <FieldLabel label="Actual return"><input name="actualReturnDate" type="date" className={fieldClass()} /></FieldLabel>
          <FieldLabel label="Injury or illness" wide><input name="description" required placeholder="Ankle sprain, fever..." className={fieldClass()} /></FieldLabel>
          <FieldLabel label="Notes" wide><textarea name="notes" rows={3} className={textareaClass()} /></FieldLabel>
          <div className="md:col-span-2"><Button type="submit" variant="secondary">Save medical period</Button></div>
        </form>
      </details>
    </Card>
  );
}

function PeriodControls({ playerId, tab, period, customFrom, customTo }: { playerId: string; tab: PlayerHubTab; period: AnalyticsPeriod; customFrom?: string; customTo?: string }) {
  return (
    <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <div className="flex flex-wrap gap-2">
        {periods.map((item) => (
          <Link key={item} href={tabHref(playerId, tab, item)} className={cn("rounded-md px-3 py-2 text-sm font-bold", period === item ? "bg-board-green text-white" : "bg-slate-100 text-slate-700 hover:bg-green-50 hover:text-board-green")}>
            {analyticsPeriodLabels[item]}
          </Link>
        ))}
        <Link href={tabHref(playerId, tab, "custom", customFrom, customTo)} className={cn("rounded-md px-3 py-2 text-sm font-bold", period === "custom" ? "bg-board-green text-white" : "bg-slate-100 text-slate-700 hover:bg-green-50 hover:text-board-green")}>
          Custom range
        </Link>
      </div>
      <form action={`/squad/players/${playerId}`} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input type="hidden" name="tab" value={tab} />
        <input type="hidden" name="period" value="custom" />
        <input name="from" placeholder="dd.mm.yyyy" defaultValue={customFrom ? formatPlayerBirthDate(customFrom) : ""} className={fieldClass()} />
        <input name="to" placeholder="dd.mm.yyyy" defaultValue={customTo ? formatPlayerBirthDate(customTo) : ""} className={fieldClass()} />
        <Button type="submit" variant="secondary">Apply</Button>
      </form>
    </section>
  );
}

function AttendanceEntryCard({ entry }: { entry: PlayerAnalyticsRecord }) {
  return (
    <article className="rounded-md border border-board-line bg-board-paper p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-board-navy">
            {entry.event ? <Link href={`/trainings/${entry.event.id}`} className="underline-offset-4 hover:text-board-green hover:underline">{formatEventDate(entry.event.date)} · {entry.event.label || "Training"}</Link> : "Training"}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Planned: {plannedStatusLabel(entry.plannedStatus)} · Actual: {finalStatusLabel(entry.finalStatus)}
            {entry.overallRating ? ` · Rating: ${entry.overallRating}` : ""}
            {entry.plannedReason ? ` · Reason: ${plannedReasonLabel(entry.plannedReason)}` : ""}
            {entry.lateMinutes ? ` · Late: ${entry.lateMinutes} min` : ""}
            {` · Malus: ${reliabilityMalus(entry)}`}
          </p>
          {entry.medicalAvailability ? <p className="mt-1 text-xs font-bold text-red-700">Medical status: {entry.medicalAvailability.label}{entry.medicalAvailability.until ? ` until ${formatEventDate(entry.medicalAvailability.until)}` : ""}</p> : null}
        </div>
        {entry.sensitiveNote ? <Badge tone="red">Private note</Badge> : null}
      </div>
      {entry.coachNote && !entry.sensitiveNote ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{entry.coachNote}</p> : null}
    </article>
  );
}

function TimelineList({ items, empty }: { items: PlayerHubData["timeline"]; empty: string }) {
  return (
    <div className="mt-4 space-y-3">
      {items.length ? items.map((item) => (
        <article key={item.id} className="rounded-md border border-board-line bg-board-paper p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{formatEventDate(item.date)}</p>
          <p className="mt-1 font-bold text-board-navy">{item.title}</p>
          {item.detail ? <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{item.detail}</p> : null}
          {item.href ? <Link href={item.href} className="mt-2 inline-flex text-sm font-bold text-board-green underline-offset-4 hover:underline">Open source</Link> : null}
        </article>
      )) : <p className="rounded-md border border-dashed border-board-line p-4 text-sm text-slate-600">{empty}</p>}
    </div>
  );
}

function NoteList({ entries, empty }: { entries: PlayerAnalyticsRecord[]; empty: string }) {
  return (
    <div className="space-y-3">
      {entries.length ? entries.map((entry) => (
        <article key={entry.id} className="rounded-md bg-slate-50 p-3 text-sm">
          <p className="font-bold text-board-navy">{entry.event ? `${formatEventDate(entry.event.date)} · ${entry.event.label || "Training"}` : "Training note"}</p>
          <p className="mt-1 whitespace-pre-wrap text-slate-600">{entry.coachNote}</p>
        </article>
      )) : <p className="text-sm text-slate-600">{empty}</p>}
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <h2 className="flex items-center gap-2 text-lg font-bold text-board-navy">{icon}{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DetailGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
}

function DetailRow({ label, value, href }: { label: string; value?: string; href?: string }) {
  const content = value || "Not added";
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      {href && value ? <a href={href} className="mt-1 block whitespace-pre-line text-sm font-semibold text-board-navy underline-offset-4 hover:underline">{content}</a> : <p className="mt-1 whitespace-pre-line text-sm font-semibold text-board-navy">{content}</p>}
    </div>
  );
}

function InfoPill({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return <span className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2 py-1"><span className="font-bold text-slate-500">{icon}{label}:</span> <span className="font-semibold text-board-navy">{value}</span></span>;
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500">{icon}{label}</p>
      <p className="mt-1 text-xl font-bold text-board-navy">{value}</p>
    </div>
  );
}

function Badge({ children, tone = "green" }: { children: ReactNode; tone?: "green" | "amber" | "red" }) {
  return <span className={cn("rounded-full px-2 py-1 text-xs font-bold", tone === "green" && "bg-green-50 text-green-700", tone === "amber" && "bg-amber-50 text-amber-700", tone === "red" && "bg-red-50 text-red-700")}>{children}</span>;
}

function FieldLabel({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={wide ? "md:col-span-2" : ""}><span className="text-xs font-bold uppercase text-slate-500">{label}</span>{children}</label>;
}

function fieldClass() {
  return "mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100";
}

function textareaClass() {
  return "mt-1 w-full rounded-md border border-board-line bg-white px-3 py-2 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100";
}

function tabHref(playerId: string, tab: PlayerHubTab, period: AnalyticsPeriod, customFrom?: string, customTo?: string) {
  const params = new URLSearchParams();
  if (tab !== "overview") params.set("tab", tab);
  if (period !== "season") params.set("period", period);
  if (period === "custom") {
    if (customFrom) params.set("from", customFrom);
    if (customTo) params.set("to", customTo);
  }
  const query = params.toString();
  return `/squad/players/${playerId}${query ? `?${query}` : ""}`;
}

function relationshipLabel(value: string) {
  const labels: Record<string, string> = {
    mother: "Mother",
    father: "Father",
    parent: "Parent",
    guardian: "Guardian",
    emergency: "Emergency contact",
    other: "Other"
  };
  return labels[value] ?? "Parent";
}

function captainLabel(value: string) {
  if (value === "captain") return "Captain";
  if (value === "vice_captain") return "Vice captain";
  return "No captain status";
}
