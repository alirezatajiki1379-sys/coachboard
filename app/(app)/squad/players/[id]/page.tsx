import Link from "next/link";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { Activity, AlertTriangle, ArrowLeft, BarChart3, CalendarDays, ClipboardList, FileText, Footprints, Minus, Phone, Printer, Shirt, ShieldAlert, SlidersHorizontal, Stethoscope, Target, TrendingDown, TrendingUp, UserRound } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { PlayerActions } from "@/components/squad/player-actions";
import { PlayerUnavailabilityForm } from "@/components/squad/player-unavailability-form";
import { PlayerDevelopmentSection } from "@/components/squad/player-development";
import { permanentlyDeleteSquadPlayer } from "@/lib/squad/actions";
import { createPlayerCoachAssessment } from "@/lib/squad/analytics-actions";
import {
  analyticsPeriodLabels,
  coachAssessmentLabels,
  formatPercent,
  formatRating,
  type AnalyticsPeriod,
  type PlayerAnalyticsRecord
} from "@/lib/squad/analytics";
import { createPlayerAvailabilityPeriod, createPlayerContact, createPlayerMedicalPeriod, deletePlayerAvailabilityPeriod, deletePlayerContact, savePlayerHeaderPreferences, updatePlayerAvailabilityPeriodDetails, updatePlayerMedicalPeriodDetails, updatePlayerMedicalPeriodStatus } from "@/lib/squad/player-hub-actions";
import { getPlayerAttentionSummary } from "@/lib/squad/attention-queries";
import { attentionPriorityLabels, attentionTone, type AttentionItem } from "@/lib/squad/attention";
import { formatEventDate, finalStatusLabel, plannedReasonLabel, plannedStatusLabel, reliabilityMalus } from "@/lib/squad/attendance-format";
import { calculateAge, formatLongDate, formatPlayerBirthDate, playerFullName } from "@/lib/squad/format";
import { availabilityReasonLabel, getPlayerHubData, medicalLabel, parsePlayerHubPeriod, parsePlayerHubTab, parsePlayerHubTimelineFilter, type PlayerHubData, type PlayerHubTab, type PlayerTimelineFilter } from "@/lib/squad/player-hub";
import { formatPositionLabel } from "@/lib/squad/positions";
import { createClient } from "@/lib/supabase/server";
import { getActiveLocale, getUserLocale } from "@/lib/i18n/server";
import { createSystemTranslator } from "@/lib/i18n/system-text";
import { formatNumber } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { trainingNowParts } from "@/lib/trainings/utils";
import type { PlayerAvailabilityPeriod, PlayerContact, PlayerMedicalPeriod, SquadPlayer } from "@/types/domain";

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
  { id: "medical", label: "Availability" },
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

type AttendanceFilter = "all" | "present" | "late" | "absent" | "injured" | "sick" | "excused" | "private" | "cancelled" | "unexcused";
const attendanceFilters: Array<{ id: AttendanceFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "present", label: "Present" },
  { id: "late", label: "Late" },
  { id: "absent", label: "Absent" },
  { id: "injured", label: "Injured" },
  { id: "sick", label: "Sick" },
  { id: "excused", label: "Excused" },
  { id: "private", label: "Private" },
  { id: "cancelled", label: "Late cancellation" },
  { id: "unexcused", label: "Unexcused" }
];

const generalAbsenceReasonOptions: Array<{ value: PlayerAvailabilityPeriod["reason"]; label: string }> = [
  { value: "school", label: "School" },
  { value: "work", label: "Work" },
  { value: "holiday", label: "Holiday" },
  { value: "private", label: "Private" },
  { value: "other", label: "Other" }
];

const availabilityCopy = {
  en: {
    title: "Availability",
    available: "Available",
    unavailable: "Unavailable",
    noActive: "No active unavailability is recorded.",
    current: "Current",
    upcoming: "Upcoming",
    past: "Past",
    addUnavailability: "Add unavailability",
    viewHistory: "View availability history",
    medicalHistory: "Medical history",
    currentEmpty: "No current general absence.",
    upcomingEmpty: "No upcoming general absence.",
    pastEmpty: "No past general absence.",
    editAbsence: "Edit absence",
    deleteAbsence: "Delete absence",
    saveChanges: "Save changes",
    reason: "Reason",
    from: "From",
    until: "Until",
    note: "Notes",
    since: "Since",
    expectedReturn: "Expected return",
    actualReturn: "Actual return",
    status: "Status",
    returned: "Mark as returned",
    update: "Update",
    activeMedical: "Active medical records",
    needsReview: "Needs review",
    medicalInfo: "Medical information",
    medicalPrivate: "Private medical background. This is not shown in squad overviews, training plans or standard reports.",
    noMedicalHistory: "No completed or cancelled medical records yet.",
    activeRecords: "Active medical records",
    returnNeedsReview: "Return status needs review.",
    overlapping: "Multiple active medical records overlap. The latest applicable start date determines attendance prefill.",
    systemNote: "Future trainings keep the player visible but mark them as not expected unless a coach has manually overridden the training.",
    absenceHelp: "Record injuries, sickness and non-medical absence in one place."
  },
  de: {
    title: "Verfügbarkeit",
    available: "Verfügbar",
    unavailable: "Nicht verfügbar",
    noActive: "Keine aktuelle Abwesenheit eingetragen.",
    current: "Aktuell",
    upcoming: "Anstehend",
    past: "Vergangen",
    addUnavailability: "Abwesenheit hinzufügen",
    viewHistory: "Verlauf anzeigen",
    medicalHistory: "Medizinischer Verlauf",
    currentEmpty: "Keine aktuelle allgemeine Abwesenheit.",
    upcomingEmpty: "Keine anstehende allgemeine Abwesenheit.",
    pastEmpty: "Keine vergangene allgemeine Abwesenheit.",
    editAbsence: "Abwesenheit bearbeiten",
    deleteAbsence: "Abwesenheit löschen",
    saveChanges: "Änderungen speichern",
    reason: "Grund",
    from: "Von",
    until: "Bis",
    note: "Notizen",
    since: "Seit",
    expectedReturn: "Erwartete Rückkehr",
    actualReturn: "Tatsächliche Rückkehr",
    status: "Status",
    returned: "Rückkehr eintragen",
    update: "Aktualisieren",
    activeMedical: "Aktive medizinische Einträge",
    needsReview: "Überprüfung nötig",
    medicalInfo: "Medizinische Informationen",
    medicalPrivate: "Private medizinische Informationen. In Kaderübersichten, Trainingsplänen und Standardberichten werden nur minimale Verfügbarkeitslabels angezeigt.",
    noMedicalHistory: "Noch keine abgeschlossenen oder gelöschten medizinischen Einträge.",
    activeRecords: "Aktive medizinische Einträge",
    returnNeedsReview: "Rückkehrstatus muss überprüft werden.",
    overlapping: "Mehrere aktive medizinische Einträge überschneiden sich. Für Trainings zählt der neueste passende Starttermin.",
    systemNote: "Zukünftige Trainings behalten den Spieler sichtbar, markieren ihn aber als nicht eingeplant, sofern der Coach das Training nicht manuell überschrieben hat.",
    absenceHelp: "Erfasse Verletzungen, Krankheit und allgemeine Abwesenheit an einer Stelle."
  }
} as const;

