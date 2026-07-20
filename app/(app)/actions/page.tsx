import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDown, ArrowUp, Bell, Clock, Settings2 } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { clearAttentionState, dismissAttentionItem, resetAttentionSettings, saveAttentionSettings, snoozeAttentionItem } from "@/lib/squad/attention-actions";
import {
  attentionCategories,
  attentionHref,
  attentionPriorityLabels,
  attentionTone,
  parseAttentionCenterState,
  type AttentionCenterData,
  type AttentionItem,
  type AttentionPriority,
  type AttentionType
} from "@/lib/squad/attention";
import { getAttentionCenterData } from "@/lib/squad/attention-queries";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type ActionsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const priorities: Array<{ id: AttentionPriority; label: string }> = [
  { id: "critical", label: "Critical" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
  { id: "info", label: "Information" }
];

const periods = [
  ["last5", "Last 5 trainings"],
  ["last10", "Last 10 trainings"],
  ["30d", "Last 30 days"],
  ["90d", "Last 90 days"],
  ["season", "This season"],
  ["all", "All time"]
];

const optionalRules: Array<{ id: AttentionType; label: string }> = [
  { id: "review-overdue", label: "Review overdue" },
  { id: "review-due", label: "Review due soon" },
  { id: "no-recent-observation", label: "No recent observation" },
  { id: "no-recent-rating", label: "No recent rating" },
  { id: "declining-trend", label: "Declining trend" },
  { id: "limited-evidence", label: "Limited evidence" },
  { id: "low-attendance", label: "Low attendance" },
  { id: "repeated-lateness", label: "Repeated lateness" },
  { id: "late-cancellation-pattern", label: "Late cancellation pattern" },
  { id: "high-priority-goal-follow-up", label: "High-priority goal follow-up" },
  { id: "no-active-development-goal", label: "No active development goal" },
  { id: "currently-unavailable", label: "Current medical unavailability" },
  { id: "trial-decision-open", label: "Trial decision open" },
  { id: "trial-duration-exceeded", label: "Trial duration exceeded" },
  { id: "trial-insufficient-evidence", label: "Trial evidence incomplete" },
  { id: "missing-position", label: "Missing position" },
  { id: "missing-date-of-birth", label: "Missing birthdate" }
];

export default async function ActionsPage({ searchParams }: ActionsPageProps) {
  const params = await searchParams;
  const state = parseAttentionCenterState(params);
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const data = await getAttentionCenterData(supabase, user.id, state);
  const returnTo = attentionHref(data.state, {});

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Coach Intelligence"
        title="Action Center"
        description="Rules-based coaching reminders from your squad data. Every item shows the evidence and the threshold behind it."
        actions={(
          <>
          <ButtonLink href={attentionHref(data.state, {})} variant="secondary">
            <Clock className="h-4 w-4" />
            Refresh
          </ButtonLink>
          <ButtonLink href="#attention-settings" variant="secondary">
            <Settings2 className="h-4 w-4" />
            Settings
          </ButtonLink>
          </>
        )}
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Open items" value={data.summary.open} href={attentionHref(data.state, { status: "open", priority: "all", category: "all" })} />
        <SummaryCard label="High priority" value={data.summary.high + data.summary.critical} href={attentionHref(data.state, { status: "open", priority: "high" })} tone="red" />
        <SummaryCard label="Reviews" value={data.summary.review} href={attentionHref(data.state, { status: "open", category: "review" })} />
        <SummaryCard label="Medical reviews" value={data.summary.medical} href={attentionHref(data.state, { status: "open", category: "medical" })} tone="amber" />
        <SummaryCard label="Snoozed" value={data.summary.snoozed} href={attentionHref(data.state, { status: "snoozed" })} />
      </section>

      <ActionFilters data={data} />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          {data.items.length ? data.items.map((item) => (
            <AttentionCard key={item.key} item={item} selected={data.selected?.key === item.key} stateHref={attentionHref(data.state, { item: item.key, player: item.playerId })} returnTo={returnTo} />
          )) : <EmptyState data={data} />}
        </div>
        <aside className="xl:sticky xl:top-6 xl:self-start">
          <AttentionDetail item={data.selected} returnTo={returnTo} />
        </aside>
      </section>

      <AttentionSettings data={data} returnTo={returnTo} />
    </PageContainer>
  );
}

