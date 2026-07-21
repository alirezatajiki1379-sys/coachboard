import { redirect } from "next/navigation";
import { Archive, CalendarOff, MapPin, Plus, RotateCcw, Save, Trash2, UsersRound } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import {
  archiveTeam,
  createTeam,
  createTeamCalendarExclusion,
  deleteTeamCalendarExclusion,
  renameTeam,
  restoreTeam,
  switchTeam,
  updateTeamCalendarSettings
} from "@/lib/squad/team-actions";
import { federalStateName, germanFederalStates } from "@/lib/squad/regional-calendar";
import { listAllTeams, listSquads } from "@/lib/squad/squads";
import { createClient } from "@/lib/supabase/server";
import type { Squad } from "@/types/domain";

type TeamsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TeamsPage({ searchParams }: TeamsPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [activeTeams, allTeams] = await Promise.all([
    listSquads(supabase, user.id),
    listAllTeams(supabase, user.id)
  ]);
  const activeTeam = activeTeams.find((team) => team.isActive) ?? activeTeams[0];
  const { data: exclusions } = await supabase
    .from("team_calendar_exclusions")
    .select("id,squad_id,name,category,starts_on,ends_on,reason,exclude_by_default")
    .eq("user_id", user.id)
    .order("starts_on", { ascending: true });
  const exclusionsByTeam = new Map<string, TeamCalendarExclusion[]>();
  for (const exclusion of (exclusions ?? []) as TeamCalendarExclusion[]) {
    const list = exclusionsByTeam.get(exclusion.squad_id) ?? [];
    list.push(exclusion);
    exclusionsByTeam.set(exclusion.squad_id, list);
  }

  return (
    <PageContainer width="standard">
      <PageHeader
        eyebrow="Teams"
        title="Team workspaces"
        description="Each Team has exactly one Squad/Roster. Switch Team here, then CoachBoard shows only that Team's players, trainings and planning context."
      />

      {params.error === "name" ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">Add a Team name first.</p>
      ) : null}
      {params.error === "location" ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">For German teams, choose the Bundesland so holidays and school breaks can be checked correctly.</p>
      ) : null}
      {params.error === "calendar" ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">Calendar settings could not be saved. Please check the highlighted values and try again.</p>
      ) : null}

      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <h2 className="flex items-center gap-2 text-lg font-bold text-board-navy"><Plus className="h-5 w-5" />Create new team</h2>
        <p className="mt-1 text-sm text-slate-500">Create a separate workspace for another team. CoachBoard creates the roster context automatically.</p>
        <form action={createTeam} className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_220px_auto]">
          <input type="hidden" name="returnTo" value="/dashboard" />
          <input type="hidden" name="countryCode" value="DE" />
          <label className="min-w-0 flex-1">
            <span className="text-sm font-medium text-slate-700">Team name</span>
            <input name="name" required placeholder="e.g. U14 Solingen" className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
          </label>
          <label>
            <span className="text-sm font-medium text-slate-700">Country</span>
            <select name="countryCodeDisplay" disabled defaultValue="DE" className="mt-1 h-11 w-full rounded-md border border-board-line bg-slate-50 px-3 text-board-navy">
              <option value="DE">Germany</option>
            </select>
          </label>
          <label>
            <span className="text-sm font-medium text-slate-700">Bundesland *</span>
            <select name="federalStateCode" required defaultValue="" className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
              <option value="" disabled>Choose Bundesland</option>
              {germanFederalStates.map((state) => (
                <option key={state.code} value={state.code}>{state.name}</option>
              ))}
            </select>
          </label>
          <label className="min-w-0">
            <span className="text-sm font-medium text-slate-700">City</span>
            <input name="city" placeholder="optional" className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
          </label>
          <Button type="submit" className="self-end">
            <Plus className="h-4 w-4" />
            Create team
          </Button>
        </form>
      </section>

      <section className="space-y-3">
        {allTeams.length ? (
          allTeams.map((team) => {
            const isCurrent = team.id === activeTeam?.id;
            const isArchived = Boolean(team.archivedAt);
            return (
              <article key={team.id} className={`rounded-lg border bg-white p-4 shadow-soft ${isCurrent ? "border-board-green/50" : "border-board-line"}`}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-board-green">{isCurrent ? "Active team" : isArchived ? "Archived" : "Team"}</p>
                    <h2 className="mt-1 flex items-center gap-2 text-xl font-bold text-board-navy">
                      <UsersRound className="h-5 w-5" />
                      <span className="truncate">{team.name}</span>
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">One Team workspace with one Squad/Roster.</p>
                    <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-board-paper px-3 py-1 text-xs font-semibold text-slate-600">
                      <MapPin className="h-3.5 w-3.5" />
                      {locationSummary(team)}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                    {!isArchived ? (
                      <form action={switchTeam}>
                        <input type="hidden" name="teamId" value={team.id} />
                        <input type="hidden" name="returnTo" value="/dashboard" />
                        <Button type="submit" variant={isCurrent ? "secondary" : "primary"} disabled={isCurrent} className="w-full sm:w-auto">
                          {isCurrent ? "Selected" : "Switch"}
                        </Button>
                      </form>
                    ) : null}
                    <form action={renameTeam} className="flex min-w-0 gap-2">
                      <input type="hidden" name="teamId" value={team.id} />
                      <input name="name" defaultValue={team.name} className="h-10 min-w-0 rounded-md border border-board-line px-3 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
                      <Button type="submit" variant="secondary" className="px-3">
                        <Save className="h-4 w-4" />
                        Rename
                      </Button>
                    </form>
                    {isArchived ? (
                      <form action={restoreTeam}>
                        <input type="hidden" name="teamId" value={team.id} />
                        <Button type="submit" variant="secondary" className="w-full sm:w-auto">
                          <RotateCcw className="h-4 w-4" />
                          Restore
                        </Button>
                      </form>
                    ) : (
                      <form action={archiveTeam}>
                        <input type="hidden" name="teamId" value={team.id} />
                        <Button type="submit" variant="danger" className="w-full sm:w-auto">
                          <Archive className="h-4 w-4" />
                          Archive
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
                <details className="mt-4 rounded-lg border border-board-line bg-board-paper p-4">
                  <summary className="cursor-pointer list-none text-sm font-bold text-board-navy">
                    Calendar rules and trainingsfreie Tage
                  </summary>
                  <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                    <form action={updateTeamCalendarSettings} className="rounded-lg border border-board-line bg-white p-4">
                      <input type="hidden" name="teamId" value={team.id} />
                      <h3 className="text-sm font-bold text-board-navy">Regional settings</h3>
                      <p className="mt-1 text-xs text-slate-500">CoachBoard checks public holidays automatically. Official school holidays appear only if they are stored as regional calendar data.</p>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <input type="hidden" name="countryCode" value="DE" />
                        <label>
                          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Country</span>
                          <select disabled defaultValue="DE" className="mt-1 h-10 w-full rounded-md border border-board-line bg-slate-50 px-3 text-sm text-board-navy">
                            <option value="DE">Germany</option>
                          </select>
                        </label>
                        <label>
                          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Bundesland *</span>
                          <select name="federalStateCode" required defaultValue={team.federalStateCode ?? ""} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
                            <option value="" disabled>Choose Bundesland</option>
                            {germanFederalStates.map((state) => (
                              <option key={state.code} value={state.code}>{state.name}</option>
                            ))}
                          </select>
                        </label>
                        <label className="md:col-span-2">
                          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">City / local area</span>
                          <input name="city" defaultValue={team.city ?? ""} placeholder="optional, e.g. Solingen" className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
                        </label>
                        <PreferenceSelect name="publicHolidays" label="Public holidays" value={preferenceValue(team, "publicHolidays", "ask")} options={holidayPreferenceOptions} />
                        <PreferenceSelect name="schoolHolidays" label="School holidays" value={preferenceValue(team, "schoolHolidays", "ask")} options={holidayPreferenceOptions} />
                        <PreferenceSelect name="localMovableHolidays" label="Local / movable days" value={preferenceValue(team, "localMovableHolidays", "confirmed_only")} options={localPreferenceOptions} />
                        <PreferenceSelect name="customExclusions" label="Custom exclusions" value={preferenceValue(team, "customExclusions", "exclude")} options={customPreferenceOptions} />
                      </div>
                      <Button type="submit" className="mt-4">
                        <Save className="h-4 w-4" />
                        Save calendar settings
                      </Button>
                    </form>

                    <div className="rounded-lg border border-board-line bg-white p-4">
                      <h3 className="flex items-center gap-2 text-sm font-bold text-board-navy"><CalendarOff className="h-4 w-4" />Team exclusions</h3>
                      <p className="mt-1 text-xs text-slate-500">Add local holidays, tournament weekends or team-created breaks. These can be used when generating recurring trainings.</p>
                      <form action={createTeamCalendarExclusion} className="mt-3 grid gap-2">
                        <input type="hidden" name="teamId" value={team.id} />
                        <input name="name" required placeholder="e.g. Osterferien camp week" className="h-10 rounded-md border border-board-line px-3 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
                        <div className="grid gap-2 sm:grid-cols-2">
                          <input name="startsOn" required type="date" className="h-10 rounded-md border border-board-line px-3 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
                          <input name="endsOn" type="date" className="h-10 rounded-md border border-board-line px-3 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
                        </div>
                        <select name="category" defaultValue="team_custom_exclusion" className="h-10 rounded-md border border-board-line px-3 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
                          <option value="team_custom_exclusion">Team custom exclusion</option>
                          <option value="local_customary_day">Local customary day</option>
                          <option value="movable_holiday">Movable holiday</option>
                        </select>
                        <input name="reason" placeholder="Reason/source note (optional)" className="h-10 rounded-md border border-board-line px-3 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                          <input name="excludeByDefault" value="true" type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300 text-board-green focus:ring-board-green" />
                          Suggest excluding this date
                        </label>
                        <Button type="submit" variant="secondary" className="justify-center">Add exclusion</Button>
                      </form>
                      <div className="mt-4 space-y-2">
                        {(exclusionsByTeam.get(team.id) ?? []).length ? (
                          (exclusionsByTeam.get(team.id) ?? []).map((exclusion) => (
                            <div key={exclusion.id} className="flex flex-col gap-2 rounded-md border border-board-line bg-board-paper p-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-sm font-bold text-board-navy">{exclusion.name}</p>
                                <p className="text-xs text-slate-500">{formatDateRange(exclusion.starts_on, exclusion.ends_on)} · {exclusion.category.replaceAll("_", " ")}</p>
                              </div>
                              <form action={deleteTeamCalendarExclusion}>
                                <input type="hidden" name="exclusionId" value={exclusion.id} />
                                <Button type="submit" variant="ghost" className="h-8 px-2 text-xs text-red-700 hover:bg-red-50">
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Remove
                                </Button>
                              </form>
                            </div>
                          ))
                        ) : (
                          <p className="rounded-md border border-dashed border-board-line bg-board-paper p-3 text-xs font-semibold text-slate-500">No team-specific exclusions yet.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </details>
              </article>
            );
          })
        ) : (
          <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
            <h2 className="text-lg font-bold text-board-navy">Create your first team</h2>
            <p className="mt-2 text-sm text-slate-600">Add a Team name above to create the first Squad/Roster workspace.</p>
          </div>
        )}
      </section>
    </PageContainer>
  );
}

type TeamCalendarExclusion = {
  id: string;
  squad_id: string;
  name: string;
  category: string;
  starts_on: string;
  ends_on: string;
  reason: string | null;
  exclude_by_default: boolean;
};

const holidayPreferenceOptions = [
  { value: "ask", label: "Ask during recurrence" },
  { value: "exclude", label: "Exclude by default" },
  { value: "keep", label: "Keep by default" }
];

const localPreferenceOptions = [
  { value: "confirmed_only", label: "Only confirmed local days" },
  { value: "ask", label: "Ask during recurrence" },
  { value: "exclude", label: "Exclude confirmed days" },
  { value: "keep", label: "Keep by default" }
];

const customPreferenceOptions = [
  { value: "exclude", label: "Exclude by default" },
  { value: "ask", label: "Ask during recurrence" },
  { value: "keep", label: "Keep by default" }
];

function PreferenceSelect({ name, label, value, options }: { name: string; label: string; value: string; options: Array<{ value: string; label: string }> }) {
  return (
    <label>
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <select name={name} defaultValue={value} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100">
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function preferenceValue(team: Squad, key: string, fallback: string) {
  const value = team.calendarPreferences?.[key];
  return typeof value === "string" ? value : fallback;
}

function locationSummary(team: Squad) {
  const parts = [team.countryCode === "DE" ? "Germany" : team.countryCode, federalStateName(team.federalStateCode), team.city].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No location set";
}

function formatDateRange(startsOn: string, endsOn: string) {
  if (startsOn === endsOn) return formatDate(startsOn);
  return `${formatDate(startsOn)} - ${formatDate(endsOn)}`;
}

function formatDate(date: string) {
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}.${month}.${year}` : date;
}
