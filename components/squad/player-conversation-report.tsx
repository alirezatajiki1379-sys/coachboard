import Link from "next/link";
import { ArrowLeft, FileText, ShieldCheck } from "lucide-react";
import { PrintButton } from "@/components/sessions/print-button";
import { Button } from "@/components/ui/button";
import type { PlayerDevelopmentProfile } from "@/lib/squad/development";
import type { PlayerAnalyticsSummary, AnalyticsPeriod } from "@/lib/squad/analytics";
import { formatPercent, formatRating } from "@/lib/squad/analytics";
import { finalStatusLabel } from "@/lib/squad/attendance-format";
import { playerFullName } from "@/lib/squad/format";
import {
  absenceDistribution,
  absenceReason,
  absenceReasonLabel,
  isMissedTraining,
  relevantAvailabilityPeriods,
  relevantMedicalPeriods,
  playerNotesInRange,
  reportRangeFromRecords,
  selectableConversationNotes,
  selectedConversationNotes
} from "@/lib/squad/player-report";
import { formatDate, type Locale } from "@/lib/i18n";
import type { PlayerAvailabilityPeriod, PlayerMedicalPeriod, PlayerNote } from "@/types/domain";

type ReportSections = {
  attendance: boolean;
  absenceReasons: boolean;
  availability: boolean;
  performance: boolean;
  developmentGoals: boolean;
  observations: boolean;
  playerNotes: boolean;
};

type PlayerConversationReportProps = {
  playerId: string;
  summary: PlayerAnalyticsSummary;
  development: PlayerDevelopmentProfile;
  medicalPeriods: PlayerMedicalPeriod[];
  availabilityPeriods: PlayerAvailabilityPeriod[];
  notes: PlayerNote[];
  locale: Locale;
  period: AnalyticsPeriod;
  customFrom?: string;
  customTo?: string;
  sections: ReportSections;
  selectedNoteIds: string[];
  selectedObservationIds: string[];
  mode: "player_conversation" | "internal_coach_report";
  configured: boolean;
  includePrivateTrainingNotes: boolean;
};