function ActionFilters({ data }: { data: AttentionCenterData }) {
  const state = data.state;
  return (
    <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <form action="/actions" className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Field label="Priority">
          <select name="priority" defaultValue={state.priority} className={fieldClass()}>
            <option value="all">All priorities</option>
            {priorities.map((priority) => <option key={priority.id} value={priority.id}>{priority.label}</option>)}
          </select>
        </Field>
        <Field label="Category">
          <select name="category" defaultValue={state.category} className={fieldClass()}>
            <option value="all">All categories</option>
            {attentionCategories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
          </select>
        </Field>
        <Field label="Player type">
          <select name="playerType" defaultValue={state.playerType} className={fieldClass()}>
            <option value="all">All players</option>
            <option value="roster">Roster</option>
            <option value="trial">Trial</option>
          </select>
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={state.status} className={fieldClass()}>
            <option value="open">Open</option>
            <option value="snoozed">Snoozed</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </Field>
        <Field label="Period">
          <select name="period" defaultValue={state.period} className={fieldClass()}>
            {periods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Position">
          <select name="position" defaultValue={state.position ?? ""} className={fieldClass()}>
            <option value="">All positions</option>
            {data.positions.map((position) => <option key={position} value={position}>{position}</option>)}
          </select>
        </Field>
        <Field label="Sort">
          <select name="sort" defaultValue={state.sort} className={fieldClass()}>
            <option value="priority">Priority</option>
            <option value="dueDate">Due date</option>
            <option value="player">Player name</option>
            <option value="category">Category</option>
            <option value="detected">Detected</option>
          </select>
        </Field>
        <Field label="Search">
          <input name="search" defaultValue={state.search} placeholder="Player, title, position..." className={fieldClass()} />
        </Field>
        <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-4 xl:items-end">
          <Button type="submit">Apply filters</Button>
          <ButtonLink href={attentionHref(state, { direction: state.direction === "asc" ? "desc" : "asc" })} variant="secondary">
            {state.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            {state.direction === "asc" ? "Ascending" : "Descending"}
          </ButtonLink>
          <ButtonLink href="/actions" variant="ghost">Reset</ButtonLink>
        </div>
      </form>
    </section>
  );
}

function AttentionCard({ item, selected, stateHref, returnTo }: { item: AttentionItem; selected: boolean; stateHref: string; returnTo: string }) {
  return (
    <article className={cn("rounded-lg border bg-white p-4 shadow-soft", selected ? "border-board-green ring-2 ring-green-100" : "border-board-line")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={withReturnTo(`/squad/players/${item.playerId}`, returnTo)} className="font-bold text-board-navy hover:text-board-green">{item.playerName}</Link>
            <span className="text-sm text-slate-500">{item.playerPosition ?? "No position"}</span>
            <Badge tone={item.playerType === "trial" ? "amber" : "neutral"}>{item.playerType === "trial" ? "Trial" : "Roster"}</Badge>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={attentionTone(item.priority)}>{attentionPriorityLabels[item.priority]}</Badge>
            <Badge tone="neutral">{categoryLabel(item.category)}</Badge>
          </div>
          <h2 className="mt-3 text-lg font-bold text-board-navy">{item.title}</h2>
          <p className="mt-1 text-sm text-slate-600">{item.explanation}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <ButtonLink href={stateHref} variant="secondary" className="h-9 px-3">Details</ButtonLink>
          {item.suggestedActions[0] ? <ButtonLink href={withReturnTo(item.suggestedActions[0].href, returnTo)} className="h-9 px-3">{item.suggestedActions[0].label}</ButtonLink> : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {item.snoozeable ? <SnoozeForm item={item} returnTo={returnTo} /> : null}
        {item.dismissible ? (
          <form action={dismissAttentionItem}>
            <ActionHidden item={item} returnTo={returnTo} />
            <Button type="submit" variant="ghost" className="h-8 px-2 text-xs">Dismiss</Button>
          </form>
        ) : null}
        {item.snoozedUntil || item.dismissedAt ? (
          <form action={clearAttentionState}>
            <ActionHidden item={item} returnTo={returnTo} />
            <Button type="submit" variant="ghost" className="h-8 px-2 text-xs">Reactivate</Button>
          </form>
        ) : null}
      </div>
    </article>
  );
}

function AttentionDetail({ item, returnTo }: { item?: AttentionItem; returnTo: string }) {
  if (!item) {
    return (
      <section className="rounded-lg border border-dashed border-board-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">Context</h2>
        <p className="mt-2 text-sm text-slate-600">Select an action to see evidence, thresholds and the next useful steps.</p>
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase text-slate-500">Context</p>
          <h2 className="mt-1 text-xl font-bold text-board-navy">{item.title}</h2>
          <p className="mt-1 text-sm text-slate-600">{item.playerName} · {item.playerPosition ?? "No position"} · {item.playerType === "trial" ? "Trial" : "Roster"}</p>
        </div>
        <Badge tone={attentionTone(item.priority)}>{attentionPriorityLabels[item.priority]}</Badge>
      </div>
      <p className="mt-4 text-sm text-slate-700">{item.explanation}</p>
      <div className="mt-4 rounded-md bg-board-paper p-3">
        <p className="text-xs font-bold uppercase text-slate-500">Threshold</p>
        <p className="mt-1 text-sm font-semibold text-board-navy">{item.thresholdLabel}</p>
        {item.periodLabel ? <p className="mt-1 text-xs text-slate-500">Period: {item.periodLabel}</p> : null}
      </div>
      <div className="mt-4">
        <h3 className="text-sm font-bold uppercase text-slate-500">Evidence</h3>
        <dl className="mt-2 grid gap-2">
          {item.evidence.map((evidence) => (
            <div key={evidence.label} className="rounded-md bg-slate-50 p-2">
              <dt className="text-[11px] font-bold uppercase text-slate-500">{evidence.label}</dt>
              <dd className="mt-1 text-sm font-bold text-board-navy">{evidence.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="mt-4 grid gap-2">
        {item.suggestedActions.map((action) => (
          <ButtonLink key={action.label} href={withReturnTo(action.href, returnTo)} variant={action.primary ? "primary" : "secondary"} className="justify-center">{action.label}</ButtonLink>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {item.snoozeable ? <SnoozeForm item={item} returnTo={returnTo} /> : null}
        {item.dismissible ? (
          <form action={dismissAttentionItem}>
            <ActionHidden item={item} returnTo={returnTo} />
            <Button type="submit" variant="ghost" className="h-8 px-2 text-xs">Dismiss</Button>
          </form>
        ) : null}
      </div>
    </section>
  );
}

function AttentionSettings({ data, returnTo }: { data: AttentionCenterData; returnTo: string }) {
  const preferences = data.preferences;
  return (
    <section id="attention-settings" className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-board-green">Attention settings</p>
          <h2 className="mt-1 text-xl font-bold text-board-navy">Rules and thresholds</h2>
          <p className="mt-1 text-sm text-slate-600">These settings change which facts CoachBoard surfaces. They do not change player data or formulas.</p>
        </div>
        <form action={resetAttentionSettings}>
          <input type="hidden" name="returnTo" value={returnTo} />
          <ConfirmSubmitButton message="Reset attention settings to CoachBoard defaults? Player data will not be changed." variant="secondary" className="h-9 px-3">
            Reset defaults
          </ConfirmSubmitButton>
        </form>
      </div>
      <form action={saveAttentionSettings} className="mt-5 space-y-5">
        <input type="hidden" name="returnTo" value={returnTo} />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Observation age days"><input name="observationAgeDays" type="number" min="7" max="180" defaultValue={preferences.observationAgeDays} className={fieldClass()} /></Field>
          <Field label="Low attendance %"><input name="lowAttendancePercent" type="number" min="40" max="100" defaultValue={preferences.lowAttendancePercent} className={fieldClass()} /></Field>
          <Field label="No rating trainings"><input name="noRecentRatingTrainings" type="number" min="1" max="10" defaultValue={preferences.noRecentRatingTrainings} className={fieldClass()} /></Field>
          <Field label="Declining trend"><input name="decliningTrendThreshold" type="number" min="-1.5" max="-0.1" step="0.1" defaultValue={preferences.decliningTrendThreshold} className={fieldClass()} /></Field>
          <Field label="Repeated lateness"><input name="repeatedLatenessCount" type="number" min="1" max="10" defaultValue={preferences.repeatedLatenessCount} className={fieldClass()} /></Field>
          <Field label="Trial duration days"><input name="trialDurationDays" type="number" min="7" max="180" defaultValue={preferences.trialDurationDays} className={fieldClass()} /></Field>
          <Field label="Goal follow-up days"><input name="goalFollowUpDays" type="number" min="7" max="180" defaultValue={preferences.goalFollowUpDays} className={fieldClass()} /></Field>
        </div>
        <details className="rounded-md bg-board-paper p-3">
          <summary className="cursor-pointer text-sm font-bold text-board-navy">Enabled rules</summary>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked disabled className="h-4 w-4" />
              Medical return review · mandatory
            </label>
            {optionalRules.map((rule) => (
              <label key={rule.id} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input name={`rule:${rule.id}`} type="checkbox" defaultChecked={preferences.enabledRules[rule.id] !== false} className="h-4 w-4" />
                {rule.label}
              </label>
            ))}
          </div>
        </details>
        <Button type="submit">Save attention settings</Button>
      </form>
    </section>
  );
}

function SnoozeForm({ item, returnTo }: { item: AttentionItem; returnTo: string }) {
  return (
    <form action={snoozeAttentionItem} className="flex items-center gap-2">
      <ActionHidden item={item} returnTo={returnTo} />
      <select name="snooze" defaultValue="3d" className="h-8 rounded-md border border-board-line bg-white px-2 text-xs font-semibold text-slate-700">
        <option value="tomorrow">Tomorrow</option>
        <option value="3d">3 days</option>
        <option value="1w">1 week</option>
        <option value="2w">2 weeks</option>
      </select>
      <Button type="submit" variant="ghost" className="h-8 px-2 text-xs">Snooze</Button>
    </form>
  );
}

function ActionHidden({ item, returnTo }: { item: AttentionItem; returnTo: string }) {
  return (
    <>
      <input type="hidden" name="attentionKey" value={item.key} />
      <input type="hidden" name="playerId" value={item.playerId} />
      <input type="hidden" name="attentionType" value={item.type} />
      <input type="hidden" name="returnTo" value={returnTo} />
    </>
  );
}

function SummaryCard({ label, value, href, tone = "green" }: { label: string; value: number; href: string; tone?: "green" | "red" | "amber" }) {
  return (
    <Link href={href} className="rounded-lg border border-board-line bg-white p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-md">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className={cn("mt-2 text-3xl font-bold", tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : "text-board-navy")}>{value}</p>
    </Link>
  );
}

function EmptyState({ data }: { data: AttentionCenterData }) {
  const text = data.state.status === "snoozed"
    ? "No snoozed items."
    : data.state.priority !== "all"
      ? `No ${attentionPriorityLabels[data.state.priority].toLowerCase()} items.`
      : data.state.category !== "all"
        ? `No ${categoryLabel(data.state.category).toLowerCase()} items currently require attention.`
        : "No open coaching actions. No players currently match your active attention rules and filters.";
  return (
    <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
      <Bell className="mx-auto h-8 w-8 text-board-green" />
      <h2 className="mt-3 text-lg font-bold text-board-navy">Nothing to process</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">{text}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function fieldClass() {
  return "h-11 w-full rounded-md border border-board-line bg-white px-3 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100";
}

function Badge({ children, tone = "green" }: { children: React.ReactNode; tone?: "green" | "amber" | "red" | "neutral" }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-1 text-xs font-bold",
      tone === "green" && "bg-green-50 text-green-700",
      tone === "amber" && "bg-amber-50 text-amber-700",
      tone === "red" && "bg-red-50 text-red-700",
      tone === "neutral" && "bg-slate-100 text-slate-700"
    )}>
      {children}
    </span>
  );
}

function categoryLabel(category: AttentionItem["category"]) {
  return attentionCategories.find((item) => item.id === category)?.label ?? category;
}

function withReturnTo(href: string, returnTo: string) {
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("returnTo", returnTo);
  return `${path}?${params.toString()}`;
}
