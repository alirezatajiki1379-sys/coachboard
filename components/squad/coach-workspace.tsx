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
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import {
  createWorkspaceSavedView,
  deleteWorkspaceSavedView,
  duplicateWorkspaceSavedView,
  moveWorkspaceSavedView,
  renameWorkspaceSavedView,
  resetSystemWorkspaceOverride,
  saveSystemWorkspaceOverride,
  setDefaultWorkspaceView,
  updateWorkspaceSavedView
} from "@/lib/squad/workspace-actions";
import { coachAssessmentLabels, playerName } from "@/lib/squad/analytics";
import { formatEventDate } from "@/lib/squad/attendance-format";
import { calculateAge, formatPlayerBirthDate } from "@/lib/squad/format";
import { cn } from "@/lib/utils";
import {
  availabilityDetail,
  availabilityLabel,
  formatWorkspacePercent,
  formatWorkspaceRating,
  hiddenAttentionCount,
  quickViews,
  visibleAttention,
  workspaceColumns,
  workspaceHref,
  workspaceMobileMetrics,
  type WorkspaceData,
  type WorkspaceColumnDefinition,
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
  const grouped = groupWorkspacePlayers(data);

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
          <ButtonLink href={workspaceHref(data.state, { customize: true })} variant="secondary" className="justify-center">
            Customize columns
          </ButtonLink>
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

      <SavedViewsPanel data={data} />

      <WorkspaceFilters data={data} />

      {data.state.customize ? <CustomizeWorkspacePanel data={data} /> : null}

      <section className={cn("grid gap-6", data.configuration.inspectorMode === "open" && "xl:grid-cols-[minmax(0,1fr)_340px]")}>
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
                  {grouped.map((group) => (
                    <section key={group.label} className="rounded-lg border border-board-line bg-white shadow-soft">
                      <h3 className="border-b border-board-line px-4 py-3 text-sm font-bold uppercase tracking-wide text-slate-500">{group.label}</h3>
                      <WorkspaceTable data={data} players={group.players} />
                    </section>
                  ))}
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

        {data.configuration.inspectorMode === "open" ? <aside className="hidden xl:block">
          <div className="sticky top-6">
            <InspectorPanel player={data.selected} />
          </div>
        </aside> : null}
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

function SavedViewsPanel({ data }: { data: WorkspaceData }) {
  const savedViews = data.savedViews.filter((view) => view.kind === "saved");
  return (
    <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Saved Views</h2>
          <p className="mt-1 text-sm text-slate-600">
            {data.activeSavedView ? `${data.activeSavedView.name}${data.activeSavedView.isDefault ? " · Default" : ""}` : "Use system quick views or save the current workspace for repeated coaching tasks."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.activeSavedView ? (
            <form action={setDefaultWorkspaceView}>
              <input type="hidden" name="savedViewId" value={data.activeSavedView.id} />
              <Button type="submit" variant="secondary" className="h-9 px-3">Set as default</Button>
            </form>
          ) : (
            <form action={setDefaultWorkspaceView}>
              <input type="hidden" name="systemViewId" value={data.state.view} />
              <Button type="submit" variant="secondary" className="h-9 px-3">Set system view default</Button>
            </form>
          )}
        </div>
      </div>
      {savedViews.length ? (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {savedViews.map((view) => (
            <Link
              key={view.id}
              href={`/squad?savedView=${view.id}`}
              className={cn(
                "min-w-fit rounded-md px-3 py-2 text-sm font-bold transition",
                data.activeSavedView?.id === view.id ? "bg-board-green text-white" : "bg-slate-100 text-slate-700 hover:bg-green-50 hover:text-board-green"
              )}
            >
              {view.name}{view.isDefault ? " · Default" : ""}
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-dashed border-board-line p-4">
          <p className="text-sm font-semibold text-board-navy">No saved views yet.</p>
          <p className="mt-1 text-sm text-slate-600">Configure the Workspace for a recurring coaching task, then save it for faster access next time.</p>
        </div>
      )}
      {data.activeSavedView ? (
        <details className="mt-4 rounded-md bg-board-paper p-3">
          <summary className="cursor-pointer text-sm font-bold text-board-navy">Manage active saved view</summary>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <form action={renameWorkspaceSavedView} className="grid gap-2 rounded-md bg-white p-3">
              <input type="hidden" name="savedViewId" value={data.activeSavedView.id} />
              <Field label="Name"><input name="viewName" required maxLength={80} defaultValue={data.activeSavedView.name} className={fieldClass()} /></Field>
              <Field label="Description"><input name="viewDescription" defaultValue={data.activeSavedView.description ?? ""} className={fieldClass()} /></Field>
              <Button type="submit" variant="secondary" className="h-9">Rename</Button>
            </form>
            <div className="grid gap-2 rounded-md bg-white p-3">
              <form action={duplicateWorkspaceSavedView}>
                <input type="hidden" name="savedViewId" value={data.activeSavedView.id} />
                <Button type="submit" variant="secondary" className="h-9 w-full">Duplicate</Button>
              </form>
              <div className="grid grid-cols-2 gap-2">
                <form action={moveWorkspaceSavedView}>
                  <input type="hidden" name="savedViewId" value={data.activeSavedView.id} />
                  <input type="hidden" name="move" value="up" />
                  <Button type="submit" variant="secondary" className="h-9 w-full">Move up</Button>
                </form>
                <form action={moveWorkspaceSavedView}>
                  <input type="hidden" name="savedViewId" value={data.activeSavedView.id} />
                  <input type="hidden" name="move" value="down" />
                  <Button type="submit" variant="secondary" className="h-9 w-full">Move down</Button>
                </form>
              </div>
              <form action={deleteWorkspaceSavedView}>
                <input type="hidden" name="savedViewId" value={data.activeSavedView.id} />
                <ConfirmSubmitButton message={`Delete saved view "${data.activeSavedView.name}"? Player data is not changed.`} className="h-9 w-full">
                  Delete view
                </ConfirmSubmitButton>
                <p className="mt-1 text-xs text-slate-500">This removes only the saved layout. Player data is unchanged.</p>
              </form>
            </div>
          </div>
        </details>
      ) : null}
    </section>
  );
}

function CustomizeWorkspacePanel({ data }: { data: WorkspaceData }) {
  const config = data.configuration;
  const visibleSet = new Set(config.visibleColumns);
  const orderedColumns = [...workspaceColumns].sort((a, b) => {
    const aIndex = config.columnOrder.indexOf(a.id);
    const bIndex = config.columnOrder.indexOf(b.id);
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });
  const groupedColumns = groupColumnsByCategory(orderedColumns);
  const activeAction = data.activeSavedView ? updateWorkspaceSavedView : saveSystemWorkspaceOverride;
  return (
    <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-board-green">Customize View</p>
          <h2 className="mt-1 text-xl font-bold text-board-navy">{data.activeSavedView?.name ?? quickViews.find((view) => view.id === data.state.view)?.label ?? "System Quick View"}</h2>
          <p className="mt-1 text-sm text-slate-600">Customize presentation only. Player data, ratings, medical records and attendance are not changed.</p>
        </div>
        <ButtonLink href={workspaceHref(data.state, { customize: false })} variant="ghost" className="h-9 px-3">Cancel</ButtonLink>
      </div>

      <form action={activeAction} className="mt-5 space-y-6">
        <WorkspaceStateFields data={data} />
        {data.activeSavedView ? <input type="hidden" name="savedViewId" value={data.activeSavedView.id} /> : null}
        <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Visible Columns and Order</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {Object.entries(groupedColumns).map(([category, columns]) => (
                <div key={category} className="rounded-md border border-board-line p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">{category}</p>
                  <div className="mt-3 space-y-2">
                    {columns.map((column) => (
                      <div key={column.id} className="grid grid-cols-[1fr_76px] gap-2 rounded-md bg-slate-50 p-2">
                        <label className="flex gap-2 text-sm">
                          <input name={`column:${column.id}`} type="checkbox" defaultChecked={column.required || visibleSet.has(column.id)} disabled={column.required} className="mt-1 h-4 w-4" />
                          <span>
                            <span className="font-bold text-board-navy">{column.label}{column.required ? " · required" : ""}</span>
                            <span className="block text-xs text-slate-500">{column.description}</span>
                          </span>
                        </label>
                        <label>
                          <span className="sr-only">Order for {column.label}</span>
                          <input name={`order:${column.id}`} type="number" min="1" defaultValue={config.columnOrder.indexOf(column.id) + 1 || 99} className="h-9 w-full rounded-md border border-board-line px-2 text-sm" />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-md border border-board-line p-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Mobile card metrics</h3>
              <p className="mt-1 text-xs text-slate-500">Choose up to four. Player name, position, type and availability always stay visible.</p>
              <div className="mt-3 grid gap-2">
                {[0, 1, 2, 3].map((index) => (
                  <Field key={index} label={`Metric ${index + 1}`}>
                    <select name={`mobileMetric${index + 1}`} defaultValue={config.mobileMetrics[index] ?? ""} className={fieldClass()}>
                      <option value="">None</option>
                      {workspaceMobileMetrics.map((metric) => <option key={metric.id} value={metric.id}>{metric.label}</option>)}
                    </select>
                  </Field>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-board-line p-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Preferences</h3>
              <div className="mt-3 grid gap-3">
                <Field label="Table density">
                  <select name="density" defaultValue={config.density} className={fieldClass()}>
                    <option value="compact">Compact</option>
                    <option value="comfortable">Comfortable</option>
                  </select>
                </Field>
                <Field label="Inspector Panel">
                  <select name="inspectorMode" defaultValue={config.inspectorMode} className={fieldClass()}>
                    <option value="open">Open</option>
                    <option value="collapsed">Collapsed</option>
                  </select>
                </Field>
                <Field label="Grouping">
                  <select name="groupMode" defaultValue={config.groupMode} className={fieldClass()}>
                    <option value="none">None</option>
                    <option value="positionGroup">Position group</option>
                    <option value="playerType">Player type</option>
                  </select>
                </Field>
                <label className="inline-flex items-center gap-2 text-sm font-bold text-board-navy">
                  <input name="showAttentionIndicators" type="checkbox" defaultChecked={config.showAttentionIndicators} className="h-4 w-4" />
                  Show attention indicators
                </label>
                <label className="inline-flex items-center gap-2 text-sm font-bold text-board-navy">
                  <input name="setDefault" type="checkbox" defaultChecked={data.activeSavedView?.isDefault || data.systemOverride?.isDefault} className="h-4 w-4" />
                  Set as default view
                </label>
              </div>
            </div>

            {!data.activeSavedView ? (
              <div className="rounded-md border border-board-line p-3">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Save as new view</h3>
                <div className="mt-3 grid gap-2">
                  <Field label="View name"><input name="viewName" maxLength={80} className={fieldClass()} placeholder="Goalkeeper Review" /></Field>
                  <Field label="Description"><input name="viewDescription" className={fieldClass()} placeholder="Optional" /></Field>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <div className="flex flex-wrap gap-2 border-t border-board-line pt-4">
          <Button type="submit">{data.activeSavedView ? "Save changes" : "Save system view customization"}</Button>
          {!data.activeSavedView ? (
            <Button formAction={createWorkspaceSavedView} variant="secondary">Save as new view</Button>
          ) : (
            <Button formAction={createWorkspaceSavedView} variant="secondary">Save as new</Button>
          )}
          {data.activeSavedView ? null : <Button formAction={resetSystemWorkspaceOverride} variant="ghost">Reset to CoachBoard default</Button>}
          <ButtonLink href={workspaceHref(data.state, { customize: false })} variant="ghost">Cancel</ButtonLink>
        </div>
      </form>
    </section>
  );
}

function WorkspaceStateFields({ data }: { data: WorkspaceData }) {
  const state = data.state;
  return (
    <>
      <input type="hidden" name="view" value={state.view} />
      {state.savedView ? <input type="hidden" name="savedView" value={state.savedView} /> : null}
      <input type="hidden" name="players" value={state.players} />
      <input type="hidden" name="position" value={state.position ?? ""} />
      <input type="hidden" name="availability" value={state.availability} />
      <input type="hidden" name="period" value={state.period} />
      <input type="hidden" name="sort" value={state.sort} />
      <input type="hidden" name="direction" value={state.direction} />
      <input type="hidden" name="search" value={state.search} />
      <input type="hidden" name="selectedPlayer" value={state.selectedPlayer ?? ""} />
      <input type="hidden" name="coachAssessment" value={state.coachAssessment ?? ""} />
      <input type="hidden" name="developmentStatus" value={state.developmentStatus ?? ""} />
      <input type="hidden" name="reviewStatus" value={state.reviewStatus ?? ""} />
      <input type="hidden" name="evidenceBase" value={state.evidenceBase ?? ""} />
      <input type="hidden" name="ratingStatus" value={state.ratingStatus ?? ""} />
      <input type="hidden" name="from" value={state.customFrom ?? ""} />
      <input type="hidden" name="to" value={state.customTo ?? ""} />
    </>
  );
}

function WorkspaceTable({ data, players }: { data: WorkspaceData; players: WorkspacePlayerSummary[] }) {
  const columns = visibleDesktopColumns(data);
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[900px] w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-board-line bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            {columns.map((column) => column.sortable ? (
              <SortableTh key={column.id} data={data} sort={column.sortable}>{column.label}</SortableTh>
            ) : (
              <th key={column.id} className="px-3 py-3">{column.label}</th>
            ))}
            <th className="px-3 py-3">Action</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => <WorkspaceRow key={player.analytics.player.id} data={data} player={player} columns={columns} />)}
        </tbody>
      </table>
    </div>
  );
}

function WorkspaceRow({ data, player, columns }: { data: WorkspaceData; player: WorkspacePlayerSummary; columns: WorkspaceColumnDefinition[] }) {
  const summary = player.analytics;
  const selected = data.selected?.analytics.player.id === summary.player.id;
  return (
    <tr aria-selected={selected} className={cn("border-b border-board-line align-top last:border-b-0", selected ? "bg-green-50/60" : "hover:bg-slate-50")}>
      {columns.map((column) => <td key={column.id} className={cellClass(data, column.sortable)}>{renderColumnCell(column.id, data, player)}</td>)}
      <td className="px-3 py-3">
        <ButtonLink href={workspaceHref(data.state, { selectedPlayer: summary.player.id })} variant="secondary" className="h-8 px-2">Select</ButtonLink>
      </td>
    </tr>
  );
}

function WorkspaceMobileCard({ data, player }: { data: WorkspaceData; player: WorkspacePlayerSummary }) {
  const summary = player.analytics;
  const priority = data.configuration.mobileMetrics.map((metric) => mobileMetric(metric, player)).filter((item): item is NonNullable<typeof item> => Boolean(item)).slice(0, 4);
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
      {(data.configuration.showAttentionIndicators || data.state.view === "needs-attention") && player.attention.length ? (
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
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">{player.attention.map((indicator) => <AttentionBadge key={indicator.id} indicator={indicator} />)}</div>
              <ButtonLink href={`/actions?player=${summary.player.id}`} variant="secondary" className="h-9 justify-center px-3">Review in Action Center</ButtonLink>
            </div>
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

function visibleDesktopColumns(data: WorkspaceData) {
  const visible = new Set(data.configuration.visibleColumns);
  const byId = new Map(workspaceColumns.map((column) => [column.id, column]));
  const ordered = data.configuration.columnOrder
    .map((id) => byId.get(id))
    .filter((column): column is WorkspaceColumnDefinition => Boolean(column && (column.required || visible.has(column.id))));
  if (!ordered.some((column) => column.id === "player")) {
    const player = byId.get("player");
    if (player) ordered.unshift(player);
  }
  return ordered.length ? ordered : workspaceColumns.filter((column) => column.required || visible.has(column.id));
}

function renderColumnCell(columnId: WorkspaceColumnDefinition["id"], data: WorkspaceData, player: WorkspacePlayerSummary) {
  const summary = player.analytics;
  const record = summary.latestTraining;
  const medical = player.currentMedical;
  if (columnId === "player") {
    return (
      <div className="min-w-[190px]">
        <Link href={`/squad/players/${summary.player.id}`} className="font-bold text-board-navy hover:text-board-green">{playerName(summary.player)}</Link>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Badge tone={summary.player.playerType === "trial" ? "amber" : "neutral"}>{summary.player.playerType === "trial" ? "Trial" : "Roster"}</Badge>
          {(data.configuration.showAttentionIndicators || data.state.view === "needs-attention") && visibleAttention(player.attention).map((indicator) => <AttentionBadge key={indicator.id} indicator={indicator} />)}
        </div>
      </div>
    );
  }
  if (columnId === "position") return summary.player.position ?? "-";
  if (columnId === "secondaryPositions") return summary.player.secondaryPositions?.length ? summary.player.secondaryPositions.join(", ") : "-";
  if (columnId === "age") return calculateAge(summary.player.dateOfBirth) ?? "-";
  if (columnId === "dateOfBirth") return summary.player.dateOfBirth ? formatPlayerBirthDate(summary.player.dateOfBirth) : "-";
  if (columnId === "strongFoot") return summary.player.strongFoot ?? "-";
  if (columnId === "jerseyNumber") return summary.player.jerseyNumber ?? "-";
  if (columnId === "club") return summary.player.club ?? "-";
  if (columnId === "playerType") return summary.player.playerType === "trial" ? "Trial" : "Roster";
  if (columnId === "captainStatus") return summary.player.captainStatus && summary.player.captainStatus !== "none" ? summary.player.captainStatus.replace("_", " ") : "-";
  if (columnId === "joinedDate") return summary.player.joinedDate ? formatEventDate(summary.player.joinedDate) : "-";
  if (columnId === "archivedStatus") return summary.player.archivedAt ? `Archived ${formatEventDate(summary.player.archivedAt.slice(0, 10))}` : "Active";
  if (columnId === "availability") return <StatusDot player={player} compact />;
  if (columnId === "expectedReturn") return medical?.expectedReturnDate ? formatEventDate(medical.expectedReturnDate) : "-";
  if (columnId === "medicalReview") return medical && availabilityLabel(player) === "Needs review" ? "Needs review" : "-";
  if (columnId === "attendance") return formatWorkspacePercent(summary.attendanceRate);
  if (columnId === "attendedTrainings") return String(summary.attended);
  if (columnId === "relevantTrainings") return String(summary.trainings);
  if (columnId === "lastTraining") return record?.event?.date ? formatEventDate(record.event.date) : "-";
  if (columnId === "reliability") return summary.reliabilityPenalty.toFixed(1);
  if (columnId === "penalisedLateness") return String(summary.records.filter((item) => item.finalStatus === "Z" && item.latePenaltyApplied).length);
  if (columnId === "lateCancellations") return String(summary.attendanceDistribution.lateCancellation);
  if (columnId === "average") return formatWorkspaceRating(summary.averageRating);
  if (columnId === "latestRating") return summary.latestRating ? String(summary.latestRating) : "-";
  if (columnId === "trend") return summary.trend.value === null ? "-" : `${summary.trend.value > 0 ? "+" : ""}${summary.trend.value.toFixed(1)}`;
  if (columnId === "ratedTrainings") return String(summary.rated);
  if (columnId === "evidence") return summary.evidenceBase.label;
  if (columnId === "recentRatings") return recentRatings(summary);
  if (columnId === "activeGoals") return String(player.activeGoals.length);
  if (columnId === "goalPriority") return goalPriorityLabel(player);
  if (columnId === "review") return <span className={cn("font-bold", toneText(player.review.tone))}>{player.review.label}</span>;
  if (columnId === "coachAssessment") return coachAssessmentLabels[summary.assessment?.assessment ?? "decision_open"];
  if (columnId === "lastObservation") return player.latestObservation ? formatEventDate(player.latestObservation.observationDate) : "-";
  if (columnId === "observationAge") return player.latestObservation ? `${Math.max(0, daysBetween(player.latestObservation.observationDate, todayIso()))}d` : "-";
  if (columnId === "trialDuration") return summary.player.playerType === "trial" ? `${Math.max(0, daysBetween((summary.player.joinedDate ?? summary.player.createdAt).slice(0, 10), todayIso()))}d` : "-";
  if (columnId === "trialTrainings") return summary.player.playerType === "trial" ? String(summary.attended) : "-";
  if (columnId === "trialRatedTrainings") return summary.player.playerType === "trial" ? String(summary.rated) : "-";
  if (columnId === "trialDecision") return summary.player.playerType === "trial" ? coachAssessmentLabels[summary.assessment?.assessment ?? "decision_open"] : "-";
  return "-";
}

function mobileMetric(metricId: string, player: WorkspacePlayerSummary) {
  const summary = player.analytics;
  if (metricId === "average") return { label: "Average", value: formatWorkspaceRating(summary.averageRating), detail: `${summary.rated} ratings` };
  if (metricId === "trend") return { label: "Trend", value: summary.trend.value === null ? "-" : `${summary.trend.value > 0 ? "+" : ""}${summary.trend.value.toFixed(1)}`, detail: summary.trend.label };
  if (metricId === "attendance") return { label: "Attendance", value: formatWorkspacePercent(summary.attendanceRate), detail: `${summary.attended}/${summary.trainings}` };
  if (metricId === "reliability") return { label: "Reliability", value: summary.reliabilityPenalty.toFixed(1), detail: `${summary.late} late` };
  if (metricId === "latestRating") return { label: "Latest", value: summary.latestRating ? String(summary.latestRating) : "-", detail: summary.evidenceBase.label };
  if (metricId === "ratedTrainings") return { label: "Rated", value: String(summary.rated), detail: "Trainings" };
  if (metricId === "evidence") return { label: "Evidence", value: summary.evidenceBase.label, detail: "" };
  if (metricId === "activeGoals") return { label: "Goals", value: String(player.activeGoals.length), detail: player.activeGoals.some((goal) => goal.priority === "high") ? "High priority" : "Active" };
  if (metricId === "goalPriority") return { label: "Goal priority", value: goalPriorityLabel(player), detail: "" };
  if (metricId === "review") return { label: "Review", value: player.review.label, detail: player.review.dueDate ? formatEventDate(player.review.dueDate) : "" };
  if (metricId === "coachAssessment") return { label: "Assessment", value: coachAssessmentLabels[summary.assessment?.assessment ?? "decision_open"], detail: "" };
  if (metricId === "lastObservation") return { label: "Observation", value: player.latestObservation ? formatEventDate(player.latestObservation.observationDate) : "-", detail: "" };
  if (metricId === "expectedReturn") return { label: "Expected return", value: player.currentMedical?.expectedReturnDate ? formatEventDate(player.currentMedical.expectedReturnDate) : "-", detail: availabilityDetail(player) };
  if (metricId === "trialDuration") return { label: "Trial duration", value: summary.player.playerType === "trial" ? `${Math.max(0, daysBetween((summary.player.joinedDate ?? summary.player.createdAt).slice(0, 10), todayIso()))}d` : "-", detail: "" };
  return null;
}

function cellClass(data: WorkspaceData, sort?: WorkspaceSortKey) {
  return cn(
    "px-3 text-slate-700",
    data.configuration.density === "comfortable" ? "py-4" : "py-3",
    sort && data.state.sort === sort && "bg-green-50/40 text-board-navy"
  );
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

function groupWorkspacePlayers(data: WorkspaceData) {
  if (data.configuration.groupMode === "none") return null;
  if (data.configuration.groupMode === "playerType") {
    return [
      { label: "Roster players", players: data.players.filter((player) => player.analytics.player.playerType === "roster") },
      { label: "Trial players", players: data.players.filter((player) => player.analytics.player.playerType === "trial") }
    ].filter((group) => group.players.length);
  }
  const grouped = groupByPosition(data.players);
  return positionGroups.map((label) => ({ label, players: grouped[label] })).filter((group) => group.players.length);
}

function groupColumnsByCategory(columns: WorkspaceColumnDefinition[]) {
  return columns.reduce<Record<string, WorkspaceColumnDefinition[]>>((acc, column) => {
    acc[column.category] = [...(acc[column.category] ?? []), column];
    return acc;
  }, {});
}

function recentRatings(summary: WorkspacePlayerSummary["analytics"]) {
  const values = summary.records
    .map((record) => record.overallRating)
    .filter((rating): rating is number => typeof rating === "number")
    .slice(0, 5);
  return values.length ? values.join(" · ") : "-";
}

function goalPriorityLabel(player: WorkspacePlayerSummary) {
  if (player.activeGoals.some((goal) => goal.priority === "high")) return "High";
  if (player.activeGoals.some((goal) => goal.priority === "medium")) return "Medium";
  if (player.activeGoals.some((goal) => goal.priority === "low")) return "Low";
  return "-";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}
