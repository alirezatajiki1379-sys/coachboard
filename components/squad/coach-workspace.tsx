import Link from "next/link";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarDays,
  Eye,
  Plus,
  Search,
  Stethoscope,
  Target,
  UserRound
} from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { coachAssessmentLabels, playerName } from "@/lib/squad/analytics";
import { formatEventDate } from "@/lib/squad/attendance-format";
import { calculateAge } from "@/lib/squad/format";
import { cn } from "@/lib/utils";
import {
  availabilityDetail,
  availabilityLabel,
  formatWorkspacePercent,
  formatWorkspaceRating,
  hiddenAttentionCount,
  quickViews,
  visibleAttention,
  workspaceHref,
  type WorkspaceData,
  type WorkspacePlayerSummary,
  type WorkspaceSortKey
} from "@/lib/squad/workspace";

const sortLabels: Array<{ value: WorkspaceSortKey; label: string }> = [
  { value: "name", label: "Name" },
  { value: "position", label: "Primary position" },
  { value: "age", label: "Age" },
  { value: "availability", label: "Availability" },
  { value: "lastTraining", label: "Last training" },
  { value: "attendance", label: "Attendance" },
  { value: "average", label: "Average rating" },
  { value: "latestRating", label: "Latest rating" },
  { value: "trend", label: "Trend" },
  { value: "reliability", label: "Reliability" },
  { value: "activeGoals", label: "Active goals" },
  { value: "goalPriority", label: "Goal priority" },
  { value: "reviewDate", label: "Review date" },
  { value: "lastObservation", label: "Last observation" },
  { value: "coachAssessment", label: "Coach assessment" }
];

const positionGroups = ["Goalkeepers", "Defenders", "Midfielders", "Attackers", "Other"] as const;

