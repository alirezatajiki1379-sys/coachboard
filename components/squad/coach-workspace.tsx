"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { CSSProperties, DragEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { AlertTriangle, Archive, ArrowDown, ArrowUp, BarChart3, CalendarDays, CheckSquare, Copy, Eye, GripVertical, Mail, RotateCcw, Search, Stethoscope, Target, Trash2, X } from "lucide-react";
import { useOptionalI18n } from "@/components/i18n/i18n-provider";
import { Button, ButtonLink } from "@/components/ui/button";
import { formatMessage, getMessages, type Locale, type Messages } from "@/lib/i18n";
import { PLAYER_TABLE_LAYER_CLASSES } from "@/components/squad/player-table-layers";
import {
  bulkArchiveSquadPlayers,
  bulkPermanentlyDeleteSquadPlayers,
  bulkRestoreSquadPlayers,
  bulkTrashSquadPlayers
} from "@/lib/squad/actions";
import {
  createWorkspaceSavedView,
  saveWorkspaceColumnOrder,
  saveSystemWorkspaceOverride,
  updateWorkspaceSavedView
} from "@/lib/squad/workspace-actions";
import { coachAssessmentLabels, playerName } from "@/lib/squad/analytics";
import { formatEventDate } from "@/lib/squad/attendance-format";
import { calculateAge, formatPlayerBirthDate } from "@/lib/squad/format";
import { cn } from "@/lib/utils";
import {
  availabilityDetail,
  availabilityLabel,
  defaultWorkspaceConfiguration,
  formatWorkspacePercent,
  formatWorkspaceRating,
  hiddenAttentionCount,
  quickViews,
  visibleAttention,
  workspaceColumns,
  workspaceHref,
  workspaceViewSwitchHref,
  workspaceMobileMetrics,
  type WorkspaceData,
  type WorkspaceColumnDefinition,
  type WorkspacePlayerSummary,
  type WorkspaceSortKey,
  type WorkspaceView
} from "@/lib/squad/workspace";

const sortLabels: Array<{ value: WorkspaceSortKey; labelKey: WorkspaceColumnDefinition["id"] | "age" }> = [
  { value: "name", labelKey: "player" },
  { value: "position", labelKey: "position" },
  { value: "age", labelKey: "age" },
  { value: "availability", labelKey: "availability" },
  { value: "lastTraining", labelKey: "lastTraining" },
  { value: "attendance", labelKey: "attendance" },
  { value: "average", labelKey: "average" },
  { value: "latestRating", labelKey: "latestRating" },
  { value: "trend", labelKey: "trend" },
  { value: "reliability", labelKey: "reliability" },
  { value: "activeGoals", labelKey: "activeGoals" },
  { value: "goalPriority", labelKey: "goalPriority" },
  { value: "reviewDate", labelKey: "review" },
  { value: "lastObservation", labelKey: "lastObservation" },
  { value: "coachAssessment", labelKey: "coachAssessment" }
];

const positionGroups = ["Goalkeepers", "Defenders", "Midfielders", "Attackers", "Other"] as const;