const copy = {
  en: {
    back: "Back to player",
    report: "Player Conversation",
    internalReport: "Internal Coach Report",
    reportMode: "Report type",
    composer: "Report composer",
    composerHelp: "Choose the context that is suitable for this conversation. Only explicitly selected notes and observations are printed.",
    update: "Update preview",
    attendance: "Attendance & absences",
    absenceReasons: "Absence reasons",
    availability: "Injuries & availability",
    performance: "Performance",
    goals: "Development Goals",
    observations: "Selected observations",
    notes: "Selected Player Notes",
    suitableNotes: "Suitable notes",
    noSuitableNotes: "No conversation-eligible notes in this period.",
    suitableObservations: "Observations",
    noObservations: "No observations in this period.",
    generated: "Generated",
    reviewPeriod: "Review period",
    playerCard: "Player Card",
    relevantTrainings: "Relevant Trainings",
    participated: "Participated",
    participationRate: "Participation rate",
    attendanceExpected: "Attendance when expected",
    late: "Late",
    missed: "Missed Trainings",
    absenceSummary: "Absence summary",
    absenceHistory: "Absence history",
    actual: "Actual",
    noAbsences: "No missed Trainings are recorded in this period.",
    generalAvailability: "General availability",
    noAvailability: "No injury or availability period overlaps this review period.",
    since: "Since",
    expectedReturn: "Expected return",
    returned: "Returned",
    current: "Current",
    completed: "Completed",
    average: "Average rating",
    rated: "Rated Trainings",
    trend: "Trend",
    evidence: "Evidence base",
    categories: "Rating categories",
    strengths: "Strengths",
    developmentFocus: "Development focus",
    recordedFocus: "Recorded player focus",
    noFocus: "No development focus has been recorded yet.",
    noGoals: "No development goals in this report.",
    nextReview: "Next review",
    privacy: "Private medical notes, medication, allergies and private absence details are never included.",
    internal: "Internal notes are not available in this composer.",
    includePrivate: "Include private coach notes",
    generalNotes: "General notes",
    trainingNotes: "Training notes",
    trial: "Trial Player",
    roster: "Roster Player",
    noPosition: "No position set"
  },
  de: {
    back: "Zurück zum Spieler",
    report: "Spielergespräch",
    internalReport: "Interner Trainerbericht",
    reportMode: "Berichtsart",
    composer: "Bericht zusammenstellen",
    composerHelp: "Wähle den passenden Kontext für dieses Gespräch. Nur ausdrücklich ausgewählte Notizen und Beobachtungen werden gedruckt.",
    update: "Vorschau aktualisieren",
    attendance: "Teilnahme & Fehlzeiten",
    absenceReasons: "Abwesenheitsgründe",
    availability: "Verletzungen & Verfügbarkeit",
    performance: "Leistungsentwicklung",
    goals: "Entwicklungsziele",
    observations: "Ausgewählte Beobachtungen",
    notes: "Ausgewählte Spielernotizen",
    suitableNotes: "Geeignete Notizen",
    noSuitableNotes: "Keine für Spielergespräche geeigneten Notizen in diesem Zeitraum.",
    suitableObservations: "Beobachtungen",
    noObservations: "Keine Beobachtungen in diesem Zeitraum.",
    generated: "Erstellt",
    reviewPeriod: "Gesprächszeitraum",
    playerCard: "Spielerkarte",
    relevantTrainings: "Relevante Trainings",
    participated: "Teilgenommen",
    participationRate: "Teilnahmequote",
    attendanceExpected: "Anwesenheit bei Einplanung",
    late: "Verspätet",
    missed: "Verpasste Trainings",
    absenceSummary: "Zusammenfassung Fehlzeiten",
    absenceHistory: "Fehlzeitenverlauf",
    actual: "Tatsächlich",
    noAbsences: "In diesem Zeitraum sind keine verpassten Trainings erfasst.",
    generalAvailability: "Allgemeine Verfügbarkeit",
    noAvailability: "Keine Verletzung oder Abwesenheit überschneidet diesen Gesprächszeitraum.",
    since: "Seit",
    expectedReturn: "Erwartete Rückkehr",
    returned: "Zurückgekehrt",
    current: "Aktuell",
    completed: "Abgeschlossen",
    average: "Durchschnittsbewertung",
    rated: "Bewertete Trainings",
    trend: "Trend",
    evidence: "Datengrundlage",
    categories: "Bewertungskategorien",
    strengths: "Stärken",
    developmentFocus: "Entwicklungsfokus",
    recordedFocus: "Erfasster Spielerfokus",
    noFocus: "Noch kein Entwicklungsfokus erfasst.",
    noGoals: "Keine Entwicklungsziele in diesem Bericht.",
    nextReview: "Nächste Überprüfung",
    privacy: "Private medizinische Notizen, Medikamente, Allergien und private Abwesenheitsdetails werden niemals aufgenommen.",
    internal: "Interne Notizen stehen in diesem Composer nicht zur Auswahl.",
    includePrivate: "Private Trainernotizen aufnehmen",
    generalNotes: "Allgemeine Notizen",
    trainingNotes: "Trainingsnotizen",
    trial: "Probespieler",
    roster: "Kaderspieler",
    noPosition: "Keine Position erfasst"
  }
} as const;