export function CoachWorkspace({ data }: { data: WorkspaceData }) {
  const view = quickViews.find((item) => item.id === data.state.view) ?? quickViews[0];
  const grouped = data.state.view === "by-position" ? groupByPosition(data.players) : null;

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-board-green">Squad</p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">Coach Workspace</h1>
          <p className="mt-2 max-w-3xl text-slate-600">
            Review your squad, identify players who need attention and open the right Player Hub when deeper context is needed.
          </p>
          <p className="mt-3 text-sm font-semibold text-slate-700">
            {data.counts.active} active players · {data.counts.roster} roster · {data.counts.trial} trial
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/squad/players/new" className="justify-center">
            <Plus className="h-4 w-4" />
            Add player
          </ButtonLink>
        </div>
      </section>

      <section className="rounded-lg border border-board-line bg-white p-3 shadow-soft">
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Coach Workspace quick views">
          {quickViews.map((item) => (
            <Link
              key={item.id}
              role="tab"
              aria-selected={item.id === data.state.view}
              href={workspaceHref(data.state, { view: item.id, selectedPlayer: undefined, sort: undefined, direction: undefined })}
              className={cn(
                "min-w-fit rounded-md px-3 py-2 text-sm font-bold transition",
                item.id === data.state.view ? "bg-board-green text-white" : "text-slate-600 hover:bg-green-50 hover:text-board-green"
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <p className="mt-2 px-1 text-sm text-slate-600">{view.description}</p>
      </section>

      <WorkspaceFilters data={data} />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-board-navy">{view.label}</h2>
              <p className="text-sm text-slate-600">{data.periodLabel} · {data.periodRangeLabel}</p>
            </div>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">{data.players.length} shown</p>
          </div>

          <div className="hidden xl:block">
            {data.players.length ? (
              grouped ? (
                <div className="space-y-5">
                  {positionGroups.map((group) => {
                    const players = grouped[group];
                    if (!players.length) return null;
                    return (
                      <section key={group} className="rounded-lg border border-board-line bg-white shadow-soft">
                        <h3 className="border-b border-board-line px-4 py-3 text-sm font-bold uppercase tracking-wide text-slate-500">{group}</h3>
                        <WorkspaceTable data={data} players={players} />
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-board-line bg-white shadow-soft">
                  <WorkspaceTable data={data} players={data.players} />
                </div>
              )
            ) : (
              <WorkspaceEmpty data={data} />
            )}
          </div>

          <div className="space-y-3 xl:hidden">
            {data.players.length ? data.players.map((player) => <WorkspaceMobileCard key={player.analytics.player.id} data={data} player={player} />) : <WorkspaceEmpty data={data} />}
          </div>
        </div>

        <aside className="hidden xl:block">
          <div className="sticky top-6">
            <InspectorPanel player={data.selected} />
          </div>
        </aside>
      </section>
    </div>
  );
}

function WorkspaceFilters({ data }: { data: WorkspaceData }) {
  const state = data.state;
  return (
    <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <form action="/squad" className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <input type="hidden" name="view" value={state.view} />
        <Field label="Players">
          <select name="players" defaultValue={state.players} className={fieldClass()}>
            <option value="active">All active players</option>
            <option value="roster">Roster players</option>
            <option value="trial">Trial players</option>
            <option value="archived">Archived players</option>
          </select>
        </Field>
        <Field label="Position">
          <select name="position" defaultValue={state.position ?? ""} className={fieldClass()}>
            <option value="">All positions</option>
            {data.positions.map((position) => <option key={position} value={position}>{position}</option>)}
          </select>
        </Field>
        <Field label="Availability">
          <select name="availability" defaultValue={state.availability} className={fieldClass()}>
            <option value="all">All</option>
            <option value="available">Available</option>
            <option value="injured">Injured</option>
            <option value="sick">Sick</option>
            <option value="medical-review">Needs medical review</option>
          </select>
        </Field>
        <Field label="Period">
          <select name="period" defaultValue={state.period} className={fieldClass()}>
            <option value="last5">Last 5 trainings</option>
            <option value="last10">Last 10 trainings</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="season">This season</option>
            <option value="all">All time</option>
            <option value="custom">Custom range</option>
          </select>
        </Field>
        <Field label="Sort">
          <select name="sort" defaultValue={state.sort} className={fieldClass()}>
            {sortLabels.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </Field>
        <Field label="Search">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input name="search" defaultValue={state.search} className={cn(fieldClass(), "pl-9")} placeholder="Name, club, position..." />
          </div>
        </Field>
        {state.period === "custom" ? (
          <>
            <Field label="From">
              <input name="from" defaultValue={state.customFrom ?? ""} type="date" className={fieldClass()} />
            </Field>
            <Field label="To">
              <input name="to" defaultValue={state.customTo ?? ""} type="date" className={fieldClass()} />
            </Field>
          </>
        ) : null}
        <details className="md:col-span-2 xl:col-span-6">
          <summary className="cursor-pointer text-sm font-bold text-board-navy">More filters</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Field label="Coach assessment">
              <select name="coachAssessment" defaultValue={state.coachAssessment ?? ""} className={fieldClass()}>
                <option value="">Any assessment</option>
                {Object.entries(coachAssessmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Development">
              <select name="developmentStatus" defaultValue={state.developmentStatus ?? ""} className={fieldClass()}>
                <option value="">Any status</option>
                <option value="active-goals">Has active goals</option>
                <option value="high-priority">Has high-priority goal</option>
                <option value="no-active-goals">No active goals</option>
                <option value="review-overdue">Review overdue</option>
                <option value="review-due">Review due</option>
              </select>
            </Field>
            <Field label="Review">
              <select name="reviewStatus" defaultValue={state.reviewStatus ?? ""} className={fieldClass()}>
                <option value="">Any review</option>
                <option value="overdue">Overdue</option>
                <option value="today">Due today</option>
                <option value="week">Due this week</option>
                <option value="upcoming">Upcoming</option>
                <option value="none">No review date</option>
              </select>
            </Field>
            <Field label="Evidence">
              <select name="evidenceBase" defaultValue={state.evidenceBase ?? ""} className={fieldClass()}>
                <option value="">Any evidence</option>
                <option value="No performance data">No data</option>
                <option value="First impressions">First impressions</option>
                <option value="Early tendency">Early tendency</option>
                <option value="Developing evidence">Developing evidence</option>
                <option value="Stronger evidence base">Stronger evidence</option>
              </select>
            </Field>
            <Field label="Rating">
              <select name="ratingStatus" defaultValue={state.ratingStatus ?? ""} className={fieldClass()}>
                <option value="">Any rating status</option>
                <option value="rated">Rated in period</option>
                <option value="unrated">No ratings in period</option>
              </select>
            </Field>
          </div>
        </details>
        <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-6">
          <Button type="submit">Apply filters</Button>
          <ButtonLink href={workspaceHref(state, { direction: state.direction === "asc" ? "desc" : "asc" })} variant="secondary">
            {state.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            {state.direction === "asc" ? "Ascending" : "Descending"}
          </ButtonLink>
          <ButtonLink href={workspaceHref({ ...state, view: "all", players: "active", availability: "all", period: "season", sort: "position", direction: "asc", search: "" }, { selectedPlayer: undefined })} variant="ghost">
            Reset
          </ButtonLink>
        </div>
      </form>
    </section>
  );
}

function WorkspaceTable({ data, players }: { data: WorkspaceData; players: WorkspacePlayerSummary[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-board-line bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <SortableTh data={data} sort="name">Player</SortableTh>
            <SortableTh data={data} sort="position">Position</SortableTh>
            <SortableTh data={data} sort="age">Age</SortableTh>
            <SortableTh data={data} sort="availability">Availability</SortableTh>
            <SortableTh data={data} sort="attendance">Attendance</SortableTh>
            <SortableTh data={data} sort="average">Average</SortableTh>
            <SortableTh data={data} sort="trend">Trend</SortableTh>
            <SortableTh data={data} sort="reliability">Reliability</SortableTh>
            <SortableTh data={data} sort="activeGoals">Development</SortableTh>
            <SortableTh data={data} sort="reviewDate">Review</SortableTh>
            <th className="px-3 py-3">Action</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => <WorkspaceRow key={player.analytics.player.id} data={data} player={player} />)}
        </tbody>
      </table>
    </div>
  );
}

function WorkspaceRow({ data, player }: { data: WorkspaceData; player: WorkspacePlayerSummary }) {
  const summary = player.analytics;
  const selected = data.selected?.analytics.player.id === summary.player.id;
  return (
    <tr aria-selected={selected} className={cn("border-b border-board-line align-top last:border-b-0", selected ? "bg-green-50/60" : "hover:bg-slate-50")}>
      <td className="px-3 py-3">
        <Link href={`/squad/players/${summary.player.id}`} className="font-bold text-board-navy underline-offset-4 hover:text-board-green hover:underline">
          {playerName(summary.player)}
        </Link>
        <div className="mt-1 flex flex-wrap gap-1">
          <Badge tone={summary.player.playerType === "trial" ? "amber" : "neutral"}>{summary.player.playerType === "trial" ? "Trial" : "Roster"}</Badge>
          {summary.player.archivedAt ? <Badge tone="amber">Archived</Badge> : null}
        </div>
      </td>
      <td className={cellClass(data, "position")}>
        <strong>{summary.player.position ?? "-"}</strong>
        {summary.player.secondaryPositions.length ? <p className="text-xs text-slate-500">Secondary: {summary.player.secondaryPositions.slice(0, 2).join(", ")}{summary.player.secondaryPositions.length > 2 ? ` +${summary.player.secondaryPositions.length - 2}` : ""}</p> : null}
      </td>
      <td className={cellClass(data, "age")}>{calculateAge(summary.player.dateOfBirth) ?? "-"}</td>
      <td className={cellClass(data, "availability")}>
        <StatusDot player={player} />
        <p className="mt-1 text-xs text-slate-500">{availabilityDetail(player)}</p>
      </td>
      <td className={cellClass(data, "attendance")}>
        <strong>{formatWorkspacePercent(summary.attendanceRate)}</strong>
        <p className="text-xs text-slate-500">{summary.attended} of {summary.trainings}</p>
      </td>
      <td className={cellClass(data, "average")}>
        <strong>{formatWorkspaceRating(summary.averageRating)}</strong>
        <p className="text-xs text-slate-500">{summary.rated} ratings</p>
      </td>
      <td className={cellClass(data, "trend")}>
        <strong>{summary.trend.value === null ? "-" : `${summary.trend.value > 0 ? "+" : ""}${summary.trend.value.toFixed(1)}`}</strong>
        <p className="text-xs text-slate-500">{summary.trend.label}</p>
      </td>
      <td className={cellClass(data, "reliability")}>
        <strong>{summary.reliabilityPenalty.toFixed(1)}</strong>
        <p className="text-xs text-slate-500">{summary.attendanceDistribution.lateCancellation} late cancel</p>
      </td>
      <td className={cellClass(data, "activeGoals")}>
        <strong>{player.activeGoals.length} active goals</strong>
        {player.activeGoals.some((goal) => goal.priority === "high") ? <p className="text-xs font-bold text-amber-700">High priority</p> : null}
      </td>
      <td className={cellClass(data, "reviewDate")}>
        <span className={cn("font-bold", toneText(player.review.tone))}>{player.review.label}</span>
      </td>
      <td className="px-3 py-3">
        <ButtonLink href={workspaceHref(data.state, { selectedPlayer: summary.player.id })} variant="secondary" className="h-8 px-2">Select</ButtonLink>
      </td>
    </tr>
  );
}

function WorkspaceMobileCard({ data, player }: { data: WorkspaceData; player: WorkspacePlayerSummary }) {
  const summary = player.analytics;
  const priority = mobileMetrics(data, player);
  return (
    <article className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-board-navy">{playerName(summary.player)}</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone={summary.player.playerType === "trial" ? "amber" : "neutral"}>{summary.player.playerType === "trial" ? "Trial" : "Roster"}</Badge>
            <Badge>{summary.player.position ?? "No position"}</Badge>
            <StatusDot player={player} compact />
          </div>
        </div>
        <Link href={`/squad/players/${summary.player.id}`} className="rounded-md bg-board-green px-3 py-2 text-sm font-bold text-white">Open</Link>
      </div>
      {player.attention.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {visibleAttention(player.attention).map((indicator) => <AttentionBadge key={indicator.id} indicator={indicator} />)}
          {hiddenAttentionCount(player.attention) ? <Badge tone="neutral">+{hiddenAttentionCount(player.attention)} more</Badge> : null}
        </div>
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-3">
        {priority.map((item) => (
          <div key={item.label} className="rounded-md bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase text-slate-500">{item.label}</p>
            <p className="mt-1 text-base font-bold text-board-navy">{item.value}</p>
            {item.detail ? <p className="mt-1 text-xs text-slate-500">{item.detail}</p> : null}
          </div>
        ))}
      </div>
    </article>
  );
}

function InspectorPanel({ player }: { player?: WorkspacePlayerSummary }) {
  if (!player) {
    return (
      <section className="rounded-lg border border-dashed border-board-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">Inspector</h2>
        <p className="mt-2 text-sm text-slate-600">Select a player to see a quick overview. Open the full Player Hub for complete Analytics, Development, Medical and History information.</p>
      </section>
    );
  }
  const summary = player.analytics;
  const observation = player.latestObservation;
  return (
    <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-board-navy">{playerName(summary.player)}</h2>
          <p className="mt-1 text-sm text-slate-600">{summary.player.position ?? "No position"} · {calculateAge(summary.player.dateOfBirth) ?? "-"} years · {summary.player.playerType === "trial" ? "Trial" : "Roster"}</p>
        </div>
        <UserRound className="h-5 w-5 text-board-green" />
      </div>
      <div className="mt-4 space-y-4">
        <InspectorSection title="Availability" icon={<Stethoscope className="h-4 w-4" />}>
          <StatusDot player={player} />
          <p className="mt-1 text-sm text-slate-600">{availabilityDetail(player)}</p>
        </InspectorSection>
        <InspectorSection title="Performance" icon={<BarChart3 className="h-4 w-4" />}>
          <InspectorGrid items={[
            ["Average", formatWorkspaceRating(summary.averageRating)],
            ["Rated", String(summary.rated)],
            ["Trend", summary.trend.value === null ? summary.trend.label : `${summary.trend.value > 0 ? "+" : ""}${summary.trend.value.toFixed(1)}`],
            ["Latest", summary.latestRating ? String(summary.latestRating) : "-"]
          ]} />
          <p className="mt-2 text-xs font-semibold text-slate-500">{summary.evidenceBase.label}</p>
        </InspectorSection>
        <InspectorSection title="Attendance" icon={<CalendarDays className="h-4 w-4" />}>
          <InspectorGrid items={[
            ["Attendance", formatWorkspacePercent(summary.attendanceRate)],
            ["Attended", `${summary.attended}/${summary.trainings}`],
            ["Reliability", summary.reliabilityPenalty.toFixed(1)],
            ["Late", String(summary.late)]
          ]} />
        </InspectorSection>
        <InspectorSection title="Development" icon={<Target className="h-4 w-4" />}>
          <p className="text-sm font-bold text-board-navy">{player.activeGoals.length} active goals</p>
          {player.activeGoals[0] ? <p className="mt-1 text-sm text-slate-600">{player.activeGoals[0].title} · {player.activeGoals[0].priority}</p> : <p className="mt-1 text-sm text-slate-600">No active goals.</p>}
          <p className={cn("mt-2 text-sm font-bold", toneText(player.review.tone))}>{player.review.label}</p>
          <p className="mt-2 text-sm text-slate-600">Assessment: {coachAssessmentLabels[summary.assessment?.assessment ?? "decision_open"]}</p>
        </InspectorSection>
        <InspectorSection title="Latest observation" icon={<Eye className="h-4 w-4" />}>
          {observation ? (
            <p className="text-sm text-slate-600">{formatEventDate(observation.observationDate)} · {observation.note.slice(0, 120)}{observation.note.length > 120 ? "..." : ""}</p>
          ) : (
            <p className="text-sm text-slate-600">No observation yet.</p>
          )}
        </InspectorSection>
        <InspectorSection title="Attention reasons" icon={<AlertTriangle className="h-4 w-4" />}>
          {player.attention.length ? (
            <div className="flex flex-wrap gap-2">{player.attention.map((indicator) => <AttentionBadge key={indicator.id} indicator={indicator} />)}</div>
          ) : (
            <p className="text-sm text-slate-600">No current attention indicators.</p>
          )}
        </InspectorSection>
        <div className="grid gap-2">
          <ButtonLink href={`/squad/players/${summary.player.id}`} className="justify-center">Open Player Hub</ButtonLink>
          <ButtonLink href={`/squad/players/${summary.player.id}?tab=development`} variant="secondary" className="justify-center">Add observation or goal</ButtonLink>
          <ButtonLink href={`/squad/players/${summary.player.id}?tab=medical`} variant="secondary" className="justify-center">Add injury or sickness</ButtonLink>
          <ButtonLink href={`/squad/players/${summary.player.id}?tab=analytics`} variant="secondary" className="justify-center">Update assessment</ButtonLink>
        </div>
      </div>
    </section>
  );
}

function WorkspaceEmpty({ data }: { data: WorkspaceData }) {
  const messages: Record<string, string> = {
    "trial-players": "No active Trial Players.",
    "reviews-due": "No player reviews are currently due.",
    unavailable: "All active players are currently available.",
    "needs-attention": "No players currently match the selected attention criteria."
  };
  const message = data.allPlayers.length ? messages[data.state.view] ?? "No players match your search and filters." : "No active players in the squad. Add a player to start building the Coach Workspace.";
  return (
    <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
      <h2 className="text-lg font-bold text-board-navy">Nothing to show</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">{message}</p>
      {!data.allPlayers.length ? <ButtonLink href="/squad/players/new" className="mt-5">Add player</ButtonLink> : null}
    </div>
  );
}

function SortableTh({ data, sort, children }: { data: WorkspaceData; sort: WorkspaceSortKey; children: React.ReactNode }) {
  const active = data.state.sort === sort;
  const direction = active && data.state.direction === "asc" ? "desc" : "asc";
  return (
    <th className={cn("px-3 py-3", active && "bg-green-50 text-board-green")} aria-sort={active ? (data.state.direction === "asc" ? "ascending" : "descending") : "none"}>
      <Link href={workspaceHref(data.state, { sort, direction })} className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
        {children}
        {active ? data.state.direction === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" /> : null}
      </Link>
    </th>
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

function StatusDot({ player, compact = false }: { player: WorkspacePlayerSummary; compact?: boolean }) {
  const medical = player.currentMedical;
  const tone = !medical ? "green" : medical.type === "injured" ? "red" : "amber";
  return (
    <span className={cn("inline-flex items-center gap-2 font-bold", compact ? "text-xs" : "text-sm", toneText(tone))}>
      <span className={cn("h-2.5 w-2.5 rounded-full", tone === "green" && "bg-green-600", tone === "amber" && "bg-amber-500", tone === "red" && "bg-red-500")} />
      {availabilityLabel(player)}
    </span>
  );
}

function AttentionBadge({ indicator }: { indicator: WorkspacePlayerSummary["attention"][number] }) {
  return <Badge tone={indicator.tone}>{indicator.label}</Badge>;
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

function InspectorSection({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-slate-100 pt-4 first:border-t-0 first:pt-0">
      <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">{icon}{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function InspectorGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-md bg-slate-50 p-2">
          <p className="text-[11px] font-bold uppercase text-slate-500">{label}</p>
          <p className="mt-1 text-sm font-bold text-board-navy">{value}</p>
        </div>
      ))}
    </div>
  );
}

function mobileMetrics(data: WorkspaceData, player: WorkspacePlayerSummary) {
  const summary = player.analytics;
  if (data.state.view === "performance") {
    return [
      { label: "Average", value: formatWorkspaceRating(summary.averageRating), detail: `${summary.rated} ratings` },
      { label: "Trend", value: summary.trend.value === null ? "-" : `${summary.trend.value > 0 ? "+" : ""}${summary.trend.value.toFixed(1)}`, detail: summary.trend.label },
      { label: "Latest", value: summary.latestRating ? String(summary.latestRating) : "-", detail: summary.evidenceBase.label },
      { label: "Attendance", value: formatWorkspacePercent(summary.attendanceRate), detail: `${summary.attended}/${summary.trainings}` }
    ];
  }
  if (data.state.view === "attendance") {
    return [
      { label: "Attendance", value: formatWorkspacePercent(summary.attendanceRate), detail: `${summary.attended}/${summary.trainings}` },
      { label: "Reliability", value: summary.reliabilityPenalty.toFixed(1), detail: `${summary.late} late` },
      { label: "Last training", value: summary.latestTraining?.event?.date ? formatEventDate(summary.latestTraining.event.date) : "-", detail: summary.latestTraining?.event?.label ?? "" },
      { label: "Availability", value: availabilityLabel(player), detail: availabilityDetail(player) }
    ];
  }
  if (data.state.view === "development" || data.state.view === "reviews-due") {
    return [
      { label: "Goals", value: String(player.activeGoals.length), detail: player.activeGoals.some((goal) => goal.priority === "high") ? "High priority" : "Active" },
      { label: "Review", value: player.review.label, detail: player.review.dueDate ? formatEventDate(player.review.dueDate) : "" },
      { label: "Assessment", value: coachAssessmentLabels[summary.assessment?.assessment ?? "decision_open"], detail: "" },
      { label: "Observation", value: player.latestObservation ? formatEventDate(player.latestObservation.observationDate) : "-", detail: "" }
    ];
  }
  return [
    { label: "Attendance", value: formatWorkspacePercent(summary.attendanceRate), detail: `${summary.attended}/${summary.trainings}` },
    { label: "Average", value: formatWorkspaceRating(summary.averageRating), detail: `${summary.rated} ratings` },
    { label: "Trend", value: summary.trend.value === null ? "-" : `${summary.trend.value > 0 ? "+" : ""}${summary.trend.value.toFixed(1)}`, detail: summary.trend.label },
    { label: "Review", value: player.review.label, detail: "" }
  ];
}

function cellClass(data: WorkspaceData, sort: WorkspaceSortKey) {
  return cn("px-3 py-3 text-slate-700", data.state.sort === sort && "bg-green-50/40 text-board-navy");
}

function toneText(tone: "red" | "amber" | "green" | "neutral") {
  if (tone === "red") return "text-red-700";
  if (tone === "amber") return "text-amber-700";
  if (tone === "green") return "text-green-700";
  return "text-slate-700";
}

function groupByPosition(players: WorkspacePlayerSummary[]) {
  return positionGroups.reduce<Record<(typeof positionGroups)[number], WorkspacePlayerSummary[]>>((acc, group) => {
    acc[group] = players.filter((player) => player.positionGroup === group);
    return acc;
  }, {
    Goalkeepers: [],
    Defenders: [],
    Midfielders: [],
    Attackers: [],
    Other: []
  });
}
