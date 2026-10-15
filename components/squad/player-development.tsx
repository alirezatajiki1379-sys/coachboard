import type { ReactNode } from "react";
import { getActiveLocale } from "@/lib/i18n/server";
import { createSystemTranslator } from "@/lib/i18n/system-text";
import { CalendarDays, ClipboardCheck, Eye, Plus, Target } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  developmentCategoryLabel,
  developmentGoalCategories,
  developmentGoalPriorities,
  developmentGoalStatuses,
  developmentPriorityLabel,
  developmentProgressLabel,
  developmentProgressOptions,
  developmentStatusLabel
} from "@/config/development";
import {
  createDevelopmentGoal,
  createDevelopmentProgressUpdate,
  createGoalAction,
  createPlayerObservation,
  updateDevelopmentGoal,
  updateGoalActionCompletion
} from "@/lib/squad/development-actions";
import {
  activeDevelopmentGoals,
  isDevelopmentReviewDue,
  latestObservationForGoal,
  latestProgressForGoal,
  nextIncompleteGoalAction,
  type PlayerDevelopmentProfile
} from "@/lib/squad/development";
import { formatEventDate } from "@/lib/squad/attendance-format";
import type { PlayerDevelopmentGoal } from "@/types/domain";

export async function PlayerDevelopmentSection({ playerId, development }: { playerId: string; development: PlayerDevelopmentProfile }) {
  const locale = await getActiveLocale();
  const ui = createSystemTranslator(locale);
  const activeGoals = activeDevelopmentGoals(development.goals);
  const visibleGoals = activeGoals.slice(0, 3);
  const additionalGoals = activeGoals.slice(3);
  const historicalGoals = development.goals.filter((goal) => !activeGoals.some((active) => active.id === goal.id));
  const dueCount = activeGoals.filter((goal) => isDevelopmentReviewDue(goal)).length;
  const entirelyEmpty = development.goals.length === 0 && development.observations.length === 0;

  return (
    <section translate="no" className="min-w-0 rounded-lg border border-board-line bg-white p-4 shadow-soft sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold text-board-navy"><Target className="h-5 w-5 shrink-0" />{ui("Player development")}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-600">{ui("Keep one current focus when useful and add short observations from Training or matches.")}</p>
        </div>
        <ButtonLink href="/squad/development" variant="secondary" className="h-9 shrink-0 px-3">{ui("Development overview")}</ButtonLink>
      </div>

      {entirelyEmpty ? (
        <div className="mt-5 rounded-md border border-dashed border-board-line bg-board-paper p-5">
          <h3 className="font-bold text-board-navy">{ui("No development focus yet")}</h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{ui("Use development only when it helps your coaching. Nothing here is required.")}</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <details className="rounded-md border border-board-line bg-white px-3 py-2 open:w-full">
              <summary className="cursor-pointer text-sm font-bold text-board-green">{ui("Add development goal")}</summary>
              <DevelopmentGoalForm playerId={playerId} />
            </details>
            <details className="rounded-md border border-board-line bg-white px-3 py-2 open:w-full">
              <summary className="cursor-pointer text-sm font-bold text-board-navy">{ui("Add observation")}</summary>
              <ObservationForm playerId={playerId} goals={[]} compact />
            </details>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-bold text-board-navy">{ui("Current development")}</h3>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                {activeGoals.length > 1 ? <span className="rounded-md bg-slate-100 px-2.5 py-1 text-slate-700">{ui("{count} active goals", { count: activeGoals.length })}</span> : null}
                {dueCount ? <span className="rounded-md bg-amber-50 px-2.5 py-1 text-amber-800">{ui(dueCount === 1 ? "Review due" : "{count} reviews due", { count: dueCount })}</span> : null}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <details className="rounded-md bg-board-paper px-3 py-2 open:w-full sm:open:min-w-[32rem]"><summary className="cursor-pointer text-sm font-bold text-board-navy">{ui("Add development goal")}</summary><DevelopmentGoalForm playerId={playerId} /></details>
              <details className="rounded-md bg-board-paper px-3 py-2 open:w-full sm:open:min-w-[28rem]"><summary className="cursor-pointer text-sm font-bold text-board-navy">{ui("Add observation")}</summary><ObservationForm playerId={playerId} goals={activeGoals} compact /></details>
            </div>
          </div>

          {visibleGoals.length ? <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-2">{visibleGoals.map((goal) => <DevelopmentGoalCard key={goal.id} goal={goal} playerId={playerId} />)}</div> : (
            <div className="mt-4 rounded-md border border-dashed border-board-line p-4"><p className="font-bold text-board-navy">{ui("No active development goal")}</p><p className="mt-1 text-sm text-slate-600">{ui("Past goals and observations remain available below.")}</p></div>
          )}

          {additionalGoals.length ? <details className="mt-4 rounded-md border border-board-line bg-board-paper p-3"><summary className="cursor-pointer text-sm font-bold text-board-navy">{ui(additionalGoals.length === 1 ? "+{count} more goal" : "+{count} more goals", { count: additionalGoals.length })}</summary><div className="mt-3 grid gap-4 xl:grid-cols-2">{additionalGoals.map((goal) => <DevelopmentGoalCard key={goal.id} goal={goal} playerId={playerId} />)}</div></details> : null}
          {historicalGoals.length ? <details className="mt-4 rounded-md border border-board-line p-3"><summary className="cursor-pointer text-sm font-bold text-board-navy">{ui("Past goals")} · {historicalGoals.length}</summary><div className="mt-3 grid gap-4 xl:grid-cols-2">{historicalGoals.map((goal) => <DevelopmentGoalCard key={goal.id} goal={goal} playerId={playerId} historical />)}</div></details> : null}
        </>
      )}

      {development.timeline.length ? <div className="mt-6"><DevelopmentTimeline development={development} /></div> : null}
    </section>
  );
}

