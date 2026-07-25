"use client";

import { useMemo, useState, useTransition, type TransitionStartFunction } from "react";
import { useRouter } from "next/navigation";
import { Shield, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addPlayersToTrainingGroupInline, createTrainingGroupWithPlayersInline } from "@/lib/squad/training-group-actions";
import {
  formatPositionAbbreviation,
  getPositionFamily,
  normalizePosition,
  positionFamilyMeta,
  positionFamilyOrder,
  type PositionFamily
} from "@/lib/squad/positions";
import { cn } from "@/lib/utils";

export type SessionBoardPlayer = {
  id: string;
  name: string;
  position?: string;
  secondaryPositions: string[];
  playerType: "roster" | "trial";
  plannedStatus?: "expected" | "unavailable" | "unclear";
  finalStatus?: "present" | "absent" | "Z" | "V" | "K" | "E" | "P" | "S" | "U";
};

export type SessionBoardGroup = {
  id: string;
  name: string;
  groupType: "exclusive" | "label";
  members: Array<{
    id: string;
    playerId?: string;
    customName?: string;
  }>;
};

type BoardFilter = "all" | "presentLate" | "confirmed" | "trial" | "guest" | "unassigned";

type SessionPlayerBoardProps = {
  eventId: string;
  players: SessionBoardPlayer[];
  groups: SessionBoardGroup[];
};

const filterLabels: Record<BoardFilter, string> = {
  all: "All",
  presentLate: "Present + Late",
  confirmed: "Confirmed",
  trial: "Trial",
  guest: "Guest",
  unassigned: "Unassigned"
};