export default async function PlayerDetailPage({ params, searchParams }: PlayerDetailPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const tab = parsePlayerHubTab(query.tab);
  const timelineFilter = parsePlayerHubTimelineFilter(query.filter);
  const attendanceFilter = parseAttendanceFilter(query.attendance);
  const medicalError = one(query.medicalError);
  const contactError = one(query.contactError);
  const deleteError = one(query.deleteError);
  const returnTo = safeReturnPath(one(query.returnTo));
  const { period, customFrom, customTo } = parsePlayerHubPeriod(query);
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [hub, locale] = await Promise.all([
    getPlayerHubData(supabase, user.id, id, period, customFrom, customTo),
    getUserLocale(supabase, user.id)
  ]);
  if (!hub) notFound();
  const attentionItems = await getPlayerAttentionSummary(supabase, user.id, id, period);

  return (
    <div className="space-y-6">
      <Link href={returnTo} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <PlayerHubHeader hub={hub} period={period} tab={tab} />
      <PlayerHubTabs playerId={hub.player.id} activeTab={tab} period={period} customFrom={customFrom} customTo={customTo} />
      {isPeriodAwareTab(tab) ? <PeriodControls playerId={hub.player.id} tab={tab} period={period} customFrom={customFrom} customTo={customTo} /> : null}

      {tab === "overview" ? <OverviewTab hub={hub} period={period} attentionItems={attentionItems} locale={locale} /> : null}
      {tab === "analytics" ? <AnalyticsTab hub={hub} period={period} /> : null}
      {tab === "development" ? <PlayerDevelopmentSection playerId={hub.player.id} development={hub.development} /> : null}
      {tab === "history" ? <HistoryTab hub={hub} filter={timelineFilter} period={period} customFrom={customFrom} customTo={customTo} /> : null}
      {tab === "attendance" ? <AttendanceTab hub={hub} filter={attendanceFilter} period={period} customFrom={customFrom} customTo={customTo} /> : null}
      {tab === "medical" ? <MedicalTab hub={hub} medicalError={medicalError} locale={locale} /> : null}
      {tab === "notes" ? <NotesTab hub={hub} /> : null}
      {tab === "details" ? <DetailsTab hub={hub} medicalError={medicalError} contactError={contactError} deleteError={deleteError} /> : null}
    </div>
  );
}