export async function ObservationForm({ playerId, goals, eventId, returnTo, compact, defaultGoalId }: { playerId: string; goals: PlayerDevelopmentGoal[]; eventId?: string; returnTo?: string; compact?: boolean; defaultGoalId?: string }) {
  const locale = await getActiveLocale();
  const ui = createSystemTranslator(locale);
  return (
    <form action={createPlayerObservation} className={compact ? "mt-3 grid min-w-0 gap-3" : "grid min-w-0 gap-3"}>
      <input type="hidden" name="playerId" value={playerId} />
      {eventId ? <input type="hidden" name="eventId" value={eventId} /> : null}
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <label className="block min-w-0"><span className="text-xs font-bold uppercase text-slate-500">{ui("Observation")}</span><textarea name="note" required rows={compact ? 2 : 3} placeholder={ui("What did you notice?")} className="mt-1 w-full resize-y rounded-md border border-board-line bg-white px-3 py-2 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" /></label>
      {goals.length ? <label className="block min-w-0"><span className="text-xs font-bold uppercase text-slate-500">{ui("Optional development goal")}</span><select name="goalId" defaultValue={defaultGoalId ?? ""} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"><option value="">{ui("No linked goal")}</option>{goals.map((goal) => <option translate="no" key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label> : null}
      <details className="rounded-md bg-slate-50 p-3"><summary className="cursor-pointer text-xs font-bold uppercase text-slate-600">{ui("More options")}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><label><span className="text-xs font-bold uppercase text-slate-500">{ui("Date")}</span><input name="observationDate" type="date" defaultValue={today()} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" /></label><label><span className="text-xs font-bold uppercase text-slate-500">{ui("Category")}</span><select name="category" className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"><option value="">{ui("Optional")}</option>{developmentGoalCategories.map((category) => <option key={category.value} value={category.value}>{developmentCategoryLabel(category.value, locale)}</option>)}</select></label></div></details>
      <Button type="submit" variant="secondary" className="h-10 w-full px-3 sm:w-fit"><Plus className="h-4 w-4" />{ui("Save observation")}</Button>
    </form>
  );
}

async function DevelopmentGoalForm({ playerId }: { playerId: string }) {
  const ui = createSystemTranslator(await getActiveLocale());
  return (
    <form action={createDevelopmentGoal} className="mt-4 grid min-w-0 gap-3">
      <input type="hidden" name="playerId" value={playerId} />
      <label><span className="text-xs font-bold uppercase text-slate-500">{ui("Development focus")}</span><input name="title" required maxLength={120} placeholder={ui("What are we working on?")} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" /></label>
      <label><span className="text-xs font-bold uppercase text-slate-500">{ui("What will improvement look like?")}</span><textarea name="successCriteria" required rows={2} placeholder={ui("Describe one observable improvement.")} className="mt-1 w-full rounded-md border border-board-line bg-white px-3 py-2 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" /></label>
      <label className="max-w-sm"><span className="text-xs font-bold uppercase text-slate-500">{ui("Review date (optional)")}</span><input name="reviewDate" type="date" className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" /></label>
      <details className="rounded-md bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-bold text-board-navy">{ui("More options")}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><SelectField name="category" label={ui("Category")} options={developmentGoalCategories} defaultValue="other" /><SelectField name="priority" label={ui("Priority")} options={developmentGoalPriorities} defaultValue="medium" /><SelectField name="status" label={ui("Status")} options={developmentGoalStatuses} defaultValue="in_progress" /><SelectField name="progress" label={ui("Progress")} options={developmentProgressOptions} defaultValue="developing" /><label><span className="text-xs font-bold uppercase text-slate-500">{ui("Start date")}</span><input name="startDate" type="date" defaultValue={today()} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm" /></label><label className="sm:col-span-2"><span className="text-xs font-bold uppercase text-slate-500">{ui("Coach notes")}</span><textarea name="coachNotes" rows={2} placeholder={ui("Optional private coaching context")} className="mt-1 w-full rounded-md border border-board-line bg-white px-3 py-2 text-sm" /></label></div></details>
      <Button type="submit" className="w-full sm:w-fit">{ui("Create goal")}</Button>
    </form>
  );
}

async function DevelopmentGoalCard({ goal, playerId, historical = false }: { goal: PlayerDevelopmentGoal; playerId: string; historical?: boolean }) {
  const locale = await getActiveLocale();
  const ui = createSystemTranslator(locale);
  const latestProgress = latestProgressForGoal(goal);
  const latestObservation = latestObservationForGoal(goal);
  const nextAction = nextIncompleteGoalAction(goal);
  const reviewDue = isDevelopmentReviewDue(goal);
  const displayedProgress = latestProgress?.progressLevel ?? goal.progress;
  return (
    <article className="min-w-0 rounded-md border border-board-line bg-white p-4">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h3 translate="no" className="break-words text-lg font-bold leading-tight text-board-navy [overflow-wrap:anywhere]">{goal.title}</h3><div className="mt-2 flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-full bg-green-50 px-2 py-1 text-green-800">{developmentProgressLabel(displayedProgress, locale)}</span>{goal.priority === "high" ? <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-800">{developmentPriorityLabel(goal.priority, locale)}</span> : null}{historical ? <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{developmentStatusLabel(goal.status, locale)}</span> : null}{reviewDue ? <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-800">{ui("Review due")}</span> : null}</div></div>{goal.reviewDate ? <p className="shrink-0 text-xs font-semibold text-slate-500">{ui("Next review")}: <span className="text-board-navy">{formatEventDate(goal.reviewDate, locale)}</span></p> : null}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><FocusItem label={ui("Next step")} icon={<ClipboardCheck className="h-4 w-4" />} empty={ui("Set next step")}>{nextAction ? <><span translate="no">{nextAction.description}</span>{nextAction.dueDate ? <span className="mt-1 block text-xs text-slate-500">{ui("Due")} {formatEventDate(nextAction.dueDate, locale)}</span> : null}</> : null}</FocusItem><FocusItem label={ui("Latest observation")} icon={<Eye className="h-4 w-4" />} empty={ui("No observation yet")}>{latestObservation ? <><span className="text-xs text-slate-500">{formatEventDate(latestObservation.observationDate, locale)} · </span><span translate="no">{latestObservation.note}</span></> : null}</FocusItem></div>
      {!historical ? <div className="mt-4 grid gap-2 sm:grid-cols-3"><details className="rounded-md bg-board-paper px-3 py-2 open:sm:col-span-3"><summary className="cursor-pointer text-sm font-bold text-board-navy">{ui("Add observation")}</summary><ObservationForm playerId={playerId} goals={[goal]} defaultGoalId={goal.id} compact /></details><details className="rounded-md bg-board-paper px-3 py-2 open:sm:col-span-3"><summary className="cursor-pointer text-sm font-bold text-board-navy">{ui("Update progress")}</summary><ProgressUpdateForm goal={goal} /></details><details className="rounded-md bg-board-paper px-3 py-2 open:sm:col-span-3"><summary className="cursor-pointer text-sm font-bold text-board-navy">{nextAction ? ui("Manage next steps") : ui("Set next step")}</summary><GoalActionForm goalId={goal.id} /></details></div> : null}
      <details className="mt-3 rounded-md border border-board-line p-3"><summary className="cursor-pointer text-sm font-bold text-board-navy">{ui("Details")}</summary><GoalDetails goal={goal} playerId={playerId} /></details>
    </article>
  );
}

function FocusItem({ label, icon, empty, children }: { label: string; icon: ReactNode; empty: string; children?: ReactNode }) {
  return <div className="min-w-0 rounded-md bg-slate-50 p-3"><p className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500">{icon}{label}</p><p className="mt-2 break-words text-sm leading-5 text-slate-700 [overflow-wrap:anywhere]">{children ?? <span className="text-slate-500">{empty}</span>}</p></div>;
}

async function ProgressUpdateForm({ goal }: { goal: PlayerDevelopmentGoal }) {
  const ui = createSystemTranslator(await getActiveLocale());
  return <form action={createDevelopmentProgressUpdate} className="mt-3 grid gap-3"><input type="hidden" name="goalId" value={goal.id} /><div className="grid gap-3 sm:grid-cols-2"><SelectField name="progressLevel" label={ui("Progress")} options={developmentProgressOptions} defaultValue={goal.progress} compact /><label><span className="text-xs font-bold uppercase text-slate-500">{ui("Date")}</span><input name="recordedAt" type="date" defaultValue={today()} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm" /></label></div><textarea name="note" required rows={2} placeholder={ui("What changed?")} className="w-full rounded-md border border-board-line bg-white px-3 py-2 text-sm" /><Button type="submit" variant="secondary" className="h-10 w-full px-3 sm:w-fit">{ui("Save progress")}</Button></form>;
}

async function GoalActionForm({ goalId }: { goalId: string }) {
  const ui = createSystemTranslator(await getActiveLocale());
  return <form action={createGoalAction} className="mt-3 grid gap-3"><input type="hidden" name="goalId" value={goalId} /><label><span className="text-xs font-bold uppercase text-slate-500">{ui("Next step")}</span><input name="description" required placeholder={ui("What should happen next?")} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm" /></label><details className="rounded-md bg-slate-50 p-3"><summary className="cursor-pointer text-xs font-bold uppercase text-slate-600">{ui("More options")}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><label><span className="text-xs font-bold uppercase text-slate-500">{ui("Due date")}</span><input name="dueDate" type="date" className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm" /></label><label><span className="text-xs font-bold uppercase text-slate-500">{ui("Notes")}</span><input name="notes" className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm" /></label></div></details><Button type="submit" variant="secondary" className="h-10 w-full px-3 sm:w-fit">{ui("Save next step")}</Button></form>;
}

async function GoalDetails({ goal, playerId }: { goal: PlayerDevelopmentGoal; playerId: string }) {
  const locale = await getActiveLocale();
  const ui = createSystemTranslator(locale);
  return (
    <div className="mt-4 space-y-5">
      <div className="grid gap-3 sm:grid-cols-2"><Detail label={ui("Success criteria")} value={goal.successCriteria} userContent /><Detail label={ui("Category")} value={developmentCategoryLabel(goal.category, locale)} /><Detail label={ui("Priority")} value={developmentPriorityLabel(goal.priority, locale)} /><Detail label={ui("Started")} value={formatEventDate(goal.startDate, locale)} />{goal.coachNotes ? <Detail label={ui("Coach context")} value={goal.coachNotes} userContent /> : null}</div>
      <details className="rounded-md bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-bold text-board-navy">{ui("Edit goal")}</summary><form action={updateDevelopmentGoal} className="mt-3 grid gap-3 sm:grid-cols-2"><input type="hidden" name="goalId" value={goal.id} /><label className="sm:col-span-2"><span className="text-xs font-bold uppercase text-slate-500">{ui("Title")}</span><input name="title" defaultValue={goal.title} maxLength={120} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm" /></label><label className="sm:col-span-2"><span className="text-xs font-bold uppercase text-slate-500">{ui("Success criteria")}</span><textarea name="successCriteria" required rows={2} defaultValue={goal.successCriteria} className="mt-1 w-full rounded-md border border-board-line bg-white px-3 py-2 text-sm" /></label><SelectField name="category" label={ui("Category")} options={developmentGoalCategories} defaultValue={goal.category} compact /><SelectField name="priority" label={ui("Priority")} options={developmentGoalPriorities} defaultValue={goal.priority} compact /><SelectField name="status" label={ui("Status")} options={developmentGoalStatuses} defaultValue={goal.status} compact /><SelectField name="progress" label={ui("Progress")} options={developmentProgressOptions} defaultValue={goal.progress} compact /><label><span className="text-xs font-bold uppercase text-slate-500">{ui("Target review")}</span><input name="reviewDate" type="date" defaultValue={goal.reviewDate ?? ""} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm" /></label><label className="sm:col-span-2"><span className="text-xs font-bold uppercase text-slate-500">{ui("Coach notes")}</span><textarea name="coachNotes" rows={2} defaultValue={goal.coachNotes ?? ""} className="mt-1 w-full rounded-md border border-board-line bg-white px-3 py-2 text-sm" /></label><Button type="submit" variant="secondary" className="h-10 w-full px-3 sm:w-fit">{ui("Update goal")}</Button></form></details>
      <div className="grid gap-4 lg:grid-cols-3">
        <HistoryList title={ui("Progress history")} icon={<Target className="h-4 w-4" />} empty={ui("No progress updates yet.")}>{goal.progressUpdates.map((progress) => <div key={progress.id} className="rounded-md bg-slate-50 p-3 text-sm"><p className="text-xs font-bold uppercase text-slate-500">{formatEventDate(progress.recordedAt, locale)} · {developmentProgressLabel(progress.progressLevel, locale)}</p><p translate="no" className="mt-1 whitespace-pre-wrap text-slate-700">{progress.note}</p>{progress.trainingLabel || progress.trainingDate ? <p className="mt-1 text-xs text-slate-500">{ui("Training")}: {progress.trainingLabel ?? progress.trainingDate}</p> : null}</div>)}</HistoryList>
        <HistoryList title={ui("Next steps")} icon={<ClipboardCheck className="h-4 w-4" />} empty={ui("No actions yet.")}>{goal.actions.map((action) => <form key={action.id} action={updateGoalActionCompletion} className="rounded-md bg-slate-50 p-3 text-sm"><input type="hidden" name="actionId" value={action.id} /><label className="flex items-start gap-2"><input name="completed" type="checkbox" defaultChecked={action.completed} className="mt-1 h-4 w-4" /><span translate="no" className={action.completed ? "text-slate-500 line-through" : "text-slate-700"}>{action.description}{action.dueDate ? <span className="mt-1 block text-xs text-slate-500">{ui("Due")} {formatEventDate(action.dueDate, locale)}</span> : null}</span></label><button type="submit" className="mt-2 text-xs font-bold text-board-green">{ui("Save action status")}</button></form>)}</HistoryList>
        <HistoryList title={ui("Linked observations")} icon={<Eye className="h-4 w-4" />} empty={ui("No observations linked to this goal.")}>{goal.observations.map((observation) => <div key={observation.id} className="rounded-md bg-slate-50 p-3 text-sm"><p className="text-xs font-bold uppercase text-slate-500">{formatEventDate(observation.observationDate, locale)}</p><p translate="no" className="mt-1 whitespace-pre-wrap text-slate-700">{observation.note}</p></div>)}<details className="rounded-md bg-board-paper p-3"><summary className="cursor-pointer text-sm font-bold text-board-navy">{ui("Add observation")}</summary><ObservationForm playerId={playerId} goals={[goal]} defaultGoalId={goal.id} compact /></details></HistoryList>
      </div>
    </div>
  );
}

function Detail({ label, value, userContent = false }: { label: string; value: string; userContent?: boolean }) {
  return <div className="min-w-0"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p translate={userContent ? "no" : undefined} className="mt-1 break-words whitespace-pre-wrap text-sm text-slate-700 [overflow-wrap:anywhere]">{value}</p></div>;
}

function HistoryList({ title, icon, empty, children }: { title: string; icon: ReactNode; empty: string; children: ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <section className="min-w-0"><h4 className="flex items-center gap-2 text-sm font-bold text-board-navy">{icon}{title}</h4><div className="mt-2 space-y-2">{hasChildren ? children : <p className="rounded-md border border-dashed border-board-line p-3 text-sm text-slate-500">{empty}</p>}</div></section>;
}

async function DevelopmentTimeline({ development }: { development: PlayerDevelopmentProfile }) {
  const locale = await getActiveLocale();
  const ui = createSystemTranslator(locale);
  const visible = development.timeline.slice(0, 5);
  const remaining = development.timeline.slice(5);
  return <div className="rounded-md border border-board-line p-4"><h3 className="flex items-center gap-2 text-sm font-bold text-board-navy"><CalendarDays className="h-4 w-4" />{ui("Development timeline")}</h3><div className="mt-3 space-y-3">{visible.map((item) => <TimelineItem key={item.id} item={item} locale={locale} />)}</div>{remaining.length ? <details className="mt-3"><summary className="cursor-pointer text-sm font-bold text-board-green">{ui("Show full history")}</summary><div className="mt-3 space-y-3">{remaining.map((item) => <TimelineItem key={item.id} item={item} locale={locale} />)}</div></details> : null}</div>;
}

function TimelineItem({ item, locale }: { item: PlayerDevelopmentProfile["timeline"][number]; locale: "en" | "de" }) {
  const ui = createSystemTranslator(locale);
  return <div className="border-l-2 border-board-line pl-3"><p className="text-xs font-bold uppercase text-slate-500">{formatEventDate(item.date, locale)}</p><p className="mt-1 text-sm font-bold text-board-navy">{item.progressLevel ? ui("Progress: {progress}", { progress: developmentProgressLabel(item.progressLevel, locale) }) : ui(item.title)}</p>{item.detail ? <p translate="no" className="mt-1 line-clamp-3 text-sm text-slate-600">{item.detail}</p> : null}</div>;
}

async function SelectField<T extends string>({ name, label, options, defaultValue, compact }: { name: string; label: string; options: Array<{ value: T; label: string }>; defaultValue: T; compact?: boolean }) {
  const locale = await getActiveLocale();
  const ui = createSystemTranslator(locale);
  return <label><span className="text-xs font-bold uppercase text-slate-500">{label}</span><select name={name} defaultValue={defaultValue} className={`${compact ? "mt-1 h-10" : "mt-1 h-10"} w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100`}>{options.map((option) => <option key={option.value} value={option.value}>{name === "category" ? developmentCategoryLabel(option.value, locale) : ui(option.label)}</option>)}</select></label>;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