export function CoachWorkspace({ data, locale }: { data: WorkspaceData; locale?: Locale }) {
  const context = useOptionalI18n();
  const activeLocale = context?.locale ?? locale ?? "en";
  const messages = context?.messages ?? getMessages(activeLocale);
  const view = localizedQuickView(messages, data.state.view);
  const grouped = groupWorkspacePlayers(data, messages);
  const [columnOrder, setColumnOrder] = useState(data.configuration.columnOrder);
  const [columnOrderMessage, setColumnOrderMessage] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkMessage, setBulkMessage] = useState("");
  const [emailComposerOpen, setEmailComposerOpen] = useState(false);
  const [isBulkPending, startBulkTransition] = useTransition();
  const [isSavingColumnOrder, startColumnOrderSave] = useTransition();
  const columns = useMemo(() => visibleDesktopColumns(data, columnOrder).map((column) => localizeColumn(column, messages)), [data, columnOrder, messages]);
  const visiblePlayerIds = useMemo(() => data.players.map((player) => player.analytics.player.id), [data.players]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedPlayers = useMemo(() => data.players.filter((player) => selectedIdSet.has(player.analytics.player.id)), [data.players, selectedIdSet]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(data.state.selectedPlayer ?? null);
  const selectedPlayer = useMemo(
    () => data.players.find((player) => player.analytics.player.id === selectedPlayerId),
    [data.players, selectedPlayerId]
  );

  useEffect(() => {
    if (!data.players.length) {
      setSelectedPlayerId(null);
      setSelectedIds([]);
      return;
    }
    setSelectedPlayerId((current) => current && data.players.some((player) => player.analytics.player.id === current) ? current : null);
    setSelectedIds((current) => current.filter((id) => data.players.some((player) => player.analytics.player.id === id)));
  }, [data.players]);

  function toggleInspector(playerId: string) {
    setSelectedPlayerId((current) => current === playerId ? null : playerId);
  }

  function persistColumnOrder(nextOrder: typeof columnOrder, previousOrder: typeof columnOrder) {
    setColumnOrder(nextOrder);
    setColumnOrderMessage("Saving column order...");
    startColumnOrderSave(async () => {
      const result = await saveWorkspaceColumnOrder({
        view: data.state.view,
        savedViewId: data.activeSavedView?.id,
        columnOrder: nextOrder
      });
      if (!result.ok) {
        setColumnOrder(previousOrder);
        setColumnOrderMessage(result.error ?? "The new column order could not be saved. The previous order was restored.");
        return;
      }
      setColumnOrderMessage("Column order saved.");
    });
  }

  function toggleSelectedPlayer(playerId: string) {
    setSelectedIds((current) => current.includes(playerId) ? current.filter((id) => id !== playerId) : [...current, playerId]);
  }

  function selectAllVisible() {
    setSelectedIds(visiblePlayerIds);
  }

  function runBulkAction(action: "archive" | "trash" | "restore" | "permanent") {
    setBulkMessage("");
    if (!selectedIds.length) {
      setBulkMessage("Select at least one player first.");
      return;
    }
    const confirmation = action === "permanent" ? window.prompt(`Type DELETE ${selectedIds.length} PLAYERS to permanently delete the selected players.`) : "";
    if (action === "permanent" && confirmation === null) return;
    const formData = new FormData();
    selectedIds.forEach((id) => formData.append("playerIds", id));
    if (confirmation) formData.set("confirmation", confirmation);
    startBulkTransition(async () => {
      const initial = { ok: false, message: "" };
      const result = action === "archive"
        ? await bulkArchiveSquadPlayers(initial, formData)
        : action === "restore"
          ? await bulkRestoreSquadPlayers(initial, formData)
          : action === "permanent"
            ? await bulkPermanentlyDeleteSquadPlayers(initial, formData)
            : await bulkTrashSquadPlayers(initial, formData);
      setBulkMessage(result.message);
      if (result.ok) setSelectedIds([]);
    });
  }

  return (
    <div className="space-y-6 [--squad-controls-top:0rem]">
      <section className={cn("sticky top-[var(--squad-controls-top)] rounded-lg border border-board-line bg-white p-3 shadow-soft", PLAYER_TABLE_LAYER_CLASSES.toolbar)}>
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={messages.squad.nav.label}>
          {quickViews.map((item) => (
            <Link
              key={item.id}
              role="tab"
              aria-selected={item.id === data.state.view}
              href={workspaceViewSwitchHref(data.state, item.id)}
              className={cn(
                "min-w-fit rounded-md px-3 py-2 text-sm font-bold transition",
                item.id === data.state.view ? "bg-board-green text-white" : "text-slate-600 hover:bg-green-50 hover:text-board-green"
              )}
            >
              {localizedQuickView(messages, item.id).label}
            </Link>
          ))}
        </div>
        <p className="mt-2 px-1 text-xs font-semibold text-slate-500">{view.description}</p>
        <WorkspaceFilters data={data} messages={messages} />
      </section>

      {data.state.customize ? <CustomizeWorkspacePanel data={data} messages={messages} /> : null}

      <section className={cn("grid gap-6", selectedPlayer && data.configuration.inspectorMode === "open" && "xl:grid-cols-[minmax(0,1fr)_340px]")}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-board-navy">{view.label}</h2>
              <p className="text-sm text-slate-600">{data.periodLabel} · {data.periodRangeLabel}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="rounded-md bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">{formatMessage(messages.squad.filters.shown, { count: data.players.length })}</p>
              <Button type="button" variant={selectionMode ? "secondary" : "ghost"} className="h-9 px-3" onClick={() => {
                setSelectionMode((current) => !current);
                setBulkMessage("");
              }}>
                <CheckSquare className="h-4 w-4" />
                {selectionMode ? messages.squad.actions.selectionOn : messages.squad.actions.select}
              </Button>
            </div>
          </div>

          {selectionMode ? (
            <section className="rounded-lg border border-board-line bg-white p-3 shadow-soft">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <p className="text-sm font-bold text-board-navy">{selectedIds.length} {messages.squad.actions.select.toLowerCase()}</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" className="h-9 px-3" onClick={selectAllVisible} disabled={!visiblePlayerIds.length || isBulkPending}>{messages.squad.actions.selectVisible}</Button>
                  <Button type="button" variant="ghost" className="h-9 px-3" onClick={() => setSelectedIds([])} disabled={!selectedIds.length || isBulkPending}>{messages.squad.actions.clear}</Button>
                  <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => setEmailComposerOpen(true)} disabled={!selectedIds.length || isBulkPending}>
                    <Mail className="h-4 w-4" />
                    {messages.squad.actions.email}
                  </Button>
                  {data.state.players === "trash" ? (
                    <>
                      <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => runBulkAction("restore")} disabled={!selectedIds.length || isBulkPending}>
                        <RotateCcw className="h-4 w-4" />
                        {messages.squad.actions.restore}
                      </Button>
                      <Button type="button" variant="danger" className="h-9 px-3" onClick={() => runBulkAction("permanent")} disabled={!selectedIds.length || isBulkPending}>
                        <Trash2 className="h-4 w-4" />
                        {messages.squad.actions.deletePermanently}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => runBulkAction("archive")} disabled={!selectedIds.length || isBulkPending}>
                        <Archive className="h-4 w-4" />
                        {messages.squad.actions.archive}
                      </Button>
                      <Button type="button" variant="danger" className="h-9 px-3" onClick={() => runBulkAction("trash")} disabled={!selectedIds.length || isBulkPending}>
                        <Trash2 className="h-4 w-4" />
                        {messages.squad.actions.moveToTrash}
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {bulkMessage ? <p className="mt-2 text-sm font-semibold text-slate-600">{bulkMessage}</p> : null}
            </section>
          ) : null}

          <div className="hidden xl:block">
            {data.players.length ? (
              grouped ? (
                <div className="space-y-5">
                  {grouped.map((group) => (
                    <section key={group.label} className="rounded-lg border border-board-line bg-white shadow-soft">
                      <h3 className="border-b border-board-line px-4 py-3 text-sm font-bold uppercase tracking-wide text-slate-500">{group.label}</h3>
                      <WorkspaceTable data={data} players={group.players} columns={columns} columnOrder={columnOrder} selectedPlayerId={selectedPlayer?.analytics.player.id} onSelectPlayer={toggleInspector} onColumnOrderChange={persistColumnOrder} isSavingColumnOrder={isSavingColumnOrder} selectionMode={selectionMode} selectedIds={selectedIdSet} onToggleSelected={toggleSelectedPlayer} messages={messages} />
                    </section>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-board-line bg-white shadow-soft">
                  <WorkspaceTable data={data} players={data.players} columns={columns} columnOrder={columnOrder} selectedPlayerId={selectedPlayer?.analytics.player.id} onSelectPlayer={toggleInspector} onColumnOrderChange={persistColumnOrder} isSavingColumnOrder={isSavingColumnOrder} selectionMode={selectionMode} selectedIds={selectedIdSet} onToggleSelected={toggleSelectedPlayer} messages={messages} />
                </div>
              )
            ) : (
              <WorkspaceEmpty data={data} messages={messages} />
            )}
          </div>

          <div className="space-y-3 xl:hidden">
            {data.players.length ? data.players.map((player) => <WorkspaceMobileCard key={player.analytics.player.id} data={data} player={player} selected={selectedPlayer?.analytics.player.id === player.analytics.player.id} onSelectPlayer={toggleInspector} selectionMode={selectionMode} checked={selectedIdSet.has(player.analytics.player.id)} onToggleSelected={toggleSelectedPlayer} messages={messages} />) : <WorkspaceEmpty data={data} messages={messages} />}
          </div>
        </div>

        {selectedPlayer && data.configuration.inspectorMode === "open" ? <aside className="hidden xl:block">
          <div>
            <InspectorPanel player={selectedPlayer} returnTo={workspaceHref(data.state, { selectedPlayer: selectedPlayer.analytics.player.id })} onClose={() => setSelectedPlayerId(null)} messages={messages} />
          </div>
        </aside> : null}
      </section>
      <p className="sr-only" aria-live="polite">{columnOrderMessage}</p>
      {columnOrderMessage ? <p className="text-xs font-semibold text-slate-500 xl:block hidden">{columnOrderMessage}</p> : null}
      {emailComposerOpen ? <EmailDraftDialog players={selectedPlayers} onClose={() => setEmailComposerOpen(false)} /> : null}
    </div>
  );
}

type EmailRecipientMode = "players" | "parents" | "both";

function EmailDraftDialog({ players, onClose }: { players: WorkspacePlayerSummary[]; onClose: () => void }) {
  const [mode, setMode] = useState<EmailRecipientMode>("parents");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState("");
  const draft = useMemo(() => buildEmailDraft(players, mode, subject, message), [players, mode, subject, message]);

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`${label} copied.`);
    } catch {
      setCopied("Copy failed. Select and copy the text manually.");
    }
  }

  return (
    <div className={cn("fixed inset-0 flex items-center justify-center bg-board-navy/40 p-4", PLAYER_TABLE_LAYER_CLASSES.modal)} role="dialog" aria-modal="true" aria-labelledby="email-draft-title">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="email-draft-title" className="text-lg font-bold text-board-navy">Prepare group email</h2>
            <p className="mt-1 text-sm text-slate-600">Creates a BCC email draft. CoachBoard does not send the email.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Close email draft">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid gap-4">
          <Field label="Recipients">
            <select value={mode} onChange={(event) => setMode(event.target.value as EmailRecipientMode)} className={fieldClass()}>
              <option value="parents">Parent emails</option>
              <option value="players">Player emails</option>
              <option value="both">Parents and players</option>
            </select>
          </Field>
          <Field label="Subject">
            <input value={subject} onChange={(event) => setSubject(event.target.value)} className={fieldClass()} placeholder="Training information" />
          </Field>
          <Field label="Message">
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} className={cn(fieldClass(), "min-h-32 py-3")} placeholder="Write your message..." />
          </Field>
        </div>

        <div className="mt-4 rounded-md bg-board-paper p-3">
          <p className="text-sm font-bold text-board-navy">{draft.validEmails.length} valid email{draft.validEmails.length === 1 ? "" : "s"}</p>
          {draft.missing.length ? <p className="mt-1 text-sm text-amber-700">{draft.missing.length} selected player{draft.missing.length === 1 ? "" : "s"} missing the selected email type.</p> : null}
          {draft.invalid.length ? <p className="mt-1 text-sm text-red-700">{draft.invalid.length} invalid email{draft.invalid.length === 1 ? "" : "s"} ignored.</p> : null}
          {draft.validEmails.length ? (
            <div className="mt-3 max-h-28 overflow-y-auto rounded border border-board-line bg-white p-2 text-xs text-slate-600">
              {draft.validEmails.join(", ")}
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <ButtonLink href={draft.mailto} className={cn("h-9 px-3", !draft.validEmails.length && "pointer-events-none opacity-50")}>
            <Mail className="h-4 w-4" />
            Open email app
          </ButtonLink>
          <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => copyText("BCC", draft.validEmails.join(", "))} disabled={!draft.validEmails.length}>
            <Copy className="h-4 w-4" />
            Copy BCC
          </Button>
          <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => copyText("Subject", subject)} disabled={!subject.trim()}>Copy subject</Button>
          <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => copyText("Message", message)} disabled={!message.trim()}>Copy message</Button>
          <Button type="button" variant="ghost" className="h-9 px-3" onClick={onClose}>Close</Button>
        </div>
        {copied ? <p className="mt-2 text-sm font-semibold text-slate-600" aria-live="polite">{copied}</p> : null}
      </div>
    </div>
  );
}

