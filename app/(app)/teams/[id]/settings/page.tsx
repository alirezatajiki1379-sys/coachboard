import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FileSpreadsheet, MapPin, Plus, Save, UsersRound } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Button, ButtonLink } from "@/components/ui/button";
import { renameTeam, switchTeam, updateTeamCalendarSettings } from "@/lib/squad/team-actions";
import { federalStateName, germanFederalStates } from "@/lib/squad/regional-calendar";
import { mapSquadRow } from "@/lib/squad/squads";
import { createClient } from "@/lib/supabase/server";
import type { Squad } from "@/types/domain";

type TeamSettingsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type SquadPlayerCountRow = {
  id: string;
  player_type: "roster" | "trial";
  position: string | null;
  archived_at: string | null;
  deleted_at: string | null;
};

export default async function TeamSettingsPage({ params, searchParams }: TeamSettingsPageProps) {
  const [{ id }, rawSearchParams] = await Promise.all([params, searchParams]);
  const tab = rawSearchParams.tab === "squad" ? "squad" : "general";
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: teamRow, error: teamError } = await supabase
    .from("squads")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (teamError) throw new Error(teamError.message);
  if (!teamRow) notFound();

  const team = mapSquadRow(teamRow);
  const counts = await getSquadCounts(supabase, user.id, team.id);

  return (
    <PageContainer width="standard">
      <PageHeader
        eyebrow="Team settings"
        title={team.name}
        description="Edit this Team and manage the one Squad that belongs to it."
        metadata={locationSummary(team)}
        actions={(
          <>
            <ButtonLink href="/teams" variant="secondary" className="justify-center">Manage teams</ButtonLink>
            {team.isActive ? (
              <ButtonLink href="/squad" className="justify-center">
                <UsersRound className="h-4 w-4" />
                Open Squad
              </ButtonLink>
            ) : (
              <SwitchTeamButton team={team} returnTo="/squad" label="Switch and open Squad" />
            )}
          </>
        )}
      />

      <nav className="flex flex-wrap gap-2 rounded-lg border border-board-line bg-white p-2 shadow-soft" aria-label="Team settings sections">
        <SettingsTab href={`/teams/${team.id}/settings`} active={tab === "general"}>General</SettingsTab>
        <SettingsTab href={`/teams/${team.id}/settings?tab=squad`} active={tab === "squad"}>Squad</SettingsTab>
      </nav>

      {tab === "general" ? <GeneralSettings team={team} /> : <SquadSettings team={team} counts={counts} />}
    </PageContainer>
  );
}

