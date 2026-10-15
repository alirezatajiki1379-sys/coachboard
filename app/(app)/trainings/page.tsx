import { redirect } from "next/navigation";
import { CalendarPlus, ChevronDown } from "lucide-react";
import { PageContainer, PageHeader, PageTabs } from "@/components/layout/page";
import { ButtonLink } from "@/components/ui/button";
import { TrainingBulkManager, type TrainingCalendarSection } from "@/components/squad/training-bulk-manager";
import { createClient } from "@/lib/supabase/server";
import { listTrainingEventDetails } from "@/lib/squad/attendance-queries";
import { listTrainingSessionReviewSummaries } from "@/lib/squad/session-review";
import { listConcreteTrainingPlanEventIds } from "@/lib/squad/training-plan-queries";
import { ensureActiveSquad } from "@/lib/squad/squads";
import {
  calendarEventsForLegacyView,
  calendarFollowUpTrainings,
  calendarOperationalTrainings,
  groupCalendarUpcoming,
  parseTrainingCalendarView,
  type TrainingCalendarGroups,
  type TrainingCalendarView
} from "@/lib/trainings/calendar";
import { getTrainingWorkflowState, type TrainingWorkflowState } from "@/lib/trainings/workflow";
import { trainingDateTimeKey, trainingNowParts } from "@/lib/trainings/utils";
import { getUserLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n";
import type { SquadTrainingEventDetail } from "@/types/domain";

type TrainingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TrainingsPage({ searchParams }: TrainingsPageProps) {
  const params = await searchParams;
  const view = parseTrainingCalendarView(params.view);
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [locale, activeTeam] = await Promise.all([
    getUserLocale(supabase, user.id),
    ensureActiveSquad(supabase, user.id)
  ]);
  const copy = trainingsCopy[locale];
  const now = trainingNowParts();
  const events = await listTrainingEventDetails(supabase, user.id, {
    squadId: activeTeam.id,
    ...(view === "trash" ? { eventFilter: "trash" as const } : { includeDeleted: false })
  });

  let workflowByEventId: Record<string, TrainingWorkflowState> = {};
  if (view !== "trash") {
    const eventIds = events.map((event) => event.id);
    const [reviewSummaries, concretePlanEventIds] = await Promise.all([
      listTrainingSessionReviewSummaries(supabase, user.id, eventIds),
      listConcreteTrainingPlanEventIds(supabase, user.id, eventIds)
    ]);
    workflowByEventId = Object.fromEntries(events.map((event) => [
      event.id,
      getTrainingWorkflowState({
        event,
        hasPlan: concretePlanEventIds.has(event.id),
        hasReview: reviewSummaries.has(event.id),
        now
      })
    ]));
  }

  const presentation = buildCalendarPresentation(events, workflowByEventId, view, now, locale);
  const visibleView = primaryViews.some((item) => item.id === view) ? view : undefined;

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        metadata={<span translate="no">{activeTeam.name}</span>}
        actions={(
          <ButtonLink href="/trainings/new" className="justify-center">
            <CalendarPlus className="h-4 w-4" />
            {copy.create}
          </ButtonLink>
        )}
      />

      <div className="space-y-2">
        <PageTabs label={copy.filtersLabel}>
          {primaryViews.map((item) => (
            <ButtonLink
              key={item.id}
              href={item.id === "current" ? "/trainings" : `/trainings?view=${item.id}`}
              variant={visibleView === item.id ? "primary" : "ghost"}
              className="h-9 shrink-0 justify-center px-3"
            >
              {copy.views[item.id]}
            </ButtonLink>
          ))}
        </PageTabs>
        <details className="relative w-fit max-w-full">
          <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-md px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-board-navy">
            {copy.moreFilters}
            <ChevronDown className="h-4 w-4" />
          </summary>
          <div className="absolute left-0 top-10 z-30 flex min-w-48 flex-col gap-1 rounded-lg border border-board-line bg-white p-2 shadow-xl">
            {secondaryViews.map((item) => (
              <ButtonLink key={item.id} href={`/trainings?view=${item.id}`} variant={view === item.id ? "primary" : "ghost"} className="h-9 justify-start px-3">
                {copy.views[item.id]}
              </ButtonLink>
            ))}
          </div>
        </details>
      </div>

      <TrainingBulkManager
        key={`${activeTeam.id}:${view}`}
        initialEvents={presentation.events}
        sections={presentation.sections}
        workflowByEventId={workflowByEventId}
        emptyMessage={copy.empty[view]}
        activeTeamId={activeTeam.id}
        activeTeamName={activeTeam.name}
        filterLabel={copy.views[view]}
        isTrash={view === "trash"}
        locale={locale}
      />
    </PageContainer>
  );
}

type CalendarPresentation = {
  events: SquadTrainingEventDetail[];
  sections: TrainingCalendarSection[];
};

