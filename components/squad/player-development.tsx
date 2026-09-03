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
import { isActiveGoal, type PlayerDevelopmentProfile } from "@/lib/squad/development";
import { formatEventDate } from "@/lib/squad/attendance-format";
import type { PlayerDevelopmentGoal } from "@/types/domain";

export function PlayerDevelopmentSection({ playerId, development }: { playerId: string; development: PlayerDevelopmentProfile }) {
  const activeGoals = development.goals.filter(isActiveGoal);
  const highPriorityGoals = activeGoals.filter((goal) => goal.priority === "high");
  const dueGoals = activeGoals.filter((goal) => goal.reviewDate && goal.reviewDate <= new Date().toISOString().slice(0, 10));
  return (
    <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-board-navy"><Target className="h-5 w-5" />Development</h2>
          <p className="mt-1 text-sm text-slate-600">Connect observations to long-term player development goals.</p>
        </div>
        <ButtonLink href="/squad/development" variant="secondary" className="h-9 px-3">Development overview</ButtonLink>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-sm font-bold">
        <span className="rounded-md bg-slate-100 px-3 py-2 text-slate-700">{activeGoals.length} active goal{activeGoals.length === 1 ? "" : "s"}</span>
        <span className="rounded-md bg-amber-50 px-3 py-2 text-amber-700">{highPriorityGoals.length} high priority</span>
        <span className={dueGoals.length ? "rounded-md bg-red-50 px-3 py-2 text-red-700" : "rounded-md bg-green-50 px-3 py-2 text-green-700"}>{dueGoals.length} due for review</span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <details className="rounded-md border border-board-line bg-board-paper p-4">
            <summary className="cursor-pointer text-sm font-bold text-board-navy">Add development goal</summary>
            <DevelopmentGoalForm playerId={playerId} />
          </details>

          {development.goals.length ? (
            development.goals.map((goal) => <DevelopmentGoalCard key={goal.id} goal={goal} playerId={playerId} />)
          ) : (
            <div className="rounded-md border border-dashed border-board-line p-5">
              <p className="font-bold text-board-navy">No development goals yet.</p>
              <p className="mt-1 text-sm text-slate-600">Add one observable focus area, then record progress and evidence over time.</p>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-md bg-slate-50 p-4">
            <p className="text-sm font-bold text-board-navy">Quick observation</p>
            {activeGoals.length ? <p className="mt-1 text-xs text-slate-500">Active goals: {activeGoals.map((goal) => goal.title).join(", ")}</p> : null}
            <ObservationForm playerId={playerId} goals={activeGoals} compact />
          </div>
          <DevelopmentTimeline development={development} />
        </aside>
      </div>
    </section>
  );
}

export function ObservationForm({
  playerId,
  goals,
  eventId,
  returnTo,
  compact
}: {
  playerId: string;
  goals: PlayerDevelopmentGoal[];
  eventId?: string;
  returnTo?: string;
  compact?: boolean;
}) {
  return (
    <form action={createPlayerObservation} className={compact ? "mt-3 space-y-2" : "space-y-3"}>
      <input type="hidden" name="playerId" value={playerId} />
      {eventId ? <input type="hidden" name="eventId" value={eventId} /> : null}
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <div className={compact ? "grid gap-2" : "grid gap-3 sm:grid-cols-3"}>
        <label>
          <span className="text-xs font-bold uppercase text-slate-500">Date</span>
          <input name="observationDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
        </label>
        <label>
          <span className="text-xs font-bold uppercase text-slate-500">Goal</span>
          <select name="goalId" className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
            <option value="">No linked goal</option>
            {goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
          </select>
        </label>
        <label>
          <span className="text-xs font-bold uppercase text-slate-500">Category</span>
          <select name="category" className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
            <option value="">Optional</option>
            {developmentGoalCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="text-xs font-bold uppercase text-slate-500">Observation</span>
        <textarea name="note" required rows={compact ? 2 : 3} placeholder="What did you notice?" className="mt-1 w-full rounded-md border border-board-line bg-white px-3 py-2 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
      </label>
      <Button type="submit" variant="secondary" className="h-10 px-3">
        <Plus className="h-4 w-4" />
        Add observation
      </Button>
    </form>
  );
}

function DevelopmentGoalForm({ playerId }: { playerId: string }) {
  return (
    <form action={createDevelopmentGoal} className="mt-4 grid gap-3 md:grid-cols-2">
      <input type="hidden" name="playerId" value={playerId} />
      <label className="md:col-span-2">
        <span className="text-xs font-bold uppercase text-slate-500">Goal title</span>
        <input name="title" required maxLength={120} placeholder="Scanning before receiving" className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
      </label>
      <label className="md:col-span-2">
        <span className="text-xs font-bold uppercase text-slate-500">Success criteria</span>
        <textarea name="successCriteria" required rows={2} placeholder="What improved behaviour should be visible?" className="mt-1 w-full rounded-md border border-board-line bg-white px-3 py-2 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
      </label>
      <label className="md:col-span-2">
        <span className="text-xs font-bold uppercase text-slate-500">Coach notes</span>
        <textarea name="coachNotes" rows={2} placeholder="Why was this goal created?" className="mt-1 w-full rounded-md border border-board-line bg-white px-3 py-2 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
      </label>
      <SelectField name="category" label="Category" options={developmentGoalCategories} defaultValue="technical" />
      <SelectField name="priority" label="Priority" options={developmentGoalPriorities} defaultValue="medium" />
      <SelectField name="status" label="Status" options={developmentGoalStatuses} defaultValue="in_progress" />
      <SelectField name="progress" label="Latest progress" options={developmentProgressOptions} defaultValue="developing" />
      <label>
        <span className="text-xs font-bold uppercase text-slate-500">Start date</span>
        <input name="startDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
      </label>
      <label>
        <span className="text-xs font-bold uppercase text-slate-500">Target review date</span>
        <input name="reviewDate" type="date" className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
      </label>
      <div className="md:col-span-2">
        <Button type="submit">Create goal</Button>
      </div>
    </form>
  );
}

function DevelopmentGoalCard({ goal, playerId }: { goal: PlayerDevelopmentGoal; playerId: string }) {
  const recentObservations = goal.observations.slice(0, 2);
  const latestProgress = goal.progressUpdates[0];
  return (
    <article className="rounded-md border border-board-line bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-board-navy">{goal.title}</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{goal.successCriteria}</p>
          {goal.coachNotes ? <p className="mt-2 whitespace-pre-wrap text-xs font-semibold text-slate-500">Coach context: {goal.coachNotes}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{developmentCategoryLabel(goal.category)}</span>
            <span className={priorityTone(goal.priority)}>{developmentPriorityLabel(goal.priority)}</span>
            <span className="rounded-full bg-green-50 px-2 py-1 text-green-700">{developmentStatusLabel(goal.status)}</span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">Latest: {latestProgress ? developmentProgressLabel(latestProgress.progressLevel) : developmentProgressLabel(goal.progress)}</span>
          </div>
        </div>
        <div className="text-sm text-slate-600 sm:text-right">
          <p><span className="font-bold text-board-navy">Review:</span> {goal.reviewDate ? formatEventDate(goal.reviewDate) : "Not set"}</p>
          <p className="mt-1"><span className="font-bold text-board-navy">Started:</span> {formatEventDate(goal.startDate)}</p>
        </div>
      </div>

      <details className="mt-4 rounded-md bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-bold text-board-navy">Edit goal</summary>
        <form action={updateDevelopmentGoal} className="mt-3 grid gap-2 lg:grid-cols-3">
          <input type="hidden" name="goalId" value={goal.id} />
          <label className="lg:col-span-3">
            <span className="text-xs font-bold uppercase text-slate-500">Title</span>
            <input name="title" defaultValue={goal.title} maxLength={120} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
          </label>
          <label className="lg:col-span-3">
            <span className="text-xs font-bold uppercase text-slate-500">Success criteria</span>
            <textarea name="successCriteria" required rows={2} defaultValue={goal.successCriteria} className="mt-1 w-full rounded-md border border-board-line bg-white px-3 py-2 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
          </label>
          <SelectField name="category" label="Category" options={developmentGoalCategories} defaultValue={goal.category} compact />
          <SelectField name="priority" label="Priority" options={developmentGoalPriorities} defaultValue={goal.priority} compact />
          <SelectField name="status" label="Status" options={developmentGoalStatuses} defaultValue={goal.status} compact />
          <SelectField name="progress" label="Latest progress" options={developmentProgressOptions} defaultValue={goal.progress} compact />
          <label>
            <span className="text-xs font-bold uppercase text-slate-500">Target review</span>
            <input name="reviewDate" type="date" defaultValue={goal.reviewDate ?? ""} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
          </label>
          <label className="lg:col-span-3">
            <span className="text-xs font-bold uppercase text-slate-500">Coach notes</span>
            <textarea name="coachNotes" rows={2} defaultValue={goal.coachNotes ?? ""} className="mt-1 w-full rounded-md border border-board-line bg-white px-3 py-2 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
          </label>
          <div className="lg:col-span-3">
            <Button type="submit" variant="secondary" className="h-10 px-3">Update goal</Button>
          </div>
        </form>
      </details>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-board-navy"><Target className="h-4 w-4" />Progress history</p>
          <div className="mt-2 space-y-2">
            {goal.progressUpdates.length ? goal.progressUpdates.slice(0, 4).map((progress) => (
              <div key={progress.id} className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                <p className="text-xs font-bold uppercase text-slate-500">{formatEventDate(progress.recordedAt)} · {developmentProgressLabel(progress.progressLevel)}</p>
                <p className="mt-1 whitespace-pre-wrap">{progress.note}</p>
                {progress.trainingLabel || progress.trainingDate ? <p className="mt-1 text-xs font-semibold text-slate-500">Training: {progress.trainingLabel ?? progress.trainingDate}</p> : null}
              </div>
            )) : <p className="rounded-md border border-dashed border-board-line p-3 text-sm text-slate-500">No progress updates yet.</p>}
          </div>
          <form action={createDevelopmentProgressUpdate} className="mt-3 grid gap-2 rounded-md bg-board-paper p-3">
            <input type="hidden" name="goalId" value={goal.id} />
            <div className="grid gap-2 sm:grid-cols-2">
              <SelectField name="progressLevel" label="Progress" options={developmentProgressOptions} defaultValue={goal.progress} compact />
              <label>
                <span className="text-xs font-bold uppercase text-slate-500">Date</span>
                <input name="recordedAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
              </label>
            </div>
            <textarea name="note" required rows={2} placeholder="What changed since the last review?" className="w-full rounded-md border border-board-line bg-white px-3 py-2 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
            <Button type="submit" variant="secondary" className="h-10 px-3">Add progress update</Button>
          </form>
        </div>

        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-board-navy"><ClipboardCheck className="h-4 w-4" />Coach actions</p>
          <div className="mt-2 space-y-2">
            {goal.actions.length ? goal.actions.map((action) => (
              <form key={action.id} action={updateGoalActionCompletion} className="rounded-md bg-slate-50 p-2 text-sm">
                <input type="hidden" name="actionId" value={action.id} />
                <label className="flex items-start gap-2 font-semibold text-slate-700">
                  <input name="completed" type="checkbox" defaultChecked={action.completed} className="mt-1 h-4 w-4" />
                  <span>
                    {action.description}
                    {action.dueDate ? <span className="block text-xs text-slate-500">Due {formatEventDate(action.dueDate)}</span> : null}
                    {action.notes ? <span className="block text-xs text-slate-500">{action.notes}</span> : null}
                  </span>
                </label>
                <button type="submit" className="mt-2 text-xs font-bold text-board-green underline-offset-4 hover:underline">Save action status</button>
              </form>
            )) : <p className="rounded-md border border-dashed border-board-line p-3 text-sm text-slate-500">No actions yet.</p>}
          </div>
          <form action={createGoalAction} className="mt-3 grid gap-2">
            <input type="hidden" name="goalId" value={goal.id} />
            <input name="description" required placeholder="Add a coaching action" className="h-10 rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input name="dueDate" type="date" className="h-10 rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
              <Button type="submit" variant="secondary" className="h-10 px-3">Add action</Button>
            </div>
          </form>
        </div>

        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-board-navy"><Eye className="h-4 w-4" />Linked observations</p>
          <div className="mt-2 space-y-2">
            {recentObservations.length ? recentObservations.map((observation) => (
              <div key={observation.id} className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                <p className="text-xs font-bold uppercase text-slate-500">{formatEventDate(observation.observationDate)}{observation.category ? ` · ${developmentCategoryLabel(observation.category)}` : ""}</p>
                <p className="mt-1 whitespace-pre-wrap">{observation.note}</p>
              </div>
            )) : <p className="rounded-md border border-dashed border-board-line p-3 text-sm text-slate-500">No observations linked to this goal.</p>}
          </div>
          <details className="mt-3 rounded-md bg-board-paper p-3">
            <summary className="cursor-pointer text-sm font-bold text-board-navy">Add observation for this goal</summary>
            <ObservationForm playerId={playerId} goals={[goal]} compact />
          </details>
        </div>
      </div>
    </article>
  );
}

function DevelopmentTimeline({ development }: { development: PlayerDevelopmentProfile }) {
  return (
    <div className="rounded-md border border-board-line p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-board-navy"><CalendarDays className="h-4 w-4" />Development timeline</p>
      <div className="mt-3 space-y-3">
        {development.timeline.length ? development.timeline.slice(0, 8).map((item) => (
          <div key={item.id} className="border-l-2 border-board-line pl-3">
            <p className="text-xs font-bold uppercase text-slate-500">{formatEventDate(item.date)}</p>
            <p className="mt-1 text-sm font-bold text-board-navy">{item.title}</p>
            {item.detail ? <p className="mt-1 line-clamp-3 text-sm text-slate-600">{item.detail}</p> : null}
          </div>
        )) : (
          <p className="rounded-md border border-dashed border-board-line p-3 text-sm text-slate-500">No development timeline yet.</p>
        )}
      </div>
    </div>
  );
}

function SelectField<T extends string>({ name, label, options, defaultValue, compact }: { name: string; label: string; options: Array<{ value: T; label: string }>; defaultValue: T; compact?: boolean }) {
  return (
    <label>
      <span className="text-xs font-bold uppercase text-slate-500">{label}</span>
      <select name={name} defaultValue={defaultValue} className={`${compact ? "mt-1 h-10" : "mt-1 h-10"} w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100`}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function priorityTone(priority: string) {
  if (priority === "high") return "rounded-full bg-amber-50 px-2 py-1 text-amber-700";
  if (priority === "low") return "rounded-full bg-slate-100 px-2 py-1 text-slate-600";
  return "rounded-full bg-green-50 px-2 py-1 text-green-700";
}