function SettingsTab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-2 text-sm font-bold transition ${active ? "bg-board-green text-white" : "text-slate-600 hover:bg-green-50 hover:text-board-green"}`}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}

function GeneralSettings({ team }: { team: Squad }) {
  return (
    <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <h2 className="text-lg font-bold text-board-navy">General</h2>
      <p className="mt-1 text-sm text-slate-600">These settings apply only to this Team.</p>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form action={renameTeam} className="rounded-lg border border-board-line bg-board-paper p-4">
          <input type="hidden" name="teamId" value={team.id} />
          <input type="hidden" name="returnTo" value={`/teams/${team.id}/settings`} />
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Team name</span>
            <input
              name="name"
              required
              defaultValue={team.name}
              className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
            />
          </label>
          <Button type="submit" className="mt-4">
            <Save className="h-4 w-4" />
            Save team name
          </Button>
        </form>

        <form action={updateTeamCalendarSettings} className="rounded-lg border border-board-line bg-board-paper p-4">
          <input type="hidden" name="teamId" value={team.id} />
          <input type="hidden" name="returnTo" value={`/teams/${team.id}/settings`} />
          <input type="hidden" name="countryCode" value="DE" />
          <h3 className="font-bold text-board-navy">Location and calendar</h3>
          <p className="mt-1 text-sm text-slate-600">Used for regional calendar checks when creating recurring Trainings.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
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
                {germanFederalStates.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
              </select>
            </label>
            <label className="md:col-span-2">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">City / municipality</span>
              <input name="city" defaultValue={team.city ?? ""} placeholder="optional, e.g. Solingen" className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
            </label>
            <input type="hidden" name="publicHolidays" value={preferenceValue(team, "publicHolidays", "ask")} />
            <input type="hidden" name="schoolHolidays" value={preferenceValue(team, "schoolHolidays", "ask")} />
            <input type="hidden" name="localMovableHolidays" value={preferenceValue(team, "localMovableHolidays", "confirmed_only")} />
            <input type="hidden" name="customExclusions" value={preferenceValue(team, "customExclusions", "exclude")} />
          </div>
          <Button type="submit" className="mt-4">
            <MapPin className="h-4 w-4" />
            Save location
          </Button>
        </form>
      </div>
    </section>
  );
}

function SquadSettings({ team, counts }: { team: Squad; counts: Awaited<ReturnType<typeof getSquadCounts>> }) {
  return (
    <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <h2 className="flex items-center gap-2 text-lg font-bold text-board-navy">
        <UsersRound className="h-5 w-5" />
        Squad
      </h2>
      <p className="mt-1 text-sm text-slate-600">Manage the Players belonging to {team.name}. Each Team has exactly one Squad.</p>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Stat label="Active Players" value={counts.active} />
        <Stat label="Roster Players" value={counts.roster} />
        <Stat label="Trial Players" value={counts.trial} />
        <Stat label="Archived Players" value={counts.archived} />
        <Stat label="Without Position" value={counts.withoutPosition} tone={counts.withoutPosition ? "amber" : "neutral"} />
      </div>

      {counts.active ? null : (
        <div className="mt-5 rounded-lg border border-dashed border-board-line bg-board-paper p-5 text-center">
          <h3 className="font-bold text-board-navy">No Players in this Squad yet.</h3>
          <p className="mt-1 text-sm text-slate-600">Add Players manually or import the Team roster.</p>
        </div>
      )}

      {counts.withoutPosition ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          {counts.withoutPosition} Player{counts.withoutPosition === 1 ? "" : "s"} do not have a primary position.
          <Link href="/squad?players=active&position=&view=all" className="ml-2 underline underline-offset-4">Review positions</Link>
        </div>
      ) : null}

      {team.isActive ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <ButtonLink href="/squad" className="justify-center">
            <UsersRound className="h-4 w-4" />
            Open Squad
          </ButtonLink>
          <ButtonLink href="/squad/players/new" variant="secondary" className="justify-center">
            <Plus className="h-4 w-4" />
            Add Player
          </ButtonLink>
          <ButtonLink href="/squad/import" variant="secondary" className="justify-center">
            <FileSpreadsheet className="h-4 w-4" />
            Import Players
          </ButtonLink>
          <ButtonLink href="/squad?players=archived" variant="ghost" className="justify-center">Archived Players</ButtonLink>
          <ButtonLink href="/squad?players=trash" variant="ghost" className="justify-center">Player Trash</ButtonLink>
          <ButtonLink href="/squad?players=trial" variant="ghost" className="justify-center">Trial Players</ButtonLink>
        </div>
      ) : (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Switch to {team.name} before opening or editing its Squad.</p>
          <div className="mt-3">
            <SwitchTeamButton team={team} returnTo="/squad" label="Switch and open Squad" />
          </div>
        </div>
      )}
    </section>
  );
}

function SwitchTeamButton({ team, returnTo, label }: { team: Squad; returnTo: string; label: string }) {
  return (
    <form action={switchTeam}>
      <input type="hidden" name="teamId" value={team.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <Button type="submit">
        <UsersRound className="h-4 w-4" />
        {label}
      </Button>
    </form>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "amber" }) {
  return (
    <div className={`rounded-lg p-4 ${tone === "amber" ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-board-navy"}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

async function getSquadCounts(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, teamId: string) {
  const { data, error } = await supabase
    .from("squad_players")
    .select("id,player_type,position,archived_at,deleted_at")
    .eq("user_id", userId)
    .eq("squad_id", teamId);
  if (error) throw new Error(error.message);
  const players = (data ?? []) as SquadPlayerCountRow[];
  const active = players.filter((player) => !player.archived_at && !player.deleted_at);
  return {
    active: active.length,
    roster: active.filter((player) => player.player_type === "roster").length,
    trial: active.filter((player) => player.player_type === "trial").length,
    archived: players.filter((player) => player.archived_at && !player.deleted_at).length,
    withoutPosition: active.filter((player) => !player.position).length
  };
}

function preferenceValue(team: Squad, key: string, fallback: string) {
  const value = team.calendarPreferences?.[key];
  return typeof value === "string" ? value : fallback;
}

function locationSummary(team: Squad) {
  const parts = [team.countryCode === "DE" ? "Germany" : team.countryCode, federalStateName(team.federalStateCode), team.city].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No location set";
}