function PlayerHubHeader({ hub, period, tab }: { hub: PlayerHubData; period: AnalyticsPeriod; tab: PlayerHubTab }) {
  const player = hub.player;
  const age = calculateAge(player.dateOfBirth);
  const initials = [player.firstName[0], player.lastName?.[0]].filter(Boolean).join("").toUpperCase();
  const latestTraining = hub.analytics.summary.latestTraining?.event?.date;
  const currentAvailability = currentAvailabilityPeriod(hub.availabilityPeriods);
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
              <h1 translate="no" className="text-3xl font-bold tracking-normal text-board-navy">{playerFullName(player)}</h1>
              {player.playerType === "trial" ? <Badge tone="amber">Trial Player</Badge> : <Badge>Roster</Badge>}
              {player.archivedAt ? <Badge tone="amber">Archived</Badge> : null}
              {hub.currentMedical ? <Badge tone={hub.currentMedical.type === "injured" ? "red" : "amber"}>{medicalLabel(hub.currentMedical)}</Badge> : null}
              {!hub.currentMedical && currentAvailability ? <Badge tone="red">Unavailable · {availabilityReasonLabel(currentAvailability.reason)}</Badge> : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-600">
              <InfoPill label="Primary position" value={positionLabel(player.position) || "Position not added"} />
              {player.secondaryPositions.length ? <InfoPill label="Secondary" value={positionListLabel(player.secondaryPositions) ?? player.secondaryPositions.join(", ")} /> : null}
              {player.preferredPositions.length ? <InfoPill label="Preferred" value={positionListLabel(player.preferredPositions) ?? player.preferredPositions.join(", ")} /> : null}
              {player.strongFoot ? <InfoPill icon={<Footprints className="h-4 w-4" />} label="Dominant foot" value={player.strongFoot} /> : null}
              {player.club ? <InfoPill label="Club" value={player.club} /> : null}
              {player.dateOfBirth ? <InfoPill icon={<CalendarDays className="h-4 w-4" />} label="Birthdate" value={`${formatLongDate(player.dateOfBirth)}${age !== undefined ? ` · ${age} years` : ""}`} /> : null}
              {optionalItems.map((item) => <span key={item} className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-board-navy">{item}</span>)}
            </div>
            {hub.currentMedical ? (
              <p className="mt-3 text-sm font-semibold text-red-700">
                Current medical status: {medicalLabel(hub.currentMedical)}
                {hub.currentMedical.expectedReturnDate ? ` · expected return ${formatEventDate(hub.currentMedical.expectedReturnDate)}` : " · expected return not set"} · {hub.currentMedical.description}
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
              "inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-bold transition",
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

function OverviewTab({ hub, period, attentionItems, locale }: { hub: PlayerHubData; period: AnalyticsPeriod; attentionItems: AttentionItem[]; locale: "en" | "de" }) {
  const { summary } = hub.analytics;
  const highestGoal = hub.development.goals.find((goal) => goal.status === "in_progress" && goal.priority === "high") ?? hub.development.goals.find((goal) => goal.status === "in_progress" || goal.status === "identified");
  const latestObservation = hub.development.observations[0];
  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <section className="space-y-6">
        <AttentionSummaryCard playerId={hub.player.id} items={attentionItems} />
        <MedicalOverviewCard hub={hub} locale={locale} />
        <AnalyticsMetricGrid hub={hub} period={period} />
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
            <DetailRow label="Position" value={positionLabel(hub.player.position)} />
            <DetailRow label="Secondary positions" value={positionListLabel(hub.player.secondaryPositions)} />
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

function AttentionSummaryCard({ playerId, items }: { playerId: string; items: AttentionItem[] }) {
  return (
    <Card title="Needs attention" icon={<AlertTriangle className="h-5 w-5" />}>
      {items.length ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-700">{items.length} open item{items.length === 1 ? "" : "s"}</p>
          <div className="space-y-2">
            {items.slice(0, 3).map((item) => (
              <div key={item.key} className="rounded-md bg-slate-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={playerHubAttentionTone(item.priority)}>{attentionPriorityLabels[item.priority]}</Badge>
                  <p className="text-sm font-bold text-board-navy">{item.title}</p>
                </div>
                <p className="mt-1 text-sm text-slate-600">{item.explanation}</p>
              </div>
            ))}
          </div>
          <Link href={`/actions?player=${playerId}`} className="font-bold text-board-green underline-offset-4 hover:underline">Review items</Link>
        </div>
      ) : (
        <p className="text-sm text-slate-600">No open attention items for this player.</p>
      )}
    </Card>
  );
}

function playerHubAttentionTone(priority: AttentionItem["priority"]) {
  const tone = attentionTone(priority);
  return tone === "neutral" ? "green" : tone;
}

function MedicalOverviewCard({ hub, locale }: { hub: PlayerHubData; locale: "en" | "de" }) {
  const text = availabilityCopy[locale];
  const current = hub.currentMedical;
  const currentAvailability = currentAvailabilityPeriod(hub.availabilityPeriods);
  const activeAvailability = hub.availabilityPeriods.filter((period) => period.status === "active");
  const upcomingAvailability = activeAvailability.filter((period) => isAvailabilityUpcoming(period)).slice(0, 3);
  const needsReview = current ? medicalReviewNeeded(current) : false;
  return (
    <Card title={text.title} icon={<Stethoscope className="h-5 w-5" />}>
      {current ? (
        <div className="space-y-4">
          <div className={cn("rounded-md border-l-4 bg-slate-50 p-4", current.type === "injured" ? "border-red-400" : "border-amber-400")}>
            <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              <span className={cn("h-2.5 w-2.5 rounded-full", current.type === "injured" ? "bg-red-500" : "bg-amber-500")} />
              {localizedMedicalLabel(current, locale)}
            </p>
            <p className="mt-2 text-lg font-bold text-board-navy">{current.description}</p>
            <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
              <Mini label={text.since} value={formatEventDate(current.startDate)} />
              <Mini label={text.expectedReturn} value={current.expectedReturnDate ? formatEventDate(current.expectedReturnDate) : "-"} />
              <Mini label={text.actualReturn} value={current.actualReturnDate ? formatEventDate(current.actualReturnDate) : "-"} />
            </div>
            {needsReview ? (
              <p className="mt-3 inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
                <ShieldAlert className="h-4 w-4" />
                {text.returnNeedsReview}
              </p>
            ) : null}
          </div>
          <AvailabilityQuickSummary playerId={hub.player.id} periods={hub.availabilityPeriods} locale={locale} compact />
          <AvailabilityOverviewActions playerId={hub.player.id} current={current} locale={locale} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className={cn("rounded-md border-l-4 bg-slate-50 p-4", currentAvailability ? "border-red-400" : "border-green-500")}>
            <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              <span className={cn("h-2.5 w-2.5 rounded-full", currentAvailability ? "bg-red-500" : "bg-green-600")} />
              {currentAvailability ? `${text.unavailable} · ${localizedAvailabilityReason(currentAvailability.reason, locale)}` : text.available}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {currentAvailability ? `${formatAvailabilityRange(currentAvailability)}${currentAvailability.note ? ` · ${currentAvailability.note}` : ""}` : text.noActive}
            </p>
          </div>
          {upcomingAvailability.length ? <AvailabilityQuickSummary playerId={hub.player.id} periods={hub.availabilityPeriods} locale={locale} compact /> : null}
          <AvailabilityOverviewActions playerId={hub.player.id} current={undefined} locale={locale} />
        </div>
      )}
    </Card>
  );
}

function AvailabilityOverviewActions({ playerId, current, locale }: { playerId: string; current?: PlayerMedicalPeriod; locale: "en" | "de" }) {
  const text = availabilityCopy[locale];
  return (
    <div className="flex flex-wrap gap-2">
      <details className="rounded-md bg-board-paper px-3 py-2">
        <summary className="cursor-pointer text-sm font-bold text-board-navy">{text.addUnavailability}</summary>
        <PlayerUnavailabilityForm playerId={playerId} returnTo={tabHref(playerId, "overview", "season")} compact locale={locale} action={createPlayerAvailabilityPeriod} />
      </details>
      {current ? (
        <>
          <details className="rounded-md bg-board-paper px-3 py-2">
            <summary className="cursor-pointer text-sm font-bold text-board-navy">{text.update}</summary>
            <MedicalUpdateForm playerId={playerId} period={current} compact />
          </details>
          <details className="rounded-md bg-board-paper px-3 py-2">
            <summary className="cursor-pointer text-sm font-bold text-board-navy">{text.returned}</summary>
            <MarkReturnedForm playerId={playerId} period={current} />
          </details>
        </>
      ) : null}
      <ButtonLink href={tabHref(playerId, "medical", "season")} variant="secondary" className="h-10 px-3">{text.viewHistory}</ButtonLink>
    </div>
  );
}

function AvailabilityQuickSummary({ periods, playerId, locale, compact = false }: { periods: PlayerAvailabilityPeriod[]; playerId: string; locale: "en" | "de"; compact?: boolean }) {
  const text = availabilityCopy[locale];
  const activePeriods = periods.filter((period) => period.status === "active");
  const current = activePeriods.filter((period) => isAvailabilityCurrent(period)).slice(0, compact ? 2 : 4);
  const upcoming = activePeriods.filter((period) => isAvailabilityUpcoming(period)).slice(0, compact ? 2 : 4);
  if (!current.length && !upcoming.length) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <CompactAvailabilityGroup title={text.current} periods={current} playerId={playerId} locale={locale} empty={text.currentEmpty} />
      <CompactAvailabilityGroup title={text.upcoming} periods={upcoming} playerId={playerId} locale={locale} empty={text.upcomingEmpty} />
    </div>
  );
}

function CompactAvailabilityGroup({ title, periods, playerId, locale, empty }: { title: string; periods: PlayerAvailabilityPeriod[]; playerId: string; locale: "en" | "de"; empty: string }) {
  return (
    <div className="rounded-md border border-board-line bg-white p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="mt-2 space-y-2">
        {periods.length ? periods.map((period) => (
          <Link key={period.id} href={`${tabHref(playerId, "medical", "season")}#availability-period-${period.id}`} className="block rounded bg-slate-50 p-2 text-sm transition hover:bg-green-50">
            <p className="font-bold text-board-navy">{localizedAvailabilityReason(period.reason, locale)}</p>
            <p className="text-slate-600">{formatAvailabilityRange(period)}</p>
            {period.note ? <p translate="no" className="line-clamp-1 text-slate-500">{period.note}</p> : null}
          </Link>
        )) : <p className="text-sm text-slate-500">{empty}</p>}
      </div>
    </div>
  );
}

function AnalyticsMetricGrid({ hub, period }: { hub: PlayerHubData; period: AnalyticsPeriod }) {
  const summary = hub.analytics.summary;
  const records = summary.records;
  const latestRatings = records.map((entry) => entry.overallRating).filter((rating): rating is number => typeof rating === "number").slice(0, 5);
  return (
    <section className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsMetricCard
          href={tabHref(hub.player.id, "analytics", period)}
          label="Average rating"
          value={formatRating(summary.averageRating)}
          detail={`${summary.rated} rated training${summary.rated === 1 ? "" : "s"}`}
          tone={ratingTone(summary.averageRating)}
          icon={<Activity className="h-4 w-4" />}
        />
        <AnalyticsMetricCard
          href={tabHref(hub.player.id, "analytics", period)}
          label="Trend"
          value={trendValue(summary.trend.value)}
          detail={summary.trend.label === "No trend" ? "No trend yet" : summary.trend.label}
          tone={trendTone(summary.trend.value)}
          icon={trendIcon(summary.trend.value)}
        />
        <AnalyticsMetricCard
          href={tabHref(hub.player.id, "attendance", period)}
          label="Attendance"
          value={formatPercent(summary.attendanceRate)}
          detail={`${summary.attended} of ${summary.trainings} attended`}
          tone={attendanceTone(summary.attendanceRate)}
          icon={<CalendarDays className="h-4 w-4" />}
        >
          <AttendanceSegmentBar present={summary.attendanceDistribution.present} late={summary.attendanceDistribution.late} absent={summary.absent} />
        </AnalyticsMetricCard>
        <AnalyticsMetricCard
          href={tabHref(hub.player.id, "attendance", period)}
          label="Reliability"
          value={summary.reliabilityPenalty.toFixed(1)}
          detail={`${summary.attendanceDistribution.lateCancellation} late cancellation${summary.attendanceDistribution.lateCancellation === 1 ? "" : "s"}`}
          tone={reliabilityTone(summary.reliabilityPenalty)}
          icon={<ShieldAlert className="h-4 w-4" />}
        />
      </div>
      <div className="grid gap-3 rounded-lg border border-board-line bg-white p-4 shadow-soft sm:grid-cols-3">
        <Mini label="Rated trainings" value={String(summary.rated)} />
        <Mini label="Evidence base" value={summary.evidenceBase.label} />
        <Mini label="Last rating" value={summary.latestRating ? String(summary.latestRating) : "No rating"} />
      </div>
      {latestRatings.length ? (
        <div className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Recent ratings</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {latestRatings.map((rating, index) => <RatingChip key={`${rating}-${index}`} rating={rating} />)}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AnalyticsTab({ hub, period }: { hub: PlayerHubData; period: AnalyticsPeriod }) {
  const { player, analytics } = hub;
  const { summary, assessmentHistory } = analytics;
  return (
    <div className="space-y-6">
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

async function AttendanceTab({ hub, filter, period, customFrom, customTo }: { hub: PlayerHubData; filter: AttendanceFilter; period: AnalyticsPeriod; customFrom?: string; customTo?: string }) {
  const locale = await getActiveLocale();
  const ui = createSystemTranslator(locale);
  const records = filterAttendanceRecords(hub.analytics.summary.records, filter);
  const distribution = hub.analytics.summary.attendanceDistribution;
  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label={ui("Attendance rate")} value={formatPercent(hub.analytics.summary.attendanceRate, locale)} />
        <Stat label={ui("Present")} value={String(distribution.present)} />
        <Stat label={ui("Late")} value={String(distribution.late)} />
        <Stat label={ui("Absent")} value={String(hub.analytics.summary.absent)} />
        <Stat label={ui("Reliability")} value={formatNumber(hub.analytics.summary.reliabilityPenalty, locale, { minimumFractionDigits: 1 })} />
      </section>
      <Card title={ui("Attendance record")} icon={<CalendarDays className="h-5 w-5" />}>
        <div className="mb-4 flex flex-wrap gap-2">
          {attendanceFilters.map((item) => (
            <Link key={item.id} href={`${tabHref(hub.player.id, "attendance", period, customFrom, customTo)}&attendance=${item.id}`} className={cn("rounded-md px-3 py-2 text-sm font-bold", filter === item.id ? "bg-board-green text-white" : "bg-slate-100 text-slate-700 hover:bg-green-50 hover:text-board-green")}>
              {ui(item.label)}
            </Link>
          ))}
        </div>
        <div className="space-y-3">
          {records.length ? records.map((entry) => <AttendanceEntryCard key={entry.id} entry={entry} />) : <p className="rounded-md border border-dashed border-board-line p-4 text-sm text-slate-600">{ui("No attendance records for this period.")}</p>}
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
              <p translate="no" className="mt-1 whitespace-pre-wrap text-slate-600">{observation.note}</p>
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

function DetailsTab({ hub, medicalError, contactError, deleteError }: { hub: PlayerHubData; medicalError?: string; contactError?: string; deleteError?: string }) {
  const player = hub.player;
  const currentAvailability = currentAvailabilityPeriod(hub.availabilityPeriods);
  const hasEquipment = Boolean(player.topSize || player.jacketSize || player.trouserSize || player.shoeSize);
  const hasOnboarding = Boolean(
    player.onboardingSource ||
    player.onboardingSubmittedAt ||
    player.onboardingImportBatch ||
    player.onboardingWarnings.length ||
    player.onboardingOriginalAnswers ||
    player.onboardingNormalizedValues
  );
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
            <DetailRow label="Birthdate" value={player.dateOfBirth ? `${formatPlayerBirthDate(player.dateOfBirth)} · ${calculateAge(player.dateOfBirth) ?? "-"} years` : undefined} />
            <DetailRow label="Availability" value={hub.currentMedical ? medicalLabel(hub.currentMedical) : currentAvailability ? `Unavailable · ${availabilityReasonLabel(currentAvailability.reason)}` : "Available"} />
            <DetailRow label="Current development focus" value={player.workOn || player.developmentGoal} />
            <DetailRow label="Player type" value={player.playerType === "trial" ? "Trial Player" : "Roster"} />
            <DetailRow label="External player ID" value={player.externalPlayerId} />
            <DetailRow label="Trial start date" value={player.trialStartDate ? formatEventDate(player.trialStartDate) : undefined} />
            <DetailRow label="Trial duration" value={trialDurationLabel(player)} />
          </DetailGrid>
        </Card>
        <Card title="Football profile" icon={<Footprints className="h-5 w-5" />}>
          <DetailGrid>
            <DetailRow label="Current club" value={player.club} />
            <DetailRow label="Original imported club" value={player.originalClub} />
            <DetailRow label="Primary position" value={positionLabel(player.position)} />
            <DetailRow label="Position groups" value={player.positionFamilies.join(", ")} />
            <DetailRow label="Secondary positions" value={positionListLabel(player.secondaryPositions)} />
            <DetailRow label="Player-preferred positions" value={positionListLabel(player.preferredPositions)} />
            <DetailRow label="Original preferred positions" value={player.originalPreferredPositions} />
            <DetailRow label="Dominant foot" value={player.strongFoot} />
            <DetailRow label="Original dominant foot" value={player.originalStrongFoot} />
            <DetailRow label="Biggest football ambition" value={player.developmentGoal} />
            <DetailRow label="Self-identified development focus" value={player.workOn} />
            <DetailRow label="Jersey number" value={player.jerseyNumber} />
            <DetailRow label="Height" value={player.heightCm ? `${player.heightCm} cm` : undefined} />
            <DetailRow label="Weight" value={player.weightKg ? `${player.weightKg} kg` : undefined} />
            <DetailRow label="Distance" value={player.distanceKm ? `${player.distanceKm} km` : undefined} />
            <DetailRow label="Captain status" value={player.captainStatus ? captainLabel(player.captainStatus) : undefined} />
            <DetailRow label="Joined date" value={player.joinedDate ? formatEventDate(player.joinedDate) : undefined} />
            <DetailRow label="Exit date" value={player.exitDate ? formatEventDate(player.exitDate) : undefined} />
            <DetailRow label="Exit reason" value={player.exitReason} />
            <DetailRow label="Scouting source" value={player.scoutingSource} />
            <DetailRow label="Development centre" value={player.developmentCentre} />
            <DetailRow label="Last performance review" value={player.lastPerformanceReviewDate ? formatEventDate(player.lastPerformanceReviewDate) : undefined} />
          </DetailGrid>
        </Card>
        {player.addressStreet || player.addressPostalCode || player.addressCity ? (
          <Card title="Address" icon={<ClipboardList className="h-5 w-5" />}>
            <div className="rounded-lg bg-slate-50 p-4 text-sm font-semibold leading-6 text-board-navy">
              {player.addressStreet ? <p>{player.addressStreet}</p> : null}
              {player.addressPostalCode || player.addressCity ? <p>{[player.addressPostalCode, player.addressCity].filter(Boolean).join(" ")}</p> : null}
            </div>
          </Card>
        ) : null}
        <Card title="Contact information" icon={<Phone className="h-5 w-5" />}>
          <DetailGrid>
            <DetailRow label="Player phone" value={player.playerPhone} href={player.playerPhone ? `tel:${player.playerPhone}` : undefined} />
            <DetailRow label="Player email" value={player.playerEmail} href={player.playerEmail ? `mailto:${player.playerEmail}` : undefined} />
            <DetailRow label="Secondary email" value={player.secondaryEmail} href={player.secondaryEmail ? `mailto:${player.secondaryEmail}` : undefined} />
            <DetailRow label="Parent / guardian" value={player.parentGuardianName} />
            <DetailRow label="Parent / guardian phone" value={player.parentPhone} href={player.parentPhone ? `tel:${player.parentPhone}` : undefined} />
            <DetailRow label="Parent / guardian email" value={player.parentEmail} href={player.parentEmail ? `mailto:${player.parentEmail}` : undefined} />
            <DetailRow label="Emergency contact" value={player.emergencyContactName} />
            <DetailRow label="Emergency relationship" value={player.emergencyContactRelationship} />
            <DetailRow label="Emergency phone" value={player.emergencyContactPhone} href={player.emergencyContactPhone ? `tel:${player.emergencyContactPhone}` : undefined} />
          </DetailGrid>
          <ContactSection playerId={player.id} contacts={hub.contacts} error={contactError} />
        </Card>
        {hasEquipment ? (
          <Card title="Equipment" icon={<Shirt className="h-5 w-5" />}>
            <DetailGrid>
              <DetailRow label="Top / shirt size" value={player.topSize} />
              <DetailRow label="Jacket size" value={player.jacketSize} />
              <DetailRow label="Trouser size" value={player.trouserSize} />
              <DetailRow label="Shoe size" value={player.shoeSize} />
            </DetailGrid>
          </Card>
        ) : null}
      </section>
      <Card title="Player Voice" icon={<Target className="h-5 w-5" />}>
        <DetailGrid>
          <DetailRow label="Hobbies and interests" value={player.hobbies} />
          <DetailRow label="Biggest football goal" value={player.developmentGoal} />
          <DetailRow label="What the player wants to improve" value={player.workOn} />
          <DetailRow label="Expectations and wishes" value={player.coachExpectations} />
          <DetailRow label="Additional onboarding answers" value={player.onboardingComments} />
          <DetailRow label="Coach notes" value={player.notes} />
          <DetailRow label="Response source" value={player.onboardingSource} />
          <DetailRow label="Submitted" value={player.onboardingSubmittedAt ? formatLongDate(player.onboardingSubmittedAt) : undefined} />
          <DetailRow label="Last updated" value={formatLongDate(player.updatedAt)} />
        </DetailGrid>
      </Card>
      {player.clubTrainingSchedule ? (
        <Card title="Club schedule" icon={<CalendarDays className="h-5 w-5" />}>
          <ClubSchedule value={player.clubTrainingSchedule} />
        </Card>
      ) : null}
      {hasOnboarding ? (
        <Card title="Onboarding responses" icon={<ClipboardList className="h-5 w-5" />}>
          <div className="space-y-5">
            <DetailGrid>
              <DetailRow label="Source" value={player.onboardingSource} />
              <DetailRow label="Submitted" value={player.onboardingSubmittedAt ? formatLongDate(player.onboardingSubmittedAt) : undefined} />
              <DetailRow label="Import batch" value={player.onboardingImportBatch} />
              <DetailRow label="Warnings" value={player.onboardingWarnings.join("\n")} />
            </DetailGrid>
            <KeyValueRecord title="Original questionnaire answers" value={player.onboardingOriginalAnswers} />
            <KeyValueRecord title="Normalized structured values" value={player.onboardingNormalizedValues} />
          </div>
        </Card>
      ) : null}
      <Card title="Danger zone" icon={<AlertTriangle className="h-5 w-5" />}>
        <form action={permanentlyDeleteSquadPlayer} className="rounded-lg border border-red-200 bg-red-50 p-4">
          <input type="hidden" name="playerId" value={player.id} />
          <h3 className="font-bold text-red-900">Delete player permanently</h3>
          <p className="mt-2 text-sm text-red-800">
            This removes the player profile and related attendance, ratings, medical periods, contacts, notes, development goals and observations. Trainings themselves stay in CoachBoard.
          </p>
          <p className="mt-2 text-sm font-semibold text-red-900">
            Related data: {hub.lifetime.trainings} trainings · {hub.lifetime.ratings} ratings · {hub.medicalPeriods.length} medical periods · {hub.contacts.length} contacts.
          </p>
          {deleteError === "confirm" ? <p className="mt-3 rounded-md bg-white px-3 py-2 text-sm font-bold text-red-700">Confirm the checkbox and type the full player name exactly.</p> : null}
          <label className="mt-4 flex items-start gap-2 text-sm font-semibold text-red-900">
            <input name="confirmDelete" type="checkbox" className="mt-0.5 h-4 w-4" />
            I understand this cannot be undone.
          </label>
          <label className="mt-3 block">
            <span className="text-sm font-semibold text-red-900">Type full name to confirm: {playerFullName(player)}</span>
            <input name="confirmName" className="mt-1 h-10 w-full rounded-md border border-red-200 bg-white px-3 text-sm outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100" />
          </label>
          <Button type="submit" variant="danger" className="mt-3">Delete player permanently</Button>
        </form>
      </Card>
      <MedicalSection playerId={player.id} player={player} periods={hub.medicalPeriods} error={medicalError} />
    </div>
  );
}

function trialDurationLabel(player: SquadPlayer) {
  if (player.playerType !== "trial") return undefined;
  if (player.trialDurationMode === "training_count" && player.trialTrainingLimit) {
    return `${player.trialTrainingLimit} training${player.trialTrainingLimit === 1 ? "" : "s"}`;
  }
  if (player.trialDurationMode === "end_date" && player.trialEndDate) return `Until ${formatEventDate(player.trialEndDate)}`;
  return undefined;
}

function ClubSchedule({ value }: { value: string }) {
  const lines = value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return (
    <div className="space-y-3">
      {lines.length > 1 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {lines.map((line) => {
            const [day, ...rest] = line.split(/[:|-]/);
            const detail = rest.join("-").trim();
            return (
              <div key={line} className="rounded-md bg-slate-50 p-3">
                <p className="text-sm font-bold text-board-navy">{day.trim()}</p>
                {detail ? <p className="mt-1 text-sm text-slate-600">{detail}</p> : null}
              </div>
            );
          })}
        </div>
      ) : null}
      <details className="rounded-md border border-board-line bg-white p-3">
        <summary className="cursor-pointer text-sm font-bold text-board-navy">Original imported schedule</summary>
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{value}</p>
      </details>
    </div>
  );
}

function KeyValueRecord({ title, value }: { title: string; value?: Record<string, unknown> }) {
  if (!value || !Object.keys(value).length) return null;
  return (
    <div>
      <h3 className="text-sm font-bold text-board-navy">{title}</h3>
      <dl className="mt-2 divide-y divide-board-line rounded-md border border-board-line">
        {Object.entries(value).map(([key, answer]) => (
          <div key={key} className="grid gap-1 p-3 text-sm sm:grid-cols-[220px_1fr]">
            <dt className="font-bold text-slate-600">{key}</dt>
            <dd className="whitespace-pre-wrap text-board-navy">{formatRecordValue(answer)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function formatRecordValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "Not added";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function MedicalTab({ hub, medicalError, locale }: { hub: PlayerHubData; medicalError?: string; locale: "en" | "de" }) {
  const text = availabilityCopy[locale];
  const active = hub.medicalPeriods.filter((period) => period.status === "active");
  const review = active.filter(medicalReviewNeeded);
  const history = hub.medicalPeriods.filter((period) => period.status !== "active");
  const current = hub.currentMedical;
  const currentAvailability = currentAvailabilityPeriod(hub.availabilityPeriods);
  const overlapping = active.length > 1;
  return (
    <div className="space-y-6">
      <Card title={text.title} icon={<CalendarDays className="h-5 w-5" />}>
        {medicalError ? <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{medicalError}</p> : null}
        {current ? (
          <div className={cn("rounded-md border-l-4 bg-slate-50 p-4", current.type === "injured" ? "border-red-400" : "border-amber-400")}>
            <p className="text-sm font-bold uppercase tracking-wide text-slate-500">{localizedMedicalLabel(current, locale)}</p>
            <p className="mt-2 text-xl font-bold text-board-navy">{current.description}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Mini label={text.from} value={formatEventDate(current.startDate)} />
              <Mini label={text.expectedReturn} value={current.expectedReturnDate ? formatEventDate(current.expectedReturnDate) : "-"} />
              <Mini label={text.actualReturn} value={current.actualReturnDate ? formatEventDate(current.actualReturnDate) : "-"} />
              <Mini label={text.status} value={current.status} />
            </div>
            {medicalReviewNeeded(current) ? <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">{text.returnNeedsReview}</p> : null}
            {overlapping ? <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">{text.overlapping}</p> : null}
            <details className="mt-4 rounded-md bg-white p-3">
              <summary className="cursor-pointer text-sm font-bold text-board-navy">{text.returned}</summary>
              <MarkReturnedForm playerId={hub.player.id} period={current} />
            </details>
          </div>
        ) : (
          <div className={cn("rounded-md border-l-4 bg-slate-50 p-4", currentAvailability ? "border-red-400" : "border-green-500")}>
            {currentAvailability ? (
              <>
                <p className="text-sm font-bold uppercase tracking-wide text-slate-500">{text.unavailable}</p>
                <p className="mt-2 text-xl font-bold text-board-navy">{localizedAvailabilityReason(currentAvailability.reason, locale)}</p>
                <p className="mt-2 text-sm text-slate-600">
                  {formatAvailabilityRange(currentAvailability)}
                  {currentAvailability.note ? ` · ${currentAvailability.note}` : ""}
                </p>
              </>
            ) : (
              <>
            <p className="text-sm font-bold uppercase tracking-wide text-slate-500">{text.available}</p>
                <p className="mt-2 text-sm text-slate-600">{text.noActive}</p>
              </>
            )}
          </div>
        )}
      </Card>

      <AvailabilitySection playerId={hub.player.id} periods={hub.availabilityPeriods} locale={locale} />

      <Card title={text.addUnavailability} icon={<ShieldAlert className="h-5 w-5" />}>
        <p className="mb-3 rounded-md bg-board-paper p-3 text-sm text-slate-700">{text.absenceHelp}</p>
        <PlayerUnavailabilityForm playerId={hub.player.id} returnTo={`/squad/players/${hub.player.id}?tab=medical`} locale={locale} action={createPlayerAvailabilityPeriod} />
      </Card>

      {review.length ? (
        <Card title={text.needsReview} icon={<ShieldAlert className="h-5 w-5" />}>
          <div className="space-y-3">{review.map((period) => <MedicalRecordCard key={period.id} playerId={hub.player.id} period={period} />)}</div>
        </Card>
      ) : null}

      {active.length ? (
        <Card title={text.activeRecords} icon={<Stethoscope className="h-5 w-5" />}>
          <div className="space-y-3">{active.map((period) => <MedicalRecordCard key={period.id} playerId={hub.player.id} period={period} />)}</div>
        </Card>
      ) : null}

      <Card title={text.medicalHistory} icon={<ClipboardList className="h-5 w-5" />}>
        <div className="space-y-3">
          {history.length ? history.map((period) => <MedicalRecordCard key={period.id} playerId={hub.player.id} period={period} />) : <p className="rounded-md border border-dashed border-board-line p-4 text-sm text-slate-600">{text.noMedicalHistory}</p>}
        </div>
      </Card>

      <Card title={text.medicalInfo} icon={<FileText className="h-5 w-5" />}>
        <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm font-semibold text-amber-800">{text.medicalPrivate}</p>
        <DetailGrid>
          <DetailRow label="Allergies" value={hub.player.allergies} />
          <DetailRow label="Medication" value={hub.player.medication} />
          <DetailRow label="Private medical notes" value={hub.player.medicalNotes} />
        </DetailGrid>
      </Card>
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

function AvailabilitySection({ playerId, periods, locale }: { playerId: string; periods: PlayerAvailabilityPeriod[]; locale: "en" | "de" }) {
  const text = availabilityCopy[locale];
  const activePeriods = periods.filter((period) => period.status === "active");
  const current = activePeriods.filter((period) => isAvailabilityCurrent(period));
  const upcoming = activePeriods.filter((period) => isAvailabilityUpcoming(period));
  const past = periods.filter((period) => period.status !== "active" || isAvailabilityPast(period));
  return (
    <Card title={text.title} icon={<CalendarDays className="h-5 w-5" />}>
      <p className="mb-4 rounded-md bg-board-paper p-3 text-sm text-slate-700">{text.systemNote}</p>
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <AvailabilityList title={text.current} periods={current} playerId={playerId} empty={text.currentEmpty} locale={locale} />
        <AvailabilityList title={text.upcoming} periods={upcoming} playerId={playerId} empty={text.upcomingEmpty} locale={locale} />
        <AvailabilityList title={text.past} periods={past.slice(0, 6)} playerId={playerId} empty={text.pastEmpty} locale={locale} />
      </div>
    </Card>
  );
}

function AvailabilityList({ title, periods, playerId, empty, locale }: { title: string; periods: PlayerAvailabilityPeriod[]; playerId: string; empty: string; locale: "en" | "de" }) {
  const text = availabilityCopy[locale];
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="mt-2 space-y-2">
        {periods.length ? periods.map((period) => (
          <article id={`availability-period-${period.id}`} key={period.id} className={cn("rounded-md border p-3 text-sm", period.status === "active" ? "border-board-line bg-white" : "border-slate-200 bg-slate-50 text-slate-500")}>
            <div className="flex flex-col gap-3">
              <div>
                <p className="font-bold text-board-navy">{localizedAvailabilityReason(period.reason, locale)}</p>
                <p className="mt-1 text-slate-600">{formatAvailabilityRange(period)}</p>
                {period.note ? <p translate="no" className="mt-1 whitespace-pre-wrap text-slate-700">{period.note}</p> : null}
                {period.status !== "active" ? <p className="mt-1 text-xs font-semibold uppercase text-slate-400">{period.status}</p> : null}
              </div>
              {period.status === "active" ? (
                <div className="space-y-2 border-t border-slate-100 pt-2">
                  <details className="rounded-md bg-slate-50 p-2">
                    <summary className="cursor-pointer text-xs font-bold text-board-navy">{text.editAbsence}</summary>
                    <form action={updatePlayerAvailabilityPeriodDetails} className="mt-3 grid gap-2">
                      <input type="hidden" name="playerId" value={playerId} />
                      <input type="hidden" name="periodId" value={period.id} />
                      <input type="hidden" name="returnTo" value={`/squad/players/${playerId}?tab=medical`} />
                      <FieldLabel label={text.reason}>
                        <select name="reason" defaultValue={period.reason} className={fieldClass()}>
                          {generalAbsenceReasonOptions.map((option) => <option key={option.value} value={option.value}>{localizedAvailabilityReason(option.value, locale)}</option>)}
                        </select>
                      </FieldLabel>
                      <FieldLabel label={text.from}><input name="startsOn" required type="date" defaultValue={period.startsOn} className={fieldClass()} /></FieldLabel>
                      <FieldLabel label={text.until}><input name="endsOn" type="date" defaultValue={period.endsOn ?? ""} className={fieldClass()} /></FieldLabel>
                      <FieldLabel label={text.note}><textarea name="note" rows={2} defaultValue={period.note ?? ""} className={textareaClass()} /></FieldLabel>
                      <Button type="submit" variant="secondary" className="h-9 text-xs">{text.saveChanges}</Button>
                    </form>
                  </details>
                  <form action={deletePlayerAvailabilityPeriod}>
                    <input type="hidden" name="playerId" value={playerId} />
                    <input type="hidden" name="periodId" value={period.id} />
                    <input type="hidden" name="returnTo" value={`/squad/players/${playerId}?tab=medical`} />
                    <Button type="submit" variant="ghost" className="h-8 px-2 text-xs">{text.deleteAbsence}</Button>
                  </form>
                </div>
              ) : null}
            </div>
          </article>
        )) : <p className="rounded-md border border-dashed border-board-line p-3 text-sm text-slate-600">{empty}</p>}
      </div>
    </div>
  );
}

function ContactSection({ playerId, contacts, error }: { playerId: string; contacts: PlayerContact[]; error?: string }) {
  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <p className="text-sm font-bold text-board-navy">Related contacts</p>
      {error ? <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
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

function MedicalSection({ playerId, player, periods, error }: { playerId: string; player: SquadPlayer; periods: PlayerMedicalPeriod[]; error?: string }) {
  const active = periods.filter((period) => period.status === "active");
  return (
    <Card title="Medical availability" icon={<Stethoscope className="h-5 w-5" />}>
      <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm font-semibold text-amber-800">Private medical information. Only minimal availability labels are shown in attendance workflows.</p>
      {error ? <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
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
                {period.notes ? <p translate="no" className="mt-2 whitespace-pre-wrap text-slate-700">{period.notes}</p> : null}
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

function MarkReturnedForm({ playerId, period }: { playerId: string; period: PlayerMedicalPeriod }) {
  return (
    <form action={updatePlayerMedicalPeriodStatus} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
      <input type="hidden" name="playerId" value={playerId} />
      <input type="hidden" name="periodId" value={period.id} />
      <input type="hidden" name="status" value="completed" />
      <FieldLabel label="Actual return date">
        <input name="actualReturnDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={fieldClass()} />
      </FieldLabel>
      <div className="flex items-end">
        <Button type="submit" variant="secondary" className="h-11">Mark returned</Button>
      </div>
    </form>
  );
}

function MedicalUpdateForm({ playerId, period, compact = false }: { playerId: string; period: PlayerMedicalPeriod; compact?: boolean }) {
  return (
    <form action={updatePlayerMedicalPeriodDetails} className={cn("mt-3 grid gap-2", compact ? "sm:grid-cols-2" : "")}>
      <input type="hidden" name="playerId" value={playerId} />
      <input type="hidden" name="periodId" value={period.id} />
      <input type="hidden" name="returnTo" value={`/squad/players/${playerId}?tab=medical`} />
      <FieldLabel label="Description" wide={compact}>
        <input name="description" required defaultValue={period.description} className={fieldClass()} />
      </FieldLabel>
      <FieldLabel label="Expected return">
        <input name="expectedReturnDate" type="date" defaultValue={period.expectedReturnDate ?? ""} className={fieldClass()} />
      </FieldLabel>
      <FieldLabel label="Notes" wide>
        <textarea name="notes" rows={2} defaultValue={period.notes ?? ""} className={textareaClass()} />
      </FieldLabel>
      <div className={compact ? "sm:col-span-2" : ""}>
        <Button type="submit" variant="secondary" className="h-10">Save update</Button>
      </div>
    </form>
  );
}

function MedicalRecordCard({ playerId, period }: { playerId: string; period: PlayerMedicalPeriod }) {
  return (
    <article className={cn("rounded-md border p-3 text-sm", period.status === "active" ? "border-board-line bg-slate-50" : "border-board-line bg-white")}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-bold text-board-navy">{medicalLabel(period)} · {period.description}</p>
          <p className="mt-1 text-slate-600">
            From {formatEventDate(period.startDate)}
            {" · "}
            Expected return {period.expectedReturnDate ? formatEventDate(period.expectedReturnDate) : "not set"}
            {" · "}
            Actual return {period.actualReturnDate ? formatEventDate(period.actualReturnDate) : "not entered"}
          </p>
          <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">Status: {period.status}</p>
          {medicalReviewNeeded(period) ? <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">Return status needs review</p> : null}
          {period.notes ? <p translate="no" className="mt-2 whitespace-pre-wrap text-slate-700">{period.notes}</p> : null}
        </div>
        {period.status === "active" ? (
          <div className="space-y-2">
            <details className="rounded-md bg-board-paper p-2">
              <summary className="cursor-pointer text-xs font-bold uppercase text-board-navy">Update</summary>
              <MedicalUpdateForm playerId={playerId} period={period} />
            </details>
            <details className="rounded-md bg-board-paper p-2">
              <summary className="cursor-pointer text-xs font-bold uppercase text-board-navy">Mark returned</summary>
              <MarkReturnedForm playerId={playerId} period={period} />
            </details>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function AnalyticsMetricCard({ href, label, value, detail, tone, icon, children }: { href: string; label: string; value: string; detail: string; tone: MetricTone; icon?: ReactNode; children?: ReactNode }) {
  return (
    <Link href={href} className={cn("block rounded-lg border bg-white p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-md", toneBorder(tone))}>
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">{icon}{label}</p>
      <p className={cn("mt-2 text-3xl font-bold", toneText(tone))}>{value}</p>
      <p className="mt-1 text-sm font-semibold text-slate-600">{detail}</p>
      {children ? <div className="mt-3">{children}</div> : null}
    </Link>
  );
}

function AttendanceSegmentBar({ present, late, absent }: { present: number; late: number; absent: number }) {
  const total = present + late + absent;
  if (!total) return <p className="text-xs text-slate-500">No attendance data</p>;
  return (
    <div aria-label={`${present} present, ${late} late, ${absent} absent`} className="flex h-2 overflow-hidden rounded-full bg-slate-100">
      <span className="bg-green-500" style={{ width: `${(present / total) * 100}%` }} />
      <span className="bg-amber-400" style={{ width: `${(late / total) * 100}%` }} />
      <span className="bg-red-400" style={{ width: `${(absent / total) * 100}%` }} />
    </div>
  );
}

function RatingChip({ rating }: { rating: number }) {
  return <span className={cn("inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm font-bold", ratingToneClass(rating))}>{rating}</span>;
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

async function AttendanceEntryCard({ entry }: { entry: PlayerAnalyticsRecord }) {
  const locale = await getActiveLocale();
  const ui = createSystemTranslator(locale);
  return (
    <article translate="no" className="rounded-md border border-board-line bg-board-paper p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-board-navy">
            {entry.event ? <Link href={`/trainings/${entry.event.id}`} className="underline-offset-4 hover:text-board-green hover:underline">{formatEventDate(entry.event.date, locale)} · {entry.event.label || ui("Training")}</Link> : ui("Training")}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {ui("Planned: {planned} · Actual: {actual}", { planned: plannedStatusLabel(entry.plannedStatus, locale), actual: finalStatusLabel(entry.finalStatus, locale) })}
            {entry.overallRating ? ` · ${ui("Rating: {rating}", { rating: entry.overallRating })}` : ""}
            {entry.plannedReason ? ` · ${ui("Reason: {reason}", { reason: plannedReasonLabel(entry.plannedReason, locale) })}` : ""}
            {entry.lateMinutes ? ` · ${ui("Late: {minutes} min", { minutes: entry.lateMinutes })}` : ""}
            {` · ${ui("Malus: {value}", { value: formatNumber(reliabilityMalus(entry), locale) })}`}
          </p>
          {entry.medicalAvailability ? (
            <p className="mt-1 text-xs font-bold text-red-700">
              {ui("Medical status: ")}{ui(entry.medicalAvailability.label)}
              {entry.medicalAvailability.until ? ` ${ui("Until")} ${formatEventDate(entry.medicalAvailability.until, locale)}` : ""}
              {entry.medicalAvailability.needsReview ? ` · ${ui("Return needs review")}` : ""}
            </p>
          ) : null}
        </div>
        {entry.sensitiveNote ? <Badge tone="red">{ui("Private note")}</Badge> : null}
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

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-board-navy">{value}</p>
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

function localizedAvailabilityReason(reason: PlayerAvailabilityPeriod["reason"], locale: "en" | "de") {
  const labels = {
    en: {
      school: "School",
      work: "Work",
      holiday: "Holiday",
      private: "Private",
      other: "Other"
    },
    de: {
      school: "Schule",
      work: "Arbeit",
      holiday: "Urlaub",
      private: "Privat",
      other: "Sonstiges"
    }
  } as const;
  return labels[locale][reason];
}

function localizedMedicalLabel(period: PlayerMedicalPeriod, locale: "en" | "de") {
  if (locale === "de") return period.type === "injured" ? "Verletzt" : "Krank";
  return medicalLabel(period);
}

function captainLabel(value: string) {
  if (value === "captain") return "Captain";
  if (value === "vice_captain") return "Vice captain";
  return "No captain status";
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeReturnPath(value?: string) {
  if (!value) return "/squad";
  if (value.startsWith("/squad") || value.startsWith("/actions") || value.startsWith("/dashboard")) return value;
  return "/squad";
}

function isPeriodAwareTab(tab: PlayerHubTab) {
  return tab === "overview" || tab === "analytics" || tab === "history" || tab === "attendance" || tab === "notes";
}

function parseAttendanceFilter(value?: string | string[]): AttendanceFilter {
  const raw = one(value);
  return raw === "present" || raw === "late" || raw === "absent" || raw === "injured" || raw === "sick" || raw === "excused" || raw === "private" || raw === "cancelled" || raw === "unexcused"
    ? raw
    : "all";
}

function filterAttendanceRecords(records: PlayerAnalyticsRecord[], filter: AttendanceFilter) {
  if (filter === "all") return records;
  if (filter === "present") return records.filter((entry) => entry.finalStatus === "present");
  if (filter === "late") return records.filter((entry) => entry.finalStatus === "Z");
  if (filter === "absent") return records.filter((entry) => entry.finalStatus && !["present", "Z"].includes(entry.finalStatus));
  if (filter === "injured") return records.filter((entry) => entry.finalStatus === "V" || entry.plannedReason === "V");
  if (filter === "sick") return records.filter((entry) => entry.finalStatus === "K" || entry.plannedReason === "K");
  if (filter === "excused") return records.filter((entry) => entry.finalStatus === "E" || entry.plannedReason === "E");
  if (filter === "private") return records.filter((entry) => entry.finalStatus === "P" || entry.plannedReason === "P");
  if (filter === "cancelled") return records.filter((entry) => entry.finalStatus === "S" || entry.plannedReason === "S");
  return records.filter((entry) => entry.finalStatus === "U" || entry.plannedReason === "U");
}

type MetricTone = "positive" | "warning" | "negative" | "neutral";

function ratingTone(value: number | null): MetricTone {
  if (value === null) return "neutral";
  if (value >= 4) return "positive";
  if (value >= 3) return "neutral";
  if (value >= 2) return "warning";
  return "negative";
}

function trendTone(value: number | null): MetricTone {
  if (value === null) return "neutral";
  if (value >= 0.3) return "positive";
  if (value <= -0.3) return "negative";
  return "neutral";
}

function attendanceTone(value: number | null): MetricTone {
  if (value === null) return "neutral";
  if (value >= 0.85) return "positive";
  if (value >= 0.7) return "warning";
  return "negative";
}

function reliabilityTone(value: number): MetricTone {
  if (value === 0) return "positive";
  if (value >= -2) return "warning";
  return "negative";
}

function trendValue(value: number | null) {
  if (value === null) return "No trend";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

function trendIcon(value: number | null) {
  if (value === null) return <Minus className="h-4 w-4" />;
  if (value >= 0.3) return <TrendingUp className="h-4 w-4" />;
  if (value <= -0.3) return <TrendingDown className="h-4 w-4" />;
  return <Minus className="h-4 w-4" />;
}

function toneBorder(tone: MetricTone) {
  if (tone === "positive") return "border-green-200";
  if (tone === "warning") return "border-amber-200";
  if (tone === "negative") return "border-red-200";
  return "border-board-line";
}

function toneText(tone: MetricTone) {
  if (tone === "positive") return "text-green-700";
  if (tone === "warning") return "text-amber-700";
  if (tone === "negative") return "text-red-700";
  return "text-board-navy";
}

function ratingToneClass(rating: number) {
  if (rating >= 5) return "bg-green-100 text-green-800";
  if (rating >= 4) return "bg-green-50 text-green-700";
  if (rating === 3) return "bg-slate-100 text-slate-700";
  if (rating === 2) return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}

function positionLabel(position?: string) {
  return position ? formatPositionLabel(position) ?? position : undefined;
}

function positionListLabel(positions: string[]) {
  const labels = positions.map((position) => positionLabel(position)).filter(Boolean);
  return labels.length ? labels.join(", ") : undefined;
}

function medicalReviewNeeded(period: PlayerMedicalPeriod) {
  return period.status === "active" && Boolean(period.expectedReturnDate) && !period.actualReturnDate && (period.expectedReturnDate ?? "") < new Date().toISOString().slice(0, 10);
}

function currentAvailabilityPeriod(periods: PlayerAvailabilityPeriod[]) {
  return periods
    .filter((period) => period.status === "active" && isAvailabilityCurrent(period))
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn) || b.updatedAt.localeCompare(a.updatedAt))[0];
}

function isAvailabilityCurrent(period: PlayerAvailabilityPeriod) {
  const today = trainingNowParts().date;
  return period.startsOn <= today && (!period.endsOn || period.endsOn >= today);
}

function isAvailabilityUpcoming(period: PlayerAvailabilityPeriod) {
  const today = trainingNowParts().date;
  return period.startsOn > today;
}

function isAvailabilityPast(period: PlayerAvailabilityPeriod) {
  const today = trainingNowParts().date;
  return Boolean(period.endsOn && period.endsOn < today);
}

function formatAvailabilityRange(period: PlayerAvailabilityPeriod) {
  if (!period.endsOn || period.endsOn === period.startsOn) return formatEventDate(period.startsOn);
  return `${formatEventDate(period.startsOn)} - ${formatEventDate(period.endsOn)}`;
}