function buildEmailDraft(players: WorkspacePlayerSummary[], mode: EmailRecipientMode, subject: string, message: string) {
  const validEmails: string[] = [];
  const seen = new Set<string>();
  const invalid: string[] = [];
  const missing: string[] = [];
  for (const player of players) {
    const person = player.analytics.player;
    const rawEmails = [
      ...(mode === "players" || mode === "both" ? [person.playerEmail] : []),
      ...(mode === "parents" || mode === "both" ? [person.parentEmail] : [])
    ].filter((email): email is string => Boolean(email?.trim()));
    if (!rawEmails.length) {
      missing.push(playerName(person));
      continue;
    }
    for (const rawEmail of rawEmails) {
      const email = rawEmail.trim();
      const key = email.toLowerCase();
      if (!isValidEmail(email)) {
        invalid.push(`${playerName(person)}: ${email}`);
        continue;
      }
      if (!seen.has(key)) {
        seen.add(key);
        validEmails.push(email);
      }
    }
  }
  const params = new URLSearchParams();
  if (validEmails.length) params.set("bcc", validEmails.join(","));
  if (subject.trim()) params.set("subject", subject.trim());
  if (message.trim()) params.set("body", message.trim());
  return {
    validEmails,
    invalid,
    missing,
    mailto: `mailto:?${params.toString()}`
  };
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function WorkspaceFilters({ data, messages }: { data: WorkspaceData; messages: Messages }) {
  const state = data.state;
  const activeFilterCount = [
    state.players !== "active",
    Boolean(state.position),
    state.availability !== "all",
    state.period !== "season",
    Boolean(state.coachAssessment),
    Boolean(state.developmentStatus),
    Boolean(state.reviewStatus),
    Boolean(state.evidenceBase),
    Boolean(state.ratingStatus)
  ].filter(Boolean).length;
  return (
    <div className="mt-3 border-t border-board-line pt-3">
      <form action="/squad" className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto_auto_auto_auto] lg:items-end">
        <input type="hidden" name="view" value={state.view} />
        <Field label={messages.squad.filters.search}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input name="search" defaultValue={state.search} className={cn(fieldClass(), "pl-9")} placeholder={messages.squad.filters.searchPlaceholder} />
          </div>
        </Field>
        <details className="relative">
          <summary className="flex h-11 cursor-pointer list-none items-center justify-center rounded-md border border-board-line px-3 text-sm font-bold text-board-navy hover:bg-slate-50">
            {messages.squad.filters.view}
          </summary>
          <div className={cn("mt-2 min-w-72 rounded-lg border border-board-line bg-white p-3 shadow-soft lg:absolute lg:right-0", PLAYER_TABLE_LAYER_CLASSES.popover)}>
            <SavedViewsCompact data={data} messages={messages} />
          </div>
        </details>
        <details className="relative">
          <summary className="flex h-11 cursor-pointer list-none items-center justify-center rounded-md border border-board-line px-3 text-sm font-bold text-board-navy hover:bg-slate-50">
            {messages.squad.filters.filters} {activeFilterCount ? activeFilterCount : ""}
          </summary>
          <div className={cn("mt-2 grid gap-3 rounded-lg border border-board-line bg-white p-3 shadow-soft md:grid-cols-2 lg:absolute lg:right-0 lg:w-[720px] xl:grid-cols-3", PLAYER_TABLE_LAYER_CLASSES.popover)}>
            <Field label={messages.squad.filters.players}>
              <select name="players" defaultValue={state.players} className={fieldClass()}>
                <option value="active">{messages.squad.filters.allActivePlayers}</option>
                <option value="roster">{messages.squad.filters.rosterPlayers}</option>
                <option value="trial">{messages.squad.filters.trialPlayers}</option>
                <option value="archived">{messages.squad.filters.archivedPlayers}</option>
                <option value="trash">{messages.squad.filters.playerTrash}</option>
              </select>
            </Field>
            <Field label={messages.squad.filters.position}>
              <select name="position" defaultValue={state.position ?? ""} className={fieldClass()}>
                <option value="">{messages.squad.filters.allPositions}</option>
                {data.positions.map((position) => <option key={position} value={position}>{position}</option>)}
              </select>
            </Field>
            <Field label={messages.squad.filters.availability}>
              <select name="availability" defaultValue={state.availability} className={fieldClass()}>
                <option value="all">{messages.squad.filters.all}</option>
                <option value="available">{messages.squad.filters.available}</option>
                <option value="injured">{messages.squad.filters.injured}</option>
                <option value="sick">{messages.squad.filters.sick}</option>
                <option value="medical-review">{messages.squad.filters.medicalReview}</option>
              </select>
            </Field>
            <Field label={messages.squad.filters.period}>
              <select name="period" defaultValue={state.period} className={fieldClass()}>
                <option value="last5">{messages.squad.filters.last5}</option>
                <option value="last10">{messages.squad.filters.last10}</option>
                <option value="30d">{messages.squad.filters.last30}</option>
                <option value="90d">{messages.squad.filters.last90}</option>
                <option value="season">{messages.squad.filters.season}</option>
                <option value="all">{messages.squad.filters.allTime}</option>
                <option value="custom">{messages.squad.filters.custom}</option>
              </select>
            </Field>
            <Field label={messages.squad.filters.sort}>
              <select name="sort" defaultValue={state.sort} className={fieldClass()}>
                {sortLabels.map((item) => <option key={item.value} value={item.value}>{columnLabel(messages, item.labelKey)}</option>)}
              </select>
            </Field>
            {state.period === "custom" ? (
              <>
                <Field label={messages.squad.filters.from}>
                  <input name="from" defaultValue={state.customFrom ?? ""} type="date" className={fieldClass()} />
                </Field>
                <Field label={messages.squad.filters.to}>
                  <input name="to" defaultValue={state.customTo ?? ""} type="date" className={fieldClass()} />
                </Field>
              </>
            ) : null}
            <Field label={messages.squad.filters.coachAssessment}>
              <select name="coachAssessment" defaultValue={state.coachAssessment ?? ""} className={fieldClass()}>
                <option value="">{messages.squad.filters.anyAssessment}</option>
                {Object.entries(coachAssessmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label={messages.squad.nav.development}>
              <select name="developmentStatus" defaultValue={state.developmentStatus ?? ""} className={fieldClass()}>
                <option value="">{messages.squad.filters.anyStatus}</option>
                <option value="active-goals">{messages.squad.labels.activeGoals}</option>
                <option value="high-priority">{messages.squad.labels.highPriority}</option>
                <option value="no-active-goals">No active goals</option>
                <option value="review-overdue">Review overdue</option>
                <option value="review-due">Review due</option>
              </select>
            </Field>
            <Field label={messages.squad.labels.review}>
              <select name="reviewStatus" defaultValue={state.reviewStatus ?? ""} className={fieldClass()}>
                <option value="">{messages.squad.filters.anyReview}</option>
                <option value="overdue">Overdue</option>
                <option value="today">Due today</option>
                <option value="week">Due this week</option>
                <option value="upcoming">Upcoming</option>
                <option value="none">{messages.squad.labels.noReviewDate}</option>
              </select>
            </Field>
            <Field label={messages.squad.labels.evidence}>
              <select name="evidenceBase" defaultValue={state.evidenceBase ?? ""} className={fieldClass()}>
                <option value="">{messages.squad.filters.anyEvidence}</option>
                <option value="No performance data">No data</option>
                <option value="First impressions">First impressions</option>
                <option value="Early tendency">Early tendency</option>
                <option value="Developing evidence">Developing evidence</option>
                <option value="Stronger evidence base">Stronger evidence</option>
              </select>
            </Field>
            <Field label={messages.common.entities.rating}>
              <select name="ratingStatus" defaultValue={state.ratingStatus ?? ""} className={fieldClass()}>
                <option value="">{messages.squad.filters.anyRatingStatus}</option>
                <option value="rated">{messages.squad.filters.rated}</option>
                <option value="unrated">{messages.squad.filters.unrated}</option>
              </select>
            </Field>
          </div>
        </details>
        <div className="flex gap-2">
          <Button type="submit" className="h-11">{messages.squad.filters.apply}</Button>
          <ButtonLink href={workspaceHref(state, { direction: state.direction === "asc" ? "desc" : "asc" })} variant="secondary" className="h-11">
            {state.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            {state.direction === "asc" ? messages.squad.filters.directionAsc : messages.squad.filters.directionDesc}
          </ButtonLink>
        </div>
        <ButtonLink href={workspaceHref({ ...state, view: "all", players: "active", availability: "all", period: "season", sort: "position", direction: "asc", search: "" }, { selectedPlayer: undefined })} variant="ghost" className="h-11">
          {messages.squad.filters.reset}
        </ButtonLink>
        <ButtonLink href={workspaceHref(state, { customize: !state.customize })} variant={state.customize ? "primary" : "secondary"} className="h-11" aria-expanded={state.customize} aria-controls="squad-columns-panel">
          {state.customize ? messages.squad.filters.closeColumns : messages.squad.filters.columns}
        </ButtonLink>
        {activeFilterCount || state.search ? (
          <div className="flex flex-wrap gap-2 lg:col-span-5">
            {state.search ? <Chip label={formatMessage(messages.squad.filters.searchChip, { query: state.search })} /> : null}
            {state.position ? <Chip label={state.position} /> : null}
            {state.players !== "active" ? <Chip label={state.players} /> : null}
            {state.availability !== "all" ? <Chip label={state.availability} /> : null}
            {state.period !== "season" ? <Chip label={state.period} /> : null}
          </div>
        ) : null}
      </form>
    </div>
  );
}

function SavedViewsCompact({ data, messages }: { data: WorkspaceData; messages: Messages }) {
  const savedViews = data.savedViews.filter((view) => view.kind === "saved");
  return (
    <div>
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{messages.squad.filters.view}</h2>
      <p className="mt-1 text-sm text-slate-600">
        {data.activeSavedView ? `${data.activeSavedView.name}${data.activeSavedView.isDefault ? " · Default" : ""}` : "Default Squad View"}
      </p>
      {savedViews.length ? (
        <div className="mt-3 grid gap-2">
          {savedViews.map((view) => (
            <Link
              key={view.id}
              href={`/squad?savedView=${view.id}`}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-bold transition",
                data.activeSavedView?.id === view.id ? "bg-board-green text-white" : "bg-slate-100 text-slate-700 hover:bg-green-50 hover:text-board-green"
              )}
            >
              {view.name}{view.isDefault ? " · Default" : ""}
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-dashed border-board-line p-3">
          <p className="text-sm font-semibold text-board-navy">No saved views yet.</p>
          <p className="mt-1 text-sm text-slate-600">Configure the Workspace for a recurring coaching task, then save it for faster access next time.</p>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">Use Columns to save or manage the current view layout.</p>
    </div>
  );
}

function CustomizeWorkspacePanel({ data, messages }: { data: WorkspaceData; messages: Messages }) {
  const config = data.configuration;
  const [customVisibleColumns, setCustomVisibleColumns] = useState<WorkspaceColumnDefinition["id"][]>(config.visibleColumns);
  const [customColumnOrder, setCustomColumnOrder] = useState<WorkspaceColumnDefinition["id"][]>(normalizeWorkspaceColumnOrder(config.columnOrder));
  const [draggedCustomColumn, setDraggedCustomColumn] = useState<WorkspaceColumnDefinition["id"] | null>(null);
  const [dropCustomTarget, setDropCustomTarget] = useState<{ id: WorkspaceColumnDefinition["id"] | "action"; side: "before" | "after" } | null>(null);
  const [keyboardGrabbedColumn, setKeyboardGrabbedColumn] = useState<WorkspaceColumnDefinition["id"] | null>(null);
  const [keyboardOriginalOrder, setKeyboardOriginalOrder] = useState<WorkspaceColumnDefinition["id"][] | null>(null);
  const [columnReorderAnnouncement, setColumnReorderAnnouncement] = useState("");
  const visibleSet = new Set(customVisibleColumns);
  const columnsByCustomOrder = customColumnOrder
    .map((id) => workspaceColumns.find((column) => column.id === id))
    .filter((column): column is WorkspaceColumnDefinition => Boolean(column));
  const orderedColumns = columnsByCustomOrder.filter((column) => column.required || visibleSet.has(column.id));
  const hiddenColumns = workspaceColumns.filter((column) => !visibleSet.has(column.id) && !column.required);
  const activeAction = data.activeSavedView ? updateWorkspaceSavedView : saveSystemWorkspaceOverride;

  function toggleCustomColumn(columnId: WorkspaceColumnDefinition["id"], checked: boolean) {
    const column = workspaceColumns.find((item) => item.id === columnId);
    if (!column || column.required) return;
    setCustomVisibleColumns((current) => {
      if (checked) return current.includes(columnId) ? current : [...current, columnId];
      return current.filter((id) => id !== columnId);
    });
  }

  function moveCustomColumnToTarget(columnId: WorkspaceColumnDefinition["id"], targetId: WorkspaceColumnDefinition["id"] | "action", side: "before" | "after") {
    if (!isWorkspaceColumnReorderable(columnId)) return;
    setCustomColumnOrder((current) => {
      const next = moveWorkspaceColumnInOrder(current, columnId, targetId, side);
      const movedColumn = workspaceColumns.find((column) => column.id === columnId);
      const targetColumn = targetId === "action" ? undefined : workspaceColumns.find((column) => column.id === targetId);
      if (next !== current && movedColumn) {
        setColumnReorderAnnouncement(
          targetId === "action"
            ? `${movedColumn.label} moved before Action.`
            : `${movedColumn.label} moved ${side} ${targetColumn?.label ?? "the selected column"}.`
        );
      }
      return next;
    });
  }

  function moveKeyboardColumn(columnId: WorkspaceColumnDefinition["id"], direction: -1 | 1) {
    const movableIds: WorkspaceColumnDefinition["id"][] = orderedColumns.map((column) => column.id).filter((id) => isWorkspaceColumnReorderable(id));
    const currentIndex = movableIds.indexOf(columnId);
    const targetId = movableIds[currentIndex + direction];
    if (!targetId) return;
    moveCustomColumnToTarget(columnId, targetId, direction < 0 ? "before" : "after");
  }

  function handleColumnKeyboard(event: ReactKeyboardEvent<HTMLButtonElement>, columnId: WorkspaceColumnDefinition["id"]) {
    if (!isWorkspaceColumnReorderable(columnId)) return;
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (keyboardGrabbedColumn === columnId) {
        setKeyboardGrabbedColumn(null);
        setKeyboardOriginalOrder(null);
        setColumnReorderAnnouncement(`${workspaceColumns.find((column) => column.id === columnId)?.label ?? "Column"} dropped.`);
        return;
      }
      setKeyboardGrabbedColumn(columnId);
      setKeyboardOriginalOrder(customColumnOrder);
      setColumnReorderAnnouncement(`${workspaceColumns.find((column) => column.id === columnId)?.label ?? "Column"} picked up. Use Arrow Up or Arrow Down to reorder.`);
    }
    if (keyboardGrabbedColumn === columnId && event.key === "ArrowUp") {
      event.preventDefault();
      moveKeyboardColumn(columnId, -1);
    }
    if (keyboardGrabbedColumn === columnId && event.key === "ArrowDown") {
      event.preventDefault();
      moveKeyboardColumn(columnId, 1);
    }
    if (keyboardGrabbedColumn === columnId && event.key === "Escape") {
      event.preventDefault();
      if (keyboardOriginalOrder) setCustomColumnOrder(keyboardOriginalOrder);
      setKeyboardGrabbedColumn(null);
      setKeyboardOriginalOrder(null);
      setColumnReorderAnnouncement("Column reorder cancelled.");
    }
  }

  function resetColumns() {
    const recommended = defaultWorkspaceConfiguration(data.state.view);
    setCustomVisibleColumns(recommended.visibleColumns);
    setCustomColumnOrder(normalizeWorkspaceColumnOrder(recommended.columnOrder));
    setKeyboardGrabbedColumn(null);
    setKeyboardOriginalOrder(null);
    setColumnReorderAnnouncement("Recommended column layout restored. Apply to save it.");
  }

  return (
    <section id="squad-columns-panel" className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="hidden text-sm font-semibold uppercase text-board-green xl:block">Customize columns</p>
          <p className="text-sm font-semibold uppercase text-board-green xl:hidden">Customize mobile metrics</p>
          <h2 className="mt-1 text-xl font-bold text-board-navy">{data.activeSavedView?.name ?? localizedQuickView(messages, data.state.view).label ?? messages.squad.labels.systemQuickView}</h2>
          <p className="mt-1 hidden text-sm text-slate-600 xl:block">Choose desktop table columns and order. Mobile card metrics are configured separately on smaller screens.</p>
          <p className="mt-1 text-sm text-slate-600 xl:hidden">Choose up to four mobile card metrics. Desktop columns are configured separately on table layouts.</p>
        </div>
        <ButtonLink href={workspaceHref(data.state, { customize: false })} variant="ghost" className="h-9 px-3">Cancel</ButtonLink>
      </div>

      <form action={activeAction} className="mt-5 space-y-6">
        <WorkspaceStateFields data={data} />
        {data.activeSavedView ? <input type="hidden" name="savedViewId" value={data.activeSavedView.id} /> : null}
        <div className="hidden">
          {workspaceColumns.map((column) => (
            <span key={column.id}>
              {column.required || visibleSet.has(column.id) ? <input type="hidden" name={`column:${column.id}`} value="on" /> : null}
              <input type="hidden" name={`order:${column.id}`} value={customColumnOrder.indexOf(column.id) + 1 || 999} />
            </span>
          ))}
        </div>
        <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="hidden space-y-4 xl:block">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Visible Columns and Order</h3>
            <p className="text-xs text-slate-500">Drag visible columns into the order you want. Player stays first and Action stays last.</p>
            <div className="space-y-2" role="list" aria-label="Visible desktop columns">
              {orderedColumns.map((column) => (
                <ColumnPreferenceRow
                  key={column.id}
                  column={column}
                  checked={column.required || visibleSet.has(column.id)}
                  locked={column.id === "player"}
                  lockLabel={column.id === "player" ? "Locked first" : undefined}
                  draggedColumn={draggedCustomColumn}
                  dropTarget={dropCustomTarget}
                  keyboardGrabbedColumn={keyboardGrabbedColumn}
                  onCheckedChange={(checked) => toggleCustomColumn(column.id, checked)}
                  onDragStart={() => setDraggedCustomColumn(column.id)}
                  onDragEnd={() => {
                    setDraggedCustomColumn(null);
                    setDropCustomTarget(null);
                  }}
                  onDragOver={(targetId, side) => setDropCustomTarget({ id: targetId, side })}
                  onDrop={(targetId, side) => {
                    if (draggedCustomColumn) moveCustomColumnToTarget(draggedCustomColumn, targetId, side);
                    setDraggedCustomColumn(null);
                    setDropCustomTarget(null);
                  }}
                  onKeyDown={(event) => handleColumnKeyboard(event, column.id)}
                />
              ))}
              <ActionPreferenceRow
                draggedColumn={draggedCustomColumn}
                dropTarget={dropCustomTarget}
                onDragOver={(side) => setDropCustomTarget({ id: "action", side })}
                onDrop={(side) => {
                  if (draggedCustomColumn) moveCustomColumnToTarget(draggedCustomColumn, "action", side);
                  setDraggedCustomColumn(null);
                  setDropCustomTarget(null);
                }}
              />
            </div>
            <p className="sr-only" aria-live="polite">{columnReorderAnnouncement}</p>
            {hiddenColumns.length ? (
              <div className="rounded-md border border-dashed border-board-line p-3">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Hidden columns</h3>
                <p className="mt-1 text-xs text-slate-500">Tick a hidden column to restore it to the desktop table.</p>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {hiddenColumns.map((column) => (
                    <label key={column.id} className="flex gap-2 rounded-md bg-slate-50 p-2 text-sm">
                      <input type="checkbox" checked={visibleSet.has(column.id)} onChange={(event) => toggleCustomColumn(column.id, event.target.checked)} className="mt-1 h-4 w-4" />
                      <span className="font-bold text-board-navy">{column.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            <div className="rounded-md border border-board-line p-3 xl:hidden">
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
            <div className="hidden xl:block">
              {config.mobileMetrics.map((metric, index) => <input key={`${metric}-${index}`} type="hidden" name={`mobileMetric${index + 1}`} value={metric} />)}
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
          <Button type="submit">{data.activeSavedView ? "Apply changes" : "Apply columns and preferences"}</Button>
          {!data.activeSavedView ? (
            <Button formAction={createWorkspaceSavedView} variant="secondary">Save as new view</Button>
          ) : (
            <Button formAction={createWorkspaceSavedView} variant="secondary">Save as new</Button>
          )}
          <Button type="button" variant="ghost" onClick={resetColumns}>Reset to recommended</Button>
          <ButtonLink href={workspaceHref(data.state, { customize: false })} variant="ghost">Cancel</ButtonLink>
        </div>
      </form>
    </section>
  );
}

function ColumnPreferenceRow({
  column,
  checked,
  locked,
  lockLabel,
  draggedColumn,
  dropTarget,
  keyboardGrabbedColumn,
  onCheckedChange,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onKeyDown
}: {
  column: WorkspaceColumnDefinition;
  checked: boolean;
  locked?: boolean;
  lockLabel?: string;
  draggedColumn: WorkspaceColumnDefinition["id"] | null;
  dropTarget: { id: WorkspaceColumnDefinition["id"] | "action"; side: "before" | "after" } | null;
  keyboardGrabbedColumn: WorkspaceColumnDefinition["id"] | null;
  onCheckedChange: (checked: boolean) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (columnId: WorkspaceColumnDefinition["id"], side: "before" | "after") => void;
  onDrop: (columnId: WorkspaceColumnDefinition["id"], side: "before" | "after") => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
}) {
  const reorderable = isWorkspaceColumnReorderable(column.id) && !locked;
  const isDragged = draggedColumn === column.id;
  const isKeyboardGrabbed = keyboardGrabbedColumn === column.id;
  const isDropBefore = dropTarget?.id === column.id && dropTarget.side === "before";
  const isDropAfter = dropTarget?.id === column.id && dropTarget.side === "after";

  function insertionSide(event: DragEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  }

  return (
    <div
      role="listitem"
      className={cn(
        "relative grid gap-2 rounded-md border p-3 transition md:grid-cols-[auto_1fr_auto]",
        isDragged ? "border-board-green bg-green-50 shadow-soft" : "border-transparent bg-slate-50",
        isKeyboardGrabbed && "ring-2 ring-board-green/30",
        isDropBefore && "before:absolute before:-top-1 before:left-3 before:right-3 before:h-1 before:rounded-full before:bg-board-green",
        isDropAfter && "after:absolute after:-bottom-1 after:left-3 after:right-3 after:h-1 after:rounded-full after:bg-board-green"
      )}
      onDragOver={(event) => {
        if (!draggedColumn || !reorderable || draggedColumn === column.id) return;
        event.preventDefault();
        onDragOver(column.id, insertionSide(event));
      }}
      onDrop={(event) => {
        if (!draggedColumn || !reorderable || draggedColumn === column.id) return;
        event.preventDefault();
        onDrop(column.id, insertionSide(event));
      }}
    >
      <button
        type="button"
        draggable={reorderable}
        disabled={!reorderable}
        aria-label={reorderable ? `Drag ${column.label} column` : `${column.label} column ${lockLabel ?? "locked"}`}
        aria-pressed={isKeyboardGrabbed}
        title={reorderable ? "Drag to reorder. Keyboard: Space, Arrow Up/Down, Space." : lockLabel}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-md border text-slate-500",
          reorderable ? "cursor-grab border-board-line bg-white hover:text-board-green active:cursor-grabbing" : "cursor-default border-slate-200 bg-slate-100"
        )}
        onDragStart={(event) => {
          if (!reorderable) {
            event.preventDefault();
            return;
          }
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", column.id);
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        onKeyDown={onKeyDown}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      <label className="flex min-w-0 gap-2 text-sm">
        <input
          type="checkbox"
          checked={checked}
          disabled={locked}
          onChange={(event) => onCheckedChange(event.target.checked)}
          className="mt-1 h-4 w-4 shrink-0"
        />
        <span className="min-w-0">
          <span className="font-bold text-board-navy">{column.label}</span>
          <span className="block text-xs text-slate-500">{column.description}</span>
        </span>
      </label>
      {lockLabel ? <span className="self-center rounded-full bg-slate-200 px-2 py-1 text-xs font-bold text-slate-600">{lockLabel}</span> : null}
    </div>
  );
}

function ActionPreferenceRow({
  draggedColumn,
  dropTarget,
  onDragOver,
  onDrop
}: {
  draggedColumn: WorkspaceColumnDefinition["id"] | null;
  dropTarget: { id: WorkspaceColumnDefinition["id"] | "action"; side: "before" | "after" } | null;
  onDragOver: (side: "before" | "after") => void;
  onDrop: (side: "before" | "after") => void;
}) {
  const isDropBefore = dropTarget?.id === "action" && dropTarget.side === "before";

  return (
    <div
      role="listitem"
      className={cn(
        "relative grid gap-2 rounded-md border border-transparent bg-slate-50 p-3 md:grid-cols-[auto_1fr_auto]",
        isDropBefore && "before:absolute before:-top-1 before:left-3 before:right-3 before:h-1 before:rounded-full before:bg-board-green"
      )}
      onDragOver={(event) => {
        if (!draggedColumn) return;
        event.preventDefault();
        onDragOver("before");
      }}
      onDrop={(event) => {
        if (!draggedColumn) return;
        event.preventDefault();
        onDrop("before");
      }}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-slate-500">
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 text-sm">
        <p className="font-bold text-board-navy">Action</p>
        <p className="text-xs text-slate-500">Open and row actions stay at the end of the table.</p>
      </div>
      <span className="self-center rounded-full bg-slate-200 px-2 py-1 text-xs font-bold text-slate-600">Locked last</span>
    </div>
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

function WorkspaceTable({
  data,
  players,
  columns,
  columnOrder,
  selectedPlayerId,
  onSelectPlayer,
  onColumnOrderChange,
  isSavingColumnOrder,
  selectionMode,
  selectedIds,
  onToggleSelected,
  messages
}: {
  data: WorkspaceData;
  players: WorkspacePlayerSummary[];
  columns: WorkspaceColumnDefinition[];
  columnOrder: WorkspaceColumnDefinition["id"][];
  selectedPlayerId?: string;
  onSelectPlayer: (playerId: string) => void;
  onColumnOrderChange: (nextOrder: WorkspaceColumnDefinition["id"][], previousOrder: WorkspaceColumnDefinition["id"][]) => void;
  isSavingColumnOrder: boolean;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelected: (playerId: string) => void;
  messages: Messages;
}) {
  const [draggedColumn, setDraggedColumn] = useState<WorkspaceColumnDefinition["id"] | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: WorkspaceColumnDefinition["id"]; side: "before" | "after" } | null>(null);

  function moveColumn(columnId: WorkspaceColumnDefinition["id"], targetId: WorkspaceColumnDefinition["id"], side: "before" | "after") {
    if (!isWorkspaceColumnReorderable(columnId) || targetId === "player") return;
    const visibleIds = columns.map((column) => column.id);
    if (!visibleIds.includes(targetId)) return;
    onColumnOrderChange(moveWorkspaceColumnInOrder(columnOrder, columnId, targetId, side), columnOrder);
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[900px] w-full border-collapse text-left text-sm">
        <colgroup>
          {selectionMode ? <col className="w-12" /> : null}
          {columns.map((column) => <col key={column.id} className={column.id === "player" ? "w-[240px]" : undefined} />)}
          <col className="w-[90px]" />
        </colgroup>
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 shadow-sm">
          <tr className="border-b border-board-line">
            {selectionMode ? <th scope="col" className={cn("left-0 w-12 bg-slate-50 px-3 py-3 shadow-[1px_0_0_#d9e2dc]", PLAYER_TABLE_LAYER_CLASSES.cornerHeaderCell)}>{messages.squad.actions.select}</th> : null}
            {columns.map((column) => (
              <WorkspaceHeaderCell
                key={column.id}
                column={column}
                data={data}
                selectionMode={selectionMode}
                draggedColumn={draggedColumn}
                dropTarget={dropTarget}
                disabled={isSavingColumnOrder}
                onDragStart={(columnId) => setDraggedColumn(columnId)}
                onDragEnd={() => {
                  setDraggedColumn(null);
                  setDropTarget(null);
                }}
                onDragOver={(columnId, side) => setDropTarget({ id: columnId, side })}
                onDrop={(columnId, side) => {
                  if (draggedColumn) moveColumn(draggedColumn, columnId, side);
                  setDraggedColumn(null);
                  setDropTarget(null);
                }}
              />
            ))}
            <th scope="col" className={cn("bg-slate-50 px-3 py-3", PLAYER_TABLE_LAYER_CLASSES.headerCell)}>{messages.squad.columns.action}</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <WorkspaceRow
              key={player.analytics.player.id}
              data={data}
              player={player}
              columns={columns}
              selected={selectedPlayerId === player.analytics.player.id}
              draggedColumn={draggedColumn}
              onSelectPlayer={onSelectPlayer}
              selectionMode={selectionMode}
              checked={selectedIds.has(player.analytics.player.id)}
              onToggleSelected={onToggleSelected}
              messages={messages}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WorkspaceRow({
  data,
  player,
  columns,
  selected,
  draggedColumn,
  onSelectPlayer,
  selectionMode,
  checked,
  onToggleSelected,
  messages
}: {
  data: WorkspaceData;
  player: WorkspacePlayerSummary;
  columns: WorkspaceColumnDefinition[];
  selected: boolean;
  draggedColumn?: WorkspaceColumnDefinition["id"] | null;
  onSelectPlayer: (playerId: string) => void;
  selectionMode: boolean;
  checked: boolean;
  onToggleSelected: (playerId: string) => void;
  messages: Messages;
}) {
  const summary = player.analytics;
  return (
    <tr
      aria-selected={selected}
      tabIndex={0}
      onClick={() => onSelectPlayer(summary.player.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectPlayer(summary.player.id);
        }
      }}
      className={cn(
        "cursor-pointer border-b border-board-line align-top outline-none transition last:border-b-0 focus-visible:ring-2 focus-visible:ring-board-green/30",
        selected ? "bg-green-50/80 shadow-[inset_4px_0_0_#16a34a]" : "hover:bg-slate-50"
      )}
    >
      {selectionMode ? (
        <td className={cn("sticky left-0 px-3 py-3 shadow-[1px_0_0_#d9e2dc]", PLAYER_TABLE_LAYER_CLASSES.frozenBodyCell, selected ? "bg-green-50" : "bg-white")}>
          <input
            type="checkbox"
            checked={checked}
            aria-label={`${messages.squad.actions.select} ${playerName(summary.player)}`}
            className="h-4 w-4 rounded border-board-line text-board-green"
            onClick={(event) => event.stopPropagation()}
            onChange={() => onToggleSelected(summary.player.id)}
          />
        </td>
      ) : null}
      {columns.map((column) => (
        <td
          key={column.id}
          style={column.id === "player" ? ({ left: selectionMode ? "3rem" : 0 } as CSSProperties) : undefined}
          className={cn(
            cellClass(data, column.sortable),
            column.id === "player" && cn("sticky min-w-[240px] shadow-[1px_0_0_#d9e2dc]", PLAYER_TABLE_LAYER_CLASSES.frozenBodyCell),
            column.id === "player" && (selected ? "bg-green-50" : "bg-white"),
            draggedColumn === column.id && "bg-green-50/70 outline outline-1 outline-board-green/20"
          )}
        >
          {renderColumnCell(column.id, data, player, messages)}
        </td>
      ))}
      <td className="px-3 py-3">
        <Button type="button" variant="secondary" className="h-8 px-2" onClick={(event) => {
          event.stopPropagation();
          onSelectPlayer(summary.player.id);
        }}>{messages.squad.actions.select}</Button>
      </td>
    </tr>
  );
}

function WorkspaceMobileCard({
  data,
  player,
  selected,
  onSelectPlayer,
  selectionMode,
  checked,
  onToggleSelected,
  messages
}: {
  data: WorkspaceData;
  player: WorkspacePlayerSummary;
  selected: boolean;
  onSelectPlayer: (playerId: string) => void;
  selectionMode: boolean;
  checked: boolean;
  onToggleSelected: (playerId: string) => void;
  messages: Messages;
}) {
  const summary = player.analytics;
  const priority = data.configuration.mobileMetrics.map((metric) => mobileMetric(metric, player, messages)).filter((item): item is NonNullable<typeof item> => Boolean(item)).slice(0, 4);
  return (
    <article
      role="button"
      aria-pressed={selected}
      tabIndex={0}
      onClick={() => onSelectPlayer(summary.player.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectPlayer(summary.player.id);
        }
      }}
      className={cn(
        "cursor-pointer rounded-lg border bg-white p-4 shadow-soft outline-none transition focus-visible:ring-2 focus-visible:ring-board-green/30",
        selected ? "border-board-green bg-green-50/50" : "border-board-line"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          {selectionMode ? (
            <label className="mb-3 flex items-center gap-2 text-sm font-bold text-board-navy" onClick={(event) => event.stopPropagation()}>
              <input type="checkbox" checked={checked} className="h-4 w-4 rounded border-board-line text-board-green" onChange={() => onToggleSelected(summary.player.id)} />
              {messages.squad.actions.selectPlayer}
            </label>
          ) : null}
          <h2 className="text-lg font-bold text-board-navy">
            <Link
              href={playerHubHref(summary.player.id, workspaceHref({ ...data.state, selectedPlayer: summary.player.id }, {}))}
              aria-label={formatMessage(messages.squad.actions.openProfile, { name: playerName(summary.player) })}
              className="rounded underline-offset-4 hover:text-board-green hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-board-green/30"
              onClick={(event) => event.stopPropagation()}
            >
              {playerName(summary.player)}
            </Link>
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone={summary.player.playerType === "trial" ? "amber" : "neutral"}>{playerTypeLabel(summary.player.playerType, messages)}</Badge>
            <Badge>{summary.player.position ?? messages.squad.labels.noPosition}</Badge>
            <StatusDot player={player} compact messages={messages} />
          </div>
        </div>
        <Link href={playerHubHref(summary.player.id, workspaceHref({ ...data.state, selectedPlayer: summary.player.id }, {}))} onClick={(event) => event.stopPropagation()} className="rounded-md bg-board-green px-3 py-2 text-sm font-bold text-white">{messages.squad.actions.open}</Link>
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

function Chip({ label }: { label: string }) {
  return <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{label}</span>;
}

function InspectorPanel({ player, returnTo, onClose, messages }: { player?: WorkspacePlayerSummary; returnTo: string; onClose: () => void; messages: Messages }) {
  if (!player) {
    return (
      <section className="rounded-lg border border-dashed border-board-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-board-navy">{messages.squad.actions.openPlayerHub}</h2>
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
          <p className="mt-1 text-sm text-slate-600">{summary.player.position ?? messages.squad.labels.noPosition} · {calculateAge(summary.player.dateOfBirth) ?? "-"} {messages.squad.labels.years} · {playerTypeLabel(summary.player.playerType, messages)}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label={messages.common.actions.close}>
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="mt-4 space-y-4">
        <InspectorSection title={messages.squad.columns.availability} icon={<Stethoscope className="h-4 w-4" />}>
          <StatusDot player={player} messages={messages} />
          <p className="mt-1 text-sm text-slate-600">{availabilityDetail(player)}</p>
        </InspectorSection>
        <InspectorSection title={messages.squad.views.performance.label} icon={<BarChart3 className="h-4 w-4" />}>
          <InspectorGrid items={[
            [messages.squad.labels.average, formatWorkspaceRating(summary.averageRating)],
            [messages.squad.labels.rated, String(summary.rated)],
            [messages.squad.labels.trend, summary.trend.value === null ? localizedTrend(summary.trend.label, messages) : `${summary.trend.value > 0 ? "+" : ""}${summary.trend.value.toFixed(1)}`],
            [messages.squad.labels.latest, summary.latestRating ? String(summary.latestRating) : "-"]
          ]} />
          <p className="mt-2 text-xs font-semibold text-slate-500">{summary.evidenceBase.label}</p>
        </InspectorSection>
        <InspectorSection title={messages.squad.labels.attendance} icon={<CalendarDays className="h-4 w-4" />}>
          <InspectorGrid items={[
            [messages.squad.labels.attendance, formatWorkspacePercent(summary.attendanceRate)],
            [messages.squad.columns.attendedTrainings, `${summary.attended}/${summary.trainings}`],
            [messages.squad.labels.reliability, summary.reliabilityPenalty.toFixed(1)],
            [messages.squad.labels.late, String(summary.late)]
          ]} />
        </InspectorSection>
        <InspectorSection title={messages.squad.nav.development} icon={<Target className="h-4 w-4" />}>
          <p className="text-sm font-bold text-board-navy">{player.activeGoals.length} {messages.squad.labels.activeGoals}</p>
          {player.activeGoals[0] ? <p className="mt-1 text-sm text-slate-600">{player.activeGoals[0].title} · {localizedPriority(player.activeGoals[0].priority, messages)}</p> : <p className="mt-1 text-sm text-slate-600">No active goals.</p>}
          <p className={cn("mt-2 text-sm font-bold", toneText(player.review.tone))}>{player.review.label}</p>
          <p className="mt-2 text-sm text-slate-600">{messages.squad.labels.assessment}: {coachAssessmentLabels[summary.assessment?.assessment ?? "decision_open"]}</p>
        </InspectorSection>
        <InspectorSection title={messages.squad.labels.observation} icon={<Eye className="h-4 w-4" />}>
          {observation ? (
            <p className="text-sm text-slate-600">{formatEventDate(observation.observationDate)} · {observation.note.slice(0, 120)}{observation.note.length > 120 ? "..." : ""}</p>
          ) : (
            <p className="text-sm text-slate-600">-</p>
          )}
        </InspectorSection>
        <InspectorSection title={messages.squad.views.needsAttention.label} icon={<AlertTriangle className="h-4 w-4" />}>
          {player.attention.length ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">{player.attention.map((indicator) => <AttentionBadge key={indicator.id} indicator={indicator} />)}</div>
              <ButtonLink href={`/actions?player=${summary.player.id}`} variant="secondary" className="h-9 justify-center px-3">{messages.squad.actions.reviewInActionCenter}</ButtonLink>
            </div>
          ) : (
            <p className="text-sm text-slate-600">-</p>
          )}
        </InspectorSection>
        <div className="grid gap-2">
          <ButtonLink href={playerHubHref(summary.player.id, returnTo)} className="justify-center">{messages.squad.actions.openPlayerHub}</ButtonLink>
          <ButtonLink href={playerHubHref(summary.player.id, returnTo, "development")} variant="secondary" className="justify-center">{messages.squad.actions.addObservationOrGoal}</ButtonLink>
          <ButtonLink href={playerHubHref(summary.player.id, returnTo, "medical")} variant="secondary" className="justify-center">{messages.squad.actions.addInjuryOrSickness}</ButtonLink>
          <ButtonLink href={playerHubHref(summary.player.id, returnTo, "analytics")} variant="secondary" className="justify-center">{messages.squad.actions.updateAssessment}</ButtonLink>
        </div>
      </div>
    </section>
  );
}

function WorkspaceEmpty({ data, messages }: { data: WorkspaceData; messages: Messages }) {
  const hasSearchOrFilters = Boolean(
    data.state.search ||
    data.state.position ||
    data.state.availability !== "all" ||
    data.state.coachAssessment ||
    data.state.developmentStatus ||
    data.state.reviewStatus ||
    data.state.evidenceBase ||
    data.state.ratingStatus ||
    data.state.importBatch
  );
  const emptyMessages: Record<string, string> = {
    "players:active": messages.squad.empty.active,
    "players:roster": messages.squad.empty.roster,
    "players:trial": messages.squad.empty.trial,
    "players:archived": messages.squad.empty.archived,
    "players:trash": messages.squad.empty.trash,
    "view:trial-players": messages.squad.empty.trial,
    "view:reviews-due": messages.squad.empty.reviewsDue,
    "view:unavailable": messages.squad.empty.unavailable,
    "view:needs-attention": messages.squad.empty.needsAttention
  };
  const categoryMessage = emptyMessages[`players:${data.state.players}`] ?? emptyMessages[`view:${data.state.view}`] ?? messages.squad.empty.category;
  const message = data.allPlayers.length
    ? hasSearchOrFilters ? messages.squad.empty.filtered : categoryMessage
    : messages.squad.empty.newSquad;
  return (
    <div key={`${data.state.view}:${data.state.players}`} className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
      <h2 className="text-lg font-bold text-board-navy">{messages.squad.empty.title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">{message}</p>
      {!data.allPlayers.length ? (
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <ButtonLink href="/squad/players/new">{messages.squad.actions.addPlayerManually}</ButtonLink>
          <ButtonLink href="/squad/import" variant="secondary">{messages.squad.actions.importPlayers}</ButtonLink>
        </div>
      ) : hasSearchOrFilters ? (
        <div className="mt-5 flex justify-center">
          <ButtonLink href={workspaceViewSwitchHref(data.state, data.state.view)} variant="secondary">{messages.squad.actions.clearFilters}</ButtonLink>
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceHeaderCell({
  column,
  data,
  selectionMode,
  draggedColumn,
  dropTarget,
  disabled,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop
}: {
  column: WorkspaceColumnDefinition;
  data: WorkspaceData;
  selectionMode: boolean;
  draggedColumn: WorkspaceColumnDefinition["id"] | null;
  dropTarget: { id: WorkspaceColumnDefinition["id"]; side: "before" | "after" } | null;
  disabled: boolean;
  onDragStart: (columnId: WorkspaceColumnDefinition["id"]) => void;
  onDragEnd: () => void;
  onDragOver: (columnId: WorkspaceColumnDefinition["id"], side: "before" | "after") => void;
  onDrop: (columnId: WorkspaceColumnDefinition["id"], side: "before" | "after") => void;
}) {
  const active = column.sortable && data.state.sort === column.sortable;
  const locked = column.id === "player";
  const isDragged = draggedColumn === column.id;
  const isDropBefore = dropTarget?.id === column.id && dropTarget.side === "before";
  const isDropAfter = dropTarget?.id === column.id && dropTarget.side === "after";
  const direction = active ? (data.state.direction === "asc" ? "desc" : "asc") : "asc";
  const isPlayerColumn = column.id === "player";

  function insertionSide(event: DragEvent<HTMLTableCellElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left + rect.width / 2 ? "before" : "after";
  }

  return (
    <th
      scope="col"
      style={isPlayerColumn ? ({ left: selectionMode ? "3rem" : 0 } as CSSProperties) : undefined}
      className={cn(
        "relative bg-slate-50 px-3 py-3 transition-colors",
        isPlayerColumn ? cn("left-0 min-w-[240px] shadow-[1px_0_0_#d9e2dc]", PLAYER_TABLE_LAYER_CLASSES.cornerHeaderCell) : PLAYER_TABLE_LAYER_CLASSES.headerCell,
        active && "bg-green-50 text-board-green",
        locked ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
        isDragged && "bg-white shadow-sm ring-2 ring-board-green/30",
        isDropBefore && "before:absolute before:inset-y-1 before:left-0 before:w-1 before:rounded-full before:bg-board-green",
        isDropAfter && "after:absolute after:inset-y-1 after:right-0 after:w-1 after:rounded-full after:bg-board-green"
      )}
      aria-sort={active ? (data.state.direction === "asc" ? "ascending" : "descending") : "none"}
      draggable={!locked && !disabled}
      title={locked ? "Player is the primary column and remains first." : "Drag to reorder. Click to sort when available."}
      onDragStart={(event) => {
        if (locked || disabled) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", column.id);
        onDragStart(column.id);
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (!draggedColumn || locked || draggedColumn === column.id) return;
        event.preventDefault();
        onDragOver(column.id, insertionSide(event));
      }}
      onDrop={(event) => {
        if (!draggedColumn || locked || draggedColumn === column.id) return;
        event.preventDefault();
        onDrop(column.id, insertionSide(event));
      }}
    >
      <div className="flex items-center gap-1">
        {!locked ? <GripVertical className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" /> : null}
        {column.sortable ? (
          <Link href={workspaceHref(data.state, { sort: column.sortable, direction })} className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
            {column.label}
            {active ? (data.state.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : null}
          </Link>
        ) : (
          <span>{column.label}</span>
        )}
        {locked ? <span className="sr-only">Locked first column</span> : null}
      </div>
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

function StatusDot({ player, compact = false, messages }: { player: WorkspacePlayerSummary; compact?: boolean; messages: Messages }) {
  const medical = player.currentMedical;
  const tone = !medical ? "green" : medical.type === "injured" ? "red" : "amber";
  return (
    <span className={cn("inline-flex items-center gap-2 font-bold", compact ? "text-xs" : "text-sm", toneText(tone))}>
      <span className={cn("h-2.5 w-2.5 rounded-full", tone === "green" && "bg-green-600", tone === "amber" && "bg-amber-500", tone === "red" && "bg-red-500")} />
      {localizedAvailability(player, messages)}
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

function isWorkspaceColumnReorderable(columnId: WorkspaceColumnDefinition["id"]) {
  return columnId !== "player";
}

function normalizeWorkspaceColumnOrder(columnOrder: WorkspaceColumnDefinition["id"][]) {
  const allowed = new Set(workspaceColumns.map((column) => column.id));
  const clean = Array.from(new Set(columnOrder.filter((id) => allowed.has(id))));
  const rest = clean.filter((id) => id !== "player");
  const missing = workspaceColumns.map((column) => column.id).filter((id) => id !== "player" && !rest.includes(id));
  return ["player", ...rest, ...missing] as WorkspaceColumnDefinition["id"][];
}

function moveWorkspaceColumnInOrder(
  columnOrder: WorkspaceColumnDefinition["id"][],
  columnId: WorkspaceColumnDefinition["id"],
  targetId: WorkspaceColumnDefinition["id"] | "action",
  side: "before" | "after"
) {
  if (!isWorkspaceColumnReorderable(columnId)) return normalizeWorkspaceColumnOrder(columnOrder);
  const normalized = normalizeWorkspaceColumnOrder(columnOrder);
  const next = normalized.filter((id) => id !== columnId);
  if (targetId === "action") {
    return normalizeWorkspaceColumnOrder([...next, columnId]);
  }
  if (targetId === "player") return normalized;
  const targetIndex = next.indexOf(targetId);
  if (targetIndex < 0) return normalized;
  next.splice(side === "after" ? targetIndex + 1 : targetIndex, 0, columnId);
  return normalizeWorkspaceColumnOrder(next);
}

function visibleDesktopColumns(data: WorkspaceData, columnOrder = data.configuration.columnOrder) {
  const visible = new Set(data.configuration.visibleColumns);
  const byId = new Map(workspaceColumns.map((column) => [column.id, column]));
  const ordered = normalizeWorkspaceColumnOrder(columnOrder)
    .map((id) => byId.get(id))
    .filter((column): column is WorkspaceColumnDefinition => Boolean(column && (column.required || visible.has(column.id))));
  if (!ordered.some((column) => column.id === "player")) {
    const player = byId.get("player");
    if (player) ordered.unshift(player);
  }
  return ordered.length ? ordered : workspaceColumns.filter((column) => column.required || visible.has(column.id));
}

function renderColumnCell(columnId: WorkspaceColumnDefinition["id"], data: WorkspaceData, player: WorkspacePlayerSummary, messages: Messages) {
  const summary = player.analytics;
  const record = summary.latestTraining;
  const medical = player.currentMedical;
  if (columnId === "player") {
    return (
      <div className="min-w-[190px]">
        <Link href={playerHubHref(summary.player.id, workspaceHref({ ...data.state, selectedPlayer: summary.player.id }, {}))} className="font-bold text-board-navy hover:text-board-green">{playerName(summary.player)}</Link>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Badge tone={summary.player.playerType === "trial" ? "amber" : "neutral"}>{playerTypeLabel(summary.player.playerType, messages)}</Badge>
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
  if (columnId === "playerType") return playerTypeLabel(summary.player.playerType, messages);
  if (columnId === "captainStatus") return summary.player.captainStatus && summary.player.captainStatus !== "none" ? summary.player.captainStatus.replace("_", " ") : "-";
  if (columnId === "joinedDate") return summary.player.joinedDate ? formatEventDate(summary.player.joinedDate) : "-";
  if (columnId === "archivedStatus") return summary.player.archivedAt ? formatMessage(messages.squad.labels.archived, { date: formatEventDate(summary.player.archivedAt.slice(0, 10)) }) : messages.squad.labels.active;
  if (columnId === "availability") return <StatusDot player={player} compact messages={messages} />;
  if (columnId === "expectedReturn") return medical?.expectedReturnDate ? formatEventDate(medical.expectedReturnDate) : "-";
  if (columnId === "medicalReview") return medical && availabilityLabel(player) === "Needs review" ? messages.squad.labels.needsReview : "-";
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
  if (columnId === "goalPriority") return goalPriorityLabel(player, messages);
  if (columnId === "review") return <span className={cn("font-bold", toneText(player.review.tone))}>{localizedReview(player.review.label, messages)}</span>;
  if (columnId === "coachAssessment") return coachAssessmentLabels[summary.assessment?.assessment ?? "decision_open"];
  if (columnId === "lastObservation") return player.latestObservation ? formatEventDate(player.latestObservation.observationDate) : "-";
  if (columnId === "observationAge") return player.latestObservation ? `${Math.max(0, daysBetween(player.latestObservation.observationDate, todayIso()))}d` : "-";
  if (columnId === "trialDuration") return summary.player.playerType === "trial" ? `${Math.max(0, daysBetween((summary.player.joinedDate ?? summary.player.createdAt).slice(0, 10), todayIso()))}d` : "-";
  if (columnId === "trialTrainings") return summary.player.playerType === "trial" ? String(summary.attended) : "-";
  if (columnId === "trialRatedTrainings") return summary.player.playerType === "trial" ? String(summary.rated) : "-";
  if (columnId === "trialDecision") return summary.player.playerType === "trial" ? coachAssessmentLabels[summary.assessment?.assessment ?? "decision_open"] : "-";
  return "-";
}

function playerHubHref(playerId: string, returnTo: string, tab?: string) {
  const params = new URLSearchParams();
  if (tab) params.set("tab", tab);
  params.set("returnTo", returnTo);
  return `/squad/players/${playerId}?${params.toString()}`;
}

function mobileMetric(metricId: string, player: WorkspacePlayerSummary, messages: Messages) {
  const summary = player.analytics;
  if (metricId === "average") return { label: messages.squad.labels.average, value: formatWorkspaceRating(summary.averageRating), detail: `${summary.rated} ${messages.squad.labels.ratings}` };
  if (metricId === "trend") return { label: messages.squad.labels.trend, value: summary.trend.value === null ? "-" : `${summary.trend.value > 0 ? "+" : ""}${summary.trend.value.toFixed(1)}`, detail: localizedTrend(summary.trend.label, messages) };
  if (metricId === "attendance") return { label: messages.squad.labels.attendance, value: formatWorkspacePercent(summary.attendanceRate), detail: `${summary.attended}/${summary.trainings}` };
  if (metricId === "reliability") return { label: messages.squad.labels.reliability, value: summary.reliabilityPenalty.toFixed(1), detail: `${summary.late} ${messages.squad.labels.late}` };
  if (metricId === "latestRating") return { label: messages.squad.labels.latest, value: summary.latestRating ? String(summary.latestRating) : "-", detail: summary.evidenceBase.label };
  if (metricId === "ratedTrainings") return { label: messages.squad.labels.rated, value: String(summary.rated), detail: messages.common.entities.trainings };
  if (metricId === "evidence") return { label: messages.squad.labels.evidence, value: summary.evidenceBase.label, detail: "" };
  if (metricId === "activeGoals") return { label: messages.squad.labels.goals, value: String(player.activeGoals.length), detail: player.activeGoals.some((goal) => goal.priority === "high") ? messages.squad.labels.highPriority : messages.squad.labels.active };
  if (metricId === "goalPriority") return { label: messages.squad.labels.goalPriority, value: goalPriorityLabel(player, messages), detail: "" };
  if (metricId === "review") return { label: messages.squad.labels.review, value: localizedReview(player.review.label, messages), detail: player.review.dueDate ? formatEventDate(player.review.dueDate) : "" };
  if (metricId === "coachAssessment") return { label: messages.squad.labels.assessment, value: coachAssessmentLabels[summary.assessment?.assessment ?? "decision_open"], detail: "" };
  if (metricId === "lastObservation") return { label: messages.squad.labels.observation, value: player.latestObservation ? formatEventDate(player.latestObservation.observationDate) : "-", detail: "" };
  if (metricId === "expectedReturn") return { label: messages.squad.labels.expectedReturn, value: player.currentMedical?.expectedReturnDate ? formatEventDate(player.currentMedical.expectedReturnDate) : "-", detail: availabilityDetail(player) };
  if (metricId === "trialDuration") return { label: messages.squad.labels.trialDuration, value: summary.player.playerType === "trial" ? `${Math.max(0, daysBetween((summary.player.joinedDate ?? summary.player.createdAt).slice(0, 10), todayIso()))}d` : "-", detail: "" };
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

function groupWorkspacePlayers(data: WorkspaceData, messages: Messages) {
  if (data.configuration.groupMode === "none") return null;
  if (data.configuration.groupMode === "playerType") {
    return [
      { label: messages.squad.filters.rosterPlayers, players: data.players.filter((player) => player.analytics.player.playerType === "roster") },
      { label: messages.squad.filters.trialPlayers, players: data.players.filter((player) => player.analytics.player.playerType === "trial") }
    ].filter((group) => group.players.length);
  }
  const grouped = groupByPosition(data.players);
  return positionGroups.map((label) => ({ label: messages.squad.positionGroups[label], players: grouped[label] })).filter((group) => group.players.length);
}

function recentRatings(summary: WorkspacePlayerSummary["analytics"]) {
  const values = summary.records
    .map((record) => record.overallRating)
    .filter((rating): rating is number => typeof rating === "number")
    .slice(0, 5);
  return values.length ? values.join(" · ") : "-";
}

function goalPriorityLabel(player: WorkspacePlayerSummary, messages: Messages) {
  if (player.activeGoals.some((goal) => goal.priority === "high")) return messages.squad.labels.high;
  if (player.activeGoals.some((goal) => goal.priority === "medium")) return messages.squad.labels.medium;
  if (player.activeGoals.some((goal) => goal.priority === "low")) return messages.squad.labels.low;
  return "-";
}

function localizedQuickView(messages: Messages, viewId: WorkspaceView) {
  const views = messages.squad.views;
  const byId: Record<WorkspaceView, { label: string; description: string }> = {
    all: views.all,
    "by-position": views.byPosition,
    "needs-attention": views.needsAttention,
    development: views.development,
    performance: views.performance,
    attendance: views.attendance,
    unavailable: views.unavailable,
    "trial-players": views.trialPlayers,
    "reviews-due": views.reviewsDue
  };
  return byId[viewId] ?? views.all;
}

function columnLabel(messages: Messages, columnId: WorkspaceColumnDefinition["id"]) {
  const labels: Record<WorkspaceColumnDefinition["id"], string> = {
    player: messages.squad.columns.player,
    position: messages.squad.columns.position,
    secondaryPositions: messages.squad.columns.secondaryPositions,
    age: messages.squad.columns.age,
    dateOfBirth: messages.squad.columns.dateOfBirth,
    strongFoot: messages.squad.columns.strongFoot,
    jerseyNumber: messages.squad.columns.jerseyNumber,
    club: messages.squad.columns.club,
    playerType: messages.squad.columns.playerType,
    captainStatus: messages.squad.columns.captainStatus,
    joinedDate: messages.squad.columns.joinedDate,
    archivedStatus: messages.squad.columns.archivedStatus,
    availability: messages.squad.columns.availability,
    expectedReturn: messages.squad.columns.expectedReturn,
    medicalReview: messages.squad.columns.medicalReview,
    attendance: messages.squad.labels.attendance,
    attendedTrainings: messages.squad.columns.attendedTrainings,
    relevantTrainings: messages.squad.columns.relevantTrainings,
    lastTraining: messages.squad.columns.lastTraining,
    reliability: messages.squad.labels.reliability,
    penalisedLateness: messages.squad.columns.penalisedLateness,
    lateCancellations: messages.squad.columns.lateCancellations,
    average: messages.squad.labels.average,
    latestRating: messages.squad.columns.latestRating,
    trend: messages.squad.labels.trend,
    ratedTrainings: messages.squad.columns.ratedTrainings,
    evidence: messages.squad.labels.evidence,
    recentRatings: messages.squad.columns.recentRatings,
    activeGoals: messages.squad.columns.activeGoals,
    goalPriority: messages.squad.labels.goalPriority,
    review: messages.squad.labels.review,
    coachAssessment: messages.squad.filters.coachAssessment,
    lastObservation: messages.squad.columns.lastObservation,
    observationAge: messages.squad.columns.observationAge,
    trialDuration: messages.squad.labels.trialDuration,
    trialTrainings: messages.squad.columns.trialTrainings,
    trialRatedTrainings: messages.squad.columns.trialRatedTrainings,
    trialDecision: messages.squad.columns.trialDecision
  };
  return labels[columnId];
}

function localizeColumn(column: WorkspaceColumnDefinition, messages: Messages): WorkspaceColumnDefinition {
  return {
    ...column,
    label: columnLabel(messages, column.id)
  };
}

function playerTypeLabel(playerType: string | null | undefined, messages: Messages) {
  return playerType === "trial" ? messages.squad.labels.trial : messages.squad.labels.roster;
}

function localizedAvailability(player: WorkspacePlayerSummary, messages: Messages) {
  const label = availabilityLabel(player);
  if (label === "Available") return messages.squad.labels.available;
  if (label === "Needs review") return messages.squad.labels.needsReview;
  return label;
}

function localizedReview(label: string, messages: Messages) {
  if (label === "No review date") return messages.squad.labels.noReviewDate;
  return label;
}

function localizedTrend(label: string, messages: Messages) {
  if (label === "No trend") return messages.squad.labels.noTrend;
  return label;
}

function localizedPriority(priority: string | null | undefined, messages: Messages) {
  if (priority === "high") return messages.squad.labels.high;
  if (priority === "medium") return messages.squad.labels.medium;
  if (priority === "low") return messages.squad.labels.low;
  return priority ?? "-";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}