export function SessionPlayerBoard({ eventId, players, groups }: SessionPlayerBoardProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<BoardFilter>("all");
  const [targetGroupId, setTargetGroupId] = useState(groups[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const groupByPlayerId = useMemo(() => buildGroupLabels(groups), [groups]);
  const customMembers = groups.flatMap((group) =>
    group.members.filter((member) => member.customName).map((member) => ({ ...member, groupName: group.name }))
  );
  const visiblePlayers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return players.filter((player) => {
      const groupLabels = groupByPlayerId.get(player.id) ?? [];
      const matchesSearch = !needle || [player.name, player.position, ...player.secondaryPositions, ...groupLabels].filter(Boolean).join(" ").toLowerCase().includes(needle);
      if (!matchesSearch) return false;
      if (filter === "presentLate") return player.finalStatus === "present" || player.finalStatus === "Z";
      if (filter === "confirmed") return !player.plannedStatus || player.plannedStatus === "expected";
      if (filter === "trial") return player.playerType === "trial";
      if (filter === "guest") return false;
      if (filter === "unassigned") return resolvedPositionFamily(player) === "unassigned";
      return true;
    });
  }, [filter, groupByPlayerId, players, search]);
  const groupedPlayers = useMemo(() => {
    const map = new Map<PositionFamily, SessionBoardPlayer[]>();
    for (const family of positionFamilyOrder) map.set(family, []);
    for (const player of visiblePlayers) {
      const family = resolvedPositionFamily(player);
      map.set(family, [...(map.get(family) ?? []), player]);
    }
    return map;
  }, [visiblePlayers]);
  const counts = useMemo(() => calculateCounts(players, customMembers.length), [customMembers.length, players]);
  const selectedCount = selectedIds.length;
  const allVisibleSelected = visiblePlayers.length > 0 && visiblePlayers.every((player) => selectedIds.includes(player.id));

  function togglePlayer(playerId: string) {
    setSelectedIds((current) => current.includes(playerId) ? current.filter((id) => id !== playerId) : [...current, playerId]);
  }

  function selectAllVisible() {
    const visibleIds = visiblePlayers.map((player) => player.id);
    setSelectedIds((current) => Array.from(new Set([...current, ...visibleIds])));
  }

  function addSelectedToGroup() {
    if (!targetGroupId || !selectedIds.length) {
      setMessage("Choose Players and a group first.");
      return;
    }
    const formData = new FormData();
    formData.set("eventId", eventId);
    formData.set("groupId", targetGroupId);
    for (const playerId of selectedIds) formData.append("playerIds", playerId);
    startTransition(async () => {
      const result = await addPlayersToTrainingGroupInline(formData);
      setMessage(result.message);
      if (result.ok) {
        setSelectedIds([]);
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft lg:sticky lg:top-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-board-navy">Session Players</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">Automatic participant board from this Training.</p>
        </div>
        <UsersRound className="mt-1 h-5 w-5 text-board-green" />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <CountPill label="Expected" value={counts.expected} />
        <CountPill label="Confirmed" value={counts.confirmed} />
        <CountPill label="Present" value={counts.present} />
        <CountPill label="Late" value={counts.late} />
        <CountPill label="Roster" value={counts.roster} />
        <CountPill label="Trial" value={counts.trial} />
        <CountPill label="Guest" value={counts.guest} />
        <CountPill label="GK" value={counts.goalkeeper} />
        <CountPill label="Unassigned" value={counts.unassigned} tone={counts.unassigned ? "warning" : "normal"} />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-1 text-center text-[11px] font-bold">
        <FamilyCount family="goalkeeper" count={counts.goalkeeper} />
        <FamilyCount family="defensive" count={counts.defensive} />
        <FamilyCount family="midfield" count={counts.midfield} />
        <FamilyCount family="attacking" count={counts.attacking} />
      </div>

      <div className="mt-4 space-y-2">
        <label className="block">
          <span className="sr-only">Search Players</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search Players"
            className="h-9 w-full rounded-md border border-board-line px-3 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
          />
        </label>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(filterLabels) as BoardFilter[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={cn(
                "rounded-full px-2 py-1 text-[11px] font-bold transition",
                filter === item ? "bg-board-green text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {filterLabels[item]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-md border border-board-line bg-board-paper p-3">
        <p className="text-sm font-bold text-board-navy">{selectedCount} Player{selectedCount === 1 ? "" : "s"} selected</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={allVisibleSelected ? () => setSelectedIds([]) : selectAllVisible} className="h-8 px-2 text-xs">
            {allVisibleSelected ? "Clear visible" : "Select all visible"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setSelectedIds([])} className="h-8 px-2 text-xs">Clear selection</Button>
        </div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row lg:flex-col">
          <select
            value={targetGroupId}
            onChange={(event) => setTargetGroupId(event.target.value)}
            className="h-9 min-w-0 flex-1 rounded-md border border-board-line px-2 text-sm text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
          >
            <option value="">Choose group</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            <option value="__create__">+ Create new group</option>
          </select>
          {targetGroupId === "__create__" ? (
            <CreateGroupInline eventId={eventId} selectedIds={selectedIds} defaultName={`Group ${groups.length + 1}`} isPending={isPending} startTransition={startTransition} setMessage={setMessage} setSelectedIds={setSelectedIds} />
          ) : (
            <Button type="button" onClick={addSelectedToGroup} disabled={isPending || !selectedCount || !targetGroupId} className="h-9 px-3 text-xs">
              {isPending ? "Adding..." : "Add to group"}
            </Button>
          )}
        </div>
        {message ? <p className="mt-2 text-xs font-semibold text-slate-600" aria-live="polite">{message}</p> : null}
      </div>

      <div className="mt-4 max-h-[42rem] space-y-3 overflow-y-auto pr-1">
        {positionFamilyOrder.map((family) => {
          const sectionPlayers = groupedPlayers.get(family) ?? [];
          if (!sectionPlayers.length) return null;
          const meta = positionFamilyMeta[family];
          return (
            <section key={family} aria-labelledby={`position-${family}`}>
              <h3 id={`position-${family}`} className="mb-1 flex items-center justify-between text-[11px] font-black uppercase tracking-wide text-slate-500">
                <span>{family === "goalkeeper" ? <Shield className="mr-1 inline h-3.5 w-3.5" /> : null}{meta.sectionLabel}</span>
                <span>{sectionPlayers.length}</span>
              </h3>
              <div className="space-y-1.5">
                {sectionPlayers.map((player) => (
                  <PlayerChip
                    key={player.id}
                    player={player}
                    selected={selectedIds.includes(player.id)}
                    groupLabels={groupByPlayerId.get(player.id) ?? []}
                    unassigned={resolvedPositionFamily(player) === "unassigned"}
                    onToggle={() => togglePlayer(player.id)}
                  />
                ))}
              </div>
            </section>
          );
        })}
        {customMembers.length ? (
          <section aria-labelledby="custom-members">
            <h3 id="custom-members" className="mb-1 text-[11px] font-black uppercase tracking-wide text-slate-500">Guests and custom members · {customMembers.length}</h3>
            <div className="space-y-1.5">
              {customMembers.map((member) => (
                <div key={member.id} className="rounded-md border border-dashed border-purple-200 bg-purple-50 px-2 py-1.5 text-xs">
                  <p className="font-bold text-board-navy">{member.customName}</p>
                  <p className="mt-0.5 font-semibold text-purple-700">GUEST · {member.groupName}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {groups.length ? (
        <div className="mt-4 space-y-2 border-t border-board-line pt-4">
          <h3 className="text-sm font-bold text-board-navy">Group balance</h3>
          {groups.map((group) => <GroupBalance key={group.id} group={group} players={players} />)}
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-dashed border-board-line p-3 text-sm text-slate-600">
          <p>No groups created yet.</p>
          <button type="button" onClick={() => setTargetGroupId("__create__")} className="mt-2 text-sm font-bold text-board-green hover:underline">Create first group</button>
        </div>
      )}
    </section>
  );
}

function calculateCounts(sourcePlayers: SessionBoardPlayer[], guestCount: number) {
  const present = sourcePlayers.filter((player) => player.finalStatus === "present").length;
  const late = sourcePlayers.filter((player) => player.finalStatus === "Z").length;
  return {
    expected: sourcePlayers.length,
    confirmed: sourcePlayers.filter((player) => !player.plannedStatus || player.plannedStatus === "expected").length,
    present,
    late,
    roster: sourcePlayers.filter((player) => player.playerType === "roster").length,
    trial: sourcePlayers.filter((player) => player.playerType === "trial").length,
    guest: guestCount,
    unassigned: sourcePlayers.filter((player) => resolvedPositionFamily(player) === "unassigned").length,
    goalkeeper: sourcePlayers.filter((player) => resolvedPositionFamily(player) === "goalkeeper").length,
    defensive: sourcePlayers.filter((player) => resolvedPositionFamily(player) === "defensive").length,
    midfield: sourcePlayers.filter((player) => resolvedPositionFamily(player) === "midfield").length,
    attacking: sourcePlayers.filter((player) => resolvedPositionFamily(player) === "attacking").length
  };
}

function CreateGroupInline({
  eventId,
  selectedIds,
  defaultName,
  isPending,
  startTransition,
  setMessage,
  setSelectedIds
}: {
  eventId: string;
  selectedIds: string[];
  defaultName: string;
  isPending: boolean;
  startTransition: TransitionStartFunction;
  setMessage: (message: string) => void;
  setSelectedIds: (ids: string[]) => void;
}) {
  const [name, setName] = useState(defaultName);
  const router = useRouter();
  function createGroup() {
    const formData = new FormData();
    formData.set("eventId", eventId);
    formData.set("name", name.trim() || defaultName);
    formData.set("groupType", "exclusive");
    for (const playerId of selectedIds) formData.append("playerIds", playerId);
    startTransition(async () => {
      const result = await createTrainingGroupWithPlayersInline(formData);
      setMessage(result.message);
      if (result.ok) {
        setSelectedIds([]);
        router.refresh();
      }
    });
  }
  return (
    <div className="grid gap-2 rounded-md border border-board-line bg-white p-2">
      <label className="text-xs font-bold uppercase text-slate-500">
        Group name
        <input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-board-line px-2 text-sm normal-case text-board-navy outline-none focus:border-board-green focus:ring-4 focus:ring-green-100" />
      </label>
      <Button type="button" onClick={createGroup} disabled={isPending || !name.trim()} className="h-9 px-3 text-xs">
        {selectedIds.length ? `Create and add ${selectedIds.length}` : "Create group"}
      </Button>
    </div>
  );
}

function PlayerChip({ player, selected, groupLabels, unassigned, onToggle }: { player: SessionBoardPlayer; selected: boolean; groupLabels: string[]; unassigned: boolean; onToggle: () => void }) {
  const position = resolveBoardPosition(player);
  const family = getPositionFamily(position);
  const meta = positionFamilyMeta[family];
  const status = player.finalStatus ? finalStatusShort(player.finalStatus) : plannedStatusShort(player.plannedStatus);
  const secondary = player.secondaryPositions.filter(Boolean).slice(0, 2).map(formatPositionAbbreviation);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      aria-label={`${player.name}, ${meta.label}, ${player.playerType === "trial" ? "Trial Player" : "Roster Player"}, ${status}${groupLabels.length ? `, assigned to ${groupLabels.join(", ")}` : ", unassigned"}`}
      className={cn(
        "w-full rounded-md border px-2 py-1.5 text-left transition focus:outline-none focus:ring-4 focus:ring-green-100",
        meta.chipClassName,
        selected ? "ring-2 ring-board-green" : "hover:border-board-green",
        player.finalStatus && !["present", "Z"].includes(player.finalStatus) ? "opacity-70" : ""
      )}
    >
      <span className="flex items-center gap-1.5">
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-black", meta.badgeClassName)}>{formatPositionAbbreviation(position)}</span>
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-board-navy">{player.name}</span>
        {player.playerType === "trial" ? <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-black text-purple-700">TRIAL</span> : null}
        <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">{status}</span>
      </span>
      <span className="mt-1 flex flex-wrap items-center gap-1 text-[10px] font-semibold text-slate-500">
        {secondary.length ? <span>{secondary.join(" · ")}</span> : null}
        {groupLabels.length ? <span>{groupLabels.join(" · ")}</span> : unassigned ? <span>Unassigned</span> : null}
      </span>
    </button>
  );
}

function CountPill({ label, value, tone = "normal" }: { label: string; value: number; tone?: "normal" | "warning" }) {
  return (
    <div className={cn("rounded-md border px-2 py-1.5", tone === "warning" ? "border-amber-200 bg-amber-50" : "border-board-line bg-board-paper")}>
      <p className="text-[10px] font-black uppercase text-slate-500">{label}</p>
      <p className="text-base font-black text-board-navy">{value}</p>
    </div>
  );
}

function FamilyCount({ family, count }: { family: PositionFamily; count: number }) {
  const meta = positionFamilyMeta[family];
  return (
    <div className={cn("rounded-md border px-1.5 py-1", meta.chipClassName)}>
      <p className="text-[10px] font-black text-board-navy">{meta.shortLabel}</p>
      <p className="text-sm font-black text-board-navy">{count}</p>
    </div>
  );
}

function GroupBalance({ group, players }: { group: SessionBoardGroup; players: SessionBoardPlayer[] }) {
  const playerById = new Map(players.map((player) => [player.id, player]));
  const linkedPlayers = group.members.map((member) => member.playerId ? playerById.get(member.playerId) : undefined).filter(Boolean) as SessionBoardPlayer[];
  const customCount = group.members.filter((member) => member.customName).length;
  const composition = {
    goalkeeper: linkedPlayers.filter((player) => resolvedPositionFamily(player) === "goalkeeper").length,
    defensive: linkedPlayers.filter((player) => resolvedPositionFamily(player) === "defensive").length,
    midfield: linkedPlayers.filter((player) => resolvedPositionFamily(player) === "midfield").length,
    attacking: linkedPlayers.filter((player) => resolvedPositionFamily(player) === "attacking").length
  };
  return (
    <div className="rounded-md border border-board-line bg-board-paper p-2">
      <p className="text-xs font-bold text-board-navy">{group.name} · {group.members.length} member{group.members.length === 1 ? "" : "s"}</p>
      <p className="mt-1 text-[11px] font-semibold text-slate-600">
        {composition.goalkeeper} GK · {composition.defensive} DEF · {composition.midfield} MID · {composition.attacking} ATT{customCount ? ` · ${customCount} Guest` : ""}
      </p>
      {group.groupType === "exclusive" && linkedPlayers.length && composition.goalkeeper === 0 ? (
        <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">No Goalkeeper in this group.</p>
      ) : null}
    </div>
  );
}

function resolveBoardPosition(player: SessionBoardPlayer) {
  if (player.position && getPositionFamily(player.position) !== "unassigned") return normalizePosition(player.position);
  const secondary = player.secondaryPositions.find((position) => getPositionFamily(position) !== "unassigned");
  return secondary ? normalizePosition(secondary) : undefined;
}

function resolvedPositionFamily(player: SessionBoardPlayer) {
  return getPositionFamily(resolveBoardPosition(player));
}

function buildGroupLabels(groups: SessionBoardGroup[]) {
  const map = new Map<string, string[]>();
  for (const group of groups) {
    for (const member of group.members) {
      if (!member.playerId) continue;
      map.set(member.playerId, [...(map.get(member.playerId) ?? []), group.name]);
    }
  }
  return map;
}

function plannedStatusShort(status?: SessionBoardPlayer["plannedStatus"]) {
  if (status === "unavailable") return "Out";
  if (status === "unclear") return "?";
  return "Expected";
}

function finalStatusShort(status: NonNullable<SessionBoardPlayer["finalStatus"]>) {
  if (status === "present") return "Present";
  if (status === "Z") return "Late";
  return "Absent";
}