function buildCalendarPresentation(
  events: SquadTrainingEventDetail[],
  workflowByEventId: Record<string, TrainingWorkflowState>,
  view: TrainingCalendarView,
  now: ReturnType<typeof trainingNowParts>,
  locale: Locale
): CalendarPresentation {
  const copy = trainingsCopy[locale];
  if (view === "trash") {
    const trashed = [...events].sort((a, b) => trainingDateTimeKey(b).localeCompare(trainingDateTimeKey(a)));
    return singleSection(trashed, "trash", copy.views.trash);
  }

  const followUp = calendarFollowUpTrainings(events, workflowByEventId, now);
  if (view === "follow_up") return singleSection(followUp, "follow-up", copy.followUp);

  if (view === "current") {
    const operational = calendarOperationalTrainings(events, workflowByEventId);
    const groups = groupCalendarUpcoming(operational, now);
    const sections: TrainingCalendarSection[] = [];
    if (followUp.length) {
      sections.push({
        id: "follow-up",
        label: "",
        groupLabel: copy.followUp,
        eventIds: followUp.slice(0, 4).map((event) => event.id),
        ...(followUp.length > 4 ? { moreHref: "/trainings?view=follow_up", moreLabel: copy.viewAllFollowUp } : {})
      });
    }
    sections.push(...upcomingSections(groups, copy, true));
    return presentationFromSections(events, sections);
  }

  if (view === "upcoming") {
    const upcoming = calendarEventsForLegacyView(events, "upcoming", now);
    return presentationFromSections(upcoming, upcomingSections(groupCalendarUpcoming(upcoming, now), copy, false));
  }

  const filtered = calendarEventsForLegacyView(events, view, now);
  return singleSection(filtered, view, copy.views[view]);
}

function upcomingSections(groups: TrainingCalendarGroups, copy: (typeof trainingsCopy)[Locale], limited: boolean): TrainingCalendarSection[] {
  const entries = [
    { id: "today", label: copy.today, events: groups.today },
    { id: "next-seven-days", label: copy.nextSevenDays, events: limited ? groups.nextSevenDays.slice(0, 6) : groups.nextSevenDays },
    { id: "later", label: copy.later, events: limited ? groups.later.slice(0, 3) : groups.later }
  ].filter((entry) => entry.events.length);
  const truncated = limited && (groups.nextSevenDays.length > 6 || groups.later.length > 3);
  return entries.map((entry, index) => ({
    id: entry.id,
    label: entry.label,
    groupLabel: index === 0 ? copy.upcomingTrainings : undefined,
    eventIds: entry.events.map((event) => event.id),
    ...(index === 0 && truncated ? { moreHref: "/trainings?view=upcoming", moreLabel: copy.viewAllUpcoming } : {})
  }));
}

function presentationFromSections(allEvents: SquadTrainingEventDetail[], sections: TrainingCalendarSection[]): CalendarPresentation {
  const selectedIds = new Set(sections.flatMap((section) => section.eventIds));
  return { events: allEvents.filter((event) => selectedIds.has(event.id)), sections };
}

function singleSection(events: SquadTrainingEventDetail[], id: string, label: string): CalendarPresentation {
  return { events, sections: events.length ? [{ id, label, eventIds: events.map((event) => event.id) }] : [] };
}

const primaryViews = [
  { id: "current" },
  { id: "upcoming" },
  { id: "past" },
  { id: "trash" }
] as const satisfies ReadonlyArray<{ id: TrainingCalendarView }>;

const secondaryViews = [
  { id: "follow_up" },
  { id: "completed" },
  { id: "draft" },
  { id: "all" }
] as const satisfies ReadonlyArray<{ id: TrainingCalendarView }>;

const trainingsCopy = {
  en: {
    eyebrow: "Trainings",
    title: "Training calendar",
    description: "See what is next, finish meaningful follow-up, and open the right coaching action.",
    create: "Create training",
    filtersLabel: "Training filters",
    moreFilters: "More filters",
    followUp: "Follow-up",
    upcomingTrainings: "Upcoming Trainings",
    today: "Today",
    nextSevenDays: "Next 7 days",
    later: "Later",
    viewAllFollowUp: "View all follow-up",
    viewAllUpcoming: "View all upcoming Trainings",
    views: {
      current: "Current",
      upcoming: "Upcoming",
      past: "Past",
      trash: "Trash",
      follow_up: "Follow-up",
      completed: "Completed",
      draft: "Draft",
      all: "All"
    },
    empty: {
      current: "No training is planned yet.",
      upcoming: "No upcoming Trainings.",
      past: "No past Trainings yet.",
      trash: "Trash is empty.",
      follow_up: "No Training needs follow-up.",
      completed: "No completed Trainings yet.",
      draft: "No draft Trainings.",
      all: "No Trainings found."
    }
  },
  de: {
    eyebrow: "Trainingseinheiten",
    title: "Trainingskalender",
    description: "Sieh, was als Nächstes ansteht, erledige sinnvolle Nachbereitung und öffne direkt die richtige Traineraktion.",
    create: "Training erstellen",
    filtersLabel: "Trainingsfilter",
    moreFilters: "Weitere Filter",
    followUp: "Nachbereitung",
    upcomingTrainings: "Anstehende Trainings",
    today: "Heute",
    nextSevenDays: "Nächste 7 Tage",
    later: "Später",
    viewAllFollowUp: "Alle Nachbereitungen anzeigen",
    viewAllUpcoming: "Alle anstehenden Trainings anzeigen",
    views: {
      current: "Aktuell",
      upcoming: "Anstehend",
      past: "Vergangen",
      trash: "Papierkorb",
      follow_up: "Nachbereitung",
      completed: "Abgeschlossen",
      draft: "Entwurf",
      all: "Alle"
    },
    empty: {
      current: "Noch kein Training geplant.",
      upcoming: "Keine anstehenden Trainingseinheiten.",
      past: "Noch keine vergangenen Trainingseinheiten.",
      trash: "Papierkorb ist leer.",
      follow_up: "Keine Nachbereitung offen.",
      completed: "Noch keine abgeschlossenen Trainingseinheiten.",
      draft: "Keine Trainingsentwürfe.",
      all: "Keine Trainingseinheiten gefunden."
    }
  }
} as const;