export function PlayerConversationReport(props: PlayerConversationReportProps) {
  const { summary, development, locale, sections } = props;
  const text = copy[locale];
  const range = reportRangeFromRecords(summary.records, props.customFrom, props.customTo);
  const medical = relevantMedicalPeriods(props.medicalPeriods, range);
  const availability = relevantAvailabilityPeriods(props.availabilityPeriods, range);
  const conversationNotes = selectableConversationNotes(props.notes, range);
  const internalNotes = playerNotesInRange(props.notes, range);
  const eligibleNotes = props.mode === "internal_coach_report" ? internalNotes : conversationNotes;
  const selectedNotes = props.mode === "internal_coach_report"
    ? internalNotes.filter((note) => !props.configured || props.selectedNoteIds.includes(note.id))
    : selectedConversationNotes(props.notes, props.selectedNoteIds, range);
  const observations = development.observations.filter((item) => dateInRange(item.observationDate, range));
  const selectedObservationSet = new Set(props.selectedObservationIds);
  const selectedObservations = observations.filter((item) => selectedObservationSet.has(item.id));
  const missed = summary.records.filter(isMissedTraining);
  const absences = absenceDistribution(summary.records);
  const trainingNotes = summary.records.filter((record) => record.coachNote && (!record.sensitiveNote || props.includePrivateTrainingNotes));
  const fullName = playerFullName(summary.player);
  const periodLabel = range.from || range.to
    ? `${range.from ? formatDate(range.from, locale) : "..."} – ${range.to ? formatDate(range.to, locale) : "..."}`
    : summary.records.length ? "" : locale === "de" ? "Keine Trainingsdaten" : "No Training data";

  return (
    <main className="mx-auto max-w-5xl bg-white px-4 py-6 text-slate-900 print:max-w-none print:px-0 print:py-0">
      <style>{`@page { size: A4; margin: 14mm; } @media print { body { background: white !important; } .print-page { box-shadow: none !important; border: 0 !important; } .print-avoid-break { break-inside: avoid; page-break-inside: avoid; } }`}</style>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/squad/players/${props.playerId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy"><ArrowLeft className="h-4 w-4" />{text.back}</Link>
        <PrintButton />
      </div>

      <ReportComposer {...props} eligibleNotes={eligibleNotes} observations={observations} />

      <article className="print-page mt-5 rounded-lg border border-board-line bg-white p-6 shadow-soft print:mt-0 print:p-0">
        <header className="border-b border-board-line pb-5">
          <p className="text-xs font-bold uppercase tracking-wide text-board-green">CoachBoard · {props.mode === "internal_coach_report" ? text.internalReport : text.report}</p>
          <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div><h1 translate="no" className="text-3xl font-bold text-board-navy">{fullName}</h1><p className="mt-2 text-sm text-slate-600">{summary.player.position || text.noPosition} · {summary.player.playerType === "trial" ? text.trial : text.roster}</p></div>
            <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700"><p><strong>{text.generated}:</strong> {formatDate(new Date(), locale)}</p><p><strong>{text.reviewPeriod}:</strong> {periodLabel}</p></div>
          </div>
        </header>

        <section className="print-avoid-break mt-6"><h2 className="text-lg font-bold text-board-navy">1. {text.playerCard}</h2><div className="mt-3 grid gap-3 sm:grid-cols-2"><Stat label={text.relevantTrainings} value={String(summary.trainings)} /><Stat label={text.participated} value={String(summary.attended)} /></div></section>
        <section className="print-avoid-break mt-6"><h2 className="text-lg font-bold text-board-navy">2. {text.reviewPeriod}</h2><p className="mt-2 text-sm font-semibold text-slate-700">{periodLabel || "-"}</p></section>

        {sections.attendance ? <AttendanceSection summary={summary} missed={missed} absences={absences} locale={locale} showReasons={sections.absenceReasons} /> : null}
        {sections.availability ? <AvailabilitySection medical={medical} availability={availability} locale={locale} /> : null}
        {sections.performance ? <PerformanceSection summary={summary} locale={locale} /> : null}

        <section className="print-avoid-break mt-6 grid gap-5 md:grid-cols-2">
          <ReportSection title={`5. ${text.strengths}`}><p className="text-sm text-slate-700">{summary.highestRatedArea ? `${summary.highestRatedArea.label}: ${formatRating(summary.highestRatedArea.average, locale)}` : summary.assessment?.reason || "-"}</p></ReportSection>
          <ReportSection title={`6. ${text.developmentFocus}`}><p className="text-sm text-slate-700">{summary.player.workOn || summary.player.developmentGoal || text.noFocus}</p></ReportSection>
        </section>

        {sections.developmentGoals ? <ReportSection title={`7. ${text.goals}`}>
          <div className="space-y-3">{development.goals.length ? development.goals.map((goal) => <article key={goal.id} className="print-avoid-break rounded-md border border-board-line p-3"><p className="font-bold text-board-navy">{goal.title}</p><p className="mt-1 text-sm text-slate-600">{goal.successCriteria}</p>{goal.reviewDate ? <p className="mt-2 text-xs font-bold text-slate-500">{text.nextReview}: {formatDate(goal.reviewDate, locale)}</p> : null}</article>) : <p className="text-sm text-slate-600">{text.noGoals}</p>}</div>
        </ReportSection> : null}

        {sections.observations && selectedObservations.length ? <ReportSection title={`8. ${text.observations}`}><SelectedTextItems items={selectedObservations.map((item) => ({ id: item.id, date: item.observationDate, text: item.note }))} locale={locale} /></ReportSection> : null}
        {sections.playerNotes && selectedNotes.length ? <ReportSection title={props.mode === "internal_coach_report" ? text.generalNotes : text.notes}><SelectedTextItems items={selectedNotes.map((item) => ({ id: item.id, date: item.noteDate, text: item.note }))} locale={locale} /></ReportSection> : null}
        {props.mode === "internal_coach_report" && trainingNotes.length ? <ReportSection title={text.trainingNotes}><SelectedTextItems items={trainingNotes.map((item) => ({ id: item.id, date: item.event?.date ?? item.createdAt.slice(0, 10), text: item.coachNote ?? "" }))} locale={locale} /></ReportSection> : null}

        <section className="print-avoid-break mt-6 rounded-md bg-slate-50 p-4 text-xs text-slate-600"><p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-board-green" />{text.privacy}</p></section>
      </article>
    </main>
  );
}

function ReportComposer(props: PlayerConversationReportProps & { eligibleNotes: PlayerNote[]; observations: PlayerDevelopmentProfile["observations"] }) {
  const text = copy[props.locale];
  return <form method="get" action={`/squad/players/${props.playerId}/report`} className="rounded-lg border border-board-line bg-board-paper p-4 print:hidden">
    <input type="hidden" name="configured" value="1" /><input type="hidden" name="period" value={props.period} />
    {props.customFrom ? <input type="hidden" name="from" value={props.customFrom} /> : null}{props.customTo ? <input type="hidden" name="to" value={props.customTo} /> : null}
    <div className="flex items-start gap-3"><FileText className="mt-0.5 h-5 w-5 text-board-green" /><div><h2 className="font-bold text-board-navy">{text.composer}</h2><p className="mt-1 text-sm text-slate-600">{text.composerHelp}</p></div></div>
    <label className="mt-4 block max-w-xs text-xs font-bold text-slate-600">{text.reportMode}<select name="mode" defaultValue={props.mode} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm text-board-navy"><option value="player_conversation">{text.report}</option><option value="internal_coach_report">{text.internalReport}</option></select></label>
    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Toggle name="attendance" label={text.attendance} checked={props.sections.attendance} />
      <Toggle name="absenceReasons" label={text.absenceReasons} checked={props.sections.absenceReasons} />
      <Toggle name="availability" label={text.availability} checked={props.sections.availability} />
      <Toggle name="performance" label={text.performance} checked={props.sections.performance} />
      <Toggle name="developmentGoals" label={text.goals} checked={props.sections.developmentGoals} />
      <Toggle name="observations" label={text.observations} checked={props.sections.observations} />
      <Toggle name="playerNotes" label={text.notes} checked={props.sections.playerNotes} />
      {props.mode === "internal_coach_report" ? <Toggle name="includePrivateTrainingNotes" label={text.includePrivate} checked={props.includePrivateTrainingNotes} /> : null}
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <SelectionGroup title={text.suitableObservations}>{props.observations.length ? props.observations.map((item) => <Choice key={item.id} name="observation" value={item.id} checked={props.selectedObservationIds.includes(item.id)} label={`${formatDate(item.observationDate, props.locale)} · ${item.note}`} />) : <p className="text-sm text-slate-500">{text.noObservations}</p>}</SelectionGroup>
      <SelectionGroup title={props.mode === "internal_coach_report" ? text.generalNotes : text.suitableNotes}>{props.eligibleNotes.length ? props.eligibleNotes.map((note) => <Choice key={note.id} name="note" value={note.id} checked={props.mode === "internal_coach_report" ? !props.configured || props.selectedNoteIds.includes(note.id) : props.selectedNoteIds.includes(note.id)} label={`${formatDate(note.noteDate, props.locale)} · ${note.note}`} />) : <p className="text-sm text-slate-500">{text.noSuitableNotes}</p>}{props.mode === "player_conversation" ? <p className="mt-2 text-xs text-slate-500">{text.internal}</p> : null}</SelectionGroup>
    </div>
    <Button type="submit" className="mt-4">{text.update}</Button>
  </form>;
}

function AttendanceSection({ summary, missed, absences, locale, showReasons }: { summary: PlayerAnalyticsSummary; missed: PlayerAnalyticsSummary["records"]; absences: ReturnType<typeof absenceDistribution>; locale: Locale; showReasons: boolean }) {
  const text = copy[locale];
  return <ReportSection title={`3. ${text.attendance}`}>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Stat label={text.participated} value={`${summary.attended}/${summary.trainings}`} /><Stat label={text.participationRate} value={formatPercent(summary.participationRate, locale)} /><Stat label={text.attendanceExpected} value={formatPercent(summary.attendanceWhenExpectedRate, locale)} /><Stat label={text.late} value={String(summary.late)} /><Stat label={text.missed} value={String(missed.length)} /></div>
    {showReasons ? <><h3 className="mt-4 text-sm font-bold text-board-navy">{text.absenceSummary}</h3><div className="mt-2 flex flex-wrap gap-2">{absences.length ? absences.map((item) => <span key={item.reason} className="rounded-md bg-slate-100 px-2.5 py-1 text-sm font-semibold text-slate-700">{absenceReasonLabel(item.reason, locale)}: {item.count}</span>) : <span className="text-sm text-slate-600">{text.noAbsences}</span>}</div>{missed.length ? <details className="mt-4 print:block" open><summary className="cursor-pointer text-sm font-bold text-board-navy">{text.absenceHistory}</summary><div className="mt-2 space-y-2">{missed.map((record) => <div key={record.id} className="print-avoid-break flex flex-wrap justify-between gap-2 rounded-md border border-board-line p-3 text-sm"><span>{record.event ? `${formatDate(record.event.date, locale)} · ${record.event.label || "Training"}` : "Training"}</span><span className="font-bold text-slate-700">{finalStatusLabel(record.finalStatus, locale)} · {absenceReasonLabel(absenceReason(record), locale)}</span></div>)}</div></details> : null}</> : null}
  </ReportSection>;
}

function AvailabilitySection({ medical, availability, locale }: { medical: PlayerMedicalPeriod[]; availability: PlayerAvailabilityPeriod[]; locale: Locale }) {
  const text = copy[locale];
  const medicalLabels = locale === "de" ? { injured: "Verletzt", sick: "Krank" } : { injured: "Injured", sick: "Sick" };
  return <ReportSection title={text.availability}>
    {medical.length || availability.length ? <div className="grid gap-3 md:grid-cols-2">{medical.map((period) => <article key={period.id} className="print-avoid-break rounded-md border border-board-line p-3"><p className="text-xs font-bold uppercase text-slate-500">{medicalLabels[period.type]}</p><p translate="no" className="mt-1 font-bold text-board-navy">{period.description}</p><p className="mt-2 text-sm text-slate-600">{formatDate(period.startDate, locale)} – {period.actualReturnDate || period.endDate ? formatDate(period.actualReturnDate ?? period.endDate, locale) : text.current}</p>{period.expectedReturnDate ? <p className="mt-1 text-xs font-semibold text-slate-500">{text.expectedReturn}: {formatDate(period.expectedReturnDate, locale)}</p> : null}{period.actualReturnDate ? <p className="mt-1 text-xs font-semibold text-green-700">{text.returned}: {formatDate(period.actualReturnDate, locale)}</p> : null}<p className="mt-1 text-xs font-semibold text-slate-500">{period.status === "completed" ? text.completed : text.current}</p></article>)}{availability.map((period) => <article key={period.id} className="print-avoid-break rounded-md border border-board-line p-3"><p className="font-bold text-board-navy">{absenceReasonLabel(period.reason, locale)}</p><p className="mt-2 text-sm text-slate-600">{formatDate(period.startsOn, locale)} – {period.endsOn ? formatDate(period.endsOn, locale) : text.current}</p></article>)}</div> : <p className="text-sm text-slate-600">{text.noAvailability}</p>}
  </ReportSection>;
}

function PerformanceSection({ summary, locale }: { summary: PlayerAnalyticsSummary; locale: Locale }) {
  const text = copy[locale];
  return <ReportSection title={`4. ${text.performance}`}><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label={text.average} value={formatRating(summary.averageRating, locale)} /><Stat label={text.rated} value={String(summary.rated)} /><Stat label={text.trend} value={summary.trend.value === null ? summary.trend.label : `${summary.trend.value > 0 ? "+" : ""}${summary.trend.value.toFixed(1)}`} /><Stat label={text.evidence} value={summary.evidenceBase.label} /></div><h3 className="mt-4 text-sm font-bold text-board-navy">{text.categories}</h3><div className="mt-2 grid gap-2 sm:grid-cols-2">{summary.categorySummaries.map((category) => <p key={category.key} className="flex justify-between rounded-md bg-slate-50 p-3 text-sm"><span>{category.label}</span><strong>{formatRating(category.average, locale)}</strong></p>)}</div></ReportSection>;
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="print-avoid-break mt-6"><h2 className="text-lg font-bold text-board-navy">{title}</h2><div className="mt-3">{children}</div></section>; }
function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-md bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-board-navy">{value}</p></div>; }
function Toggle({ name, label, checked }: { name: string; label: string; checked: boolean }) { return <label className="flex min-h-10 items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-700"><input type="checkbox" name={name} value="1" defaultChecked={checked} className="h-4 w-4 accent-board-green" />{label}</label>; }
function Choice({ name, value, label, checked }: { name: string; value: string; label: string; checked: boolean }) { return <label className="flex items-start gap-2 rounded-md bg-white p-2 text-sm text-slate-700"><input type="checkbox" name={name} value={value} defaultChecked={checked} className="mt-0.5 h-4 w-4 shrink-0 accent-board-green" /><span translate="no" className="line-clamp-3 break-words">{label}</span></label>; }
function SelectionGroup({ title, children }: { title: string; children: React.ReactNode }) { return <fieldset className="rounded-md border border-board-line bg-slate-50 p-3"><legend className="px-1 text-sm font-bold text-board-navy">{title}</legend><div className="max-h-56 space-y-2 overflow-y-auto">{children}</div></fieldset>; }
function SelectedTextItems({ items, locale }: { items: Array<{ id: string; date: string; text: string }>; locale: Locale }) { return <div className="space-y-2">{items.map((item) => <article key={item.id} className="print-avoid-break rounded-md border border-board-line p-3"><p className="text-xs font-bold text-slate-500">{formatDate(item.date, locale)}</p><p translate="no" className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{item.text}</p></article>)}</div>; }
function dateInRange(date: string, range: { from?: string; to?: string }) { return (!range.from || date >= range.from) && (!range.to || date <= range.to); }
