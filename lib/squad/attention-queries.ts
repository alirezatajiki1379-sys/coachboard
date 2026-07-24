import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalyticsPeriod } from "@/lib/squad/analytics";
import {
  applyAttentionStates,
  attentionSummary,
  filterAttentionItems,
  getAttentionPreferences,
  getPlayerAttentionItems,
  getTrainingAttentionItems,
  isSnoozed,
  listAttentionStates,
  parseAttentionCenterState,
  sortAttentionItems,
  type AttentionCenterData,
  type AttentionCenterState
} from "@/lib/squad/attention";
import { getCoachWorkspaceData, parseWorkspaceState } from "@/lib/squad/workspace";
import { listTrainingEventDetails } from "@/lib/squad/attendance-queries";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function getAttentionCenterData(supabase: SupabaseServerClient, userId: string, state: AttentionCenterState): Promise<AttentionCenterData> {
  const db = supabase as unknown as SupabaseClient;
  const preferences = await getAttentionPreferences(db, userId);
  const states = await listAttentionStates(db, userId);
  const workspaceState = parseWorkspaceState({
    view: "all",
    players: state.playerType === "all" ? "active" : state.playerType,
    period: state.period,
    position: state.position,
    search: ""
  });
  const [workspace, trainingEvents] = await Promise.all([
    getCoachWorkspaceData(supabase, userId, workspaceState, { includeAttention: false }),
    listTrainingEventDetails(supabase, userId)
  ]);
  const allItems = applyAttentionStates(
    [
      ...getTrainingAttentionItems(trainingEvents, { today: new Date().toISOString().slice(0, 10) }),
      ...workspace.allPlayers.flatMap((player) => getPlayerAttentionItems(player, preferences, {
        today: new Date().toISOString().slice(0, 10),
        periodLabel: workspace.periodRangeLabel || workspace.periodLabel
      }))
    ],
    states
  );
  const filtered = sortAttentionItems(filterAttentionItems(allItems, state), state);
  return {
    state,
    preferences,
    allItems,
    items: filtered,
    selected: filtered.find((item) => item.key === state.item) ?? filtered[0],
    positions: workspace.positions,
    summary: attentionSummary(allItems)
  };
}

export async function getDashboardAttentionSummary(supabase: SupabaseServerClient, userId: string) {
  const data = await getAttentionCenterData(supabase, userId, parseAttentionCenterState({}));
  return data.summary;
}

export async function getDashboardAttentionData(supabase: SupabaseServerClient, userId: string) {
  const data = await getAttentionCenterData(supabase, userId, parseAttentionCenterState({ status: "open", priority: "all" }));
  return {
    summary: data.summary,
    items: data.allItems
      .filter((item) => !item.dismissedAt && !item.resolvedAt && !isSnoozed(item))
      .filter((item) => item.priority === "critical" || item.priority === "high" || item.category === "trial")
      .sort((a, b) => {
        const rank = (priority: string) => priority === "critical" ? 0 : priority === "high" ? 1 : priority === "medium" ? 2 : 3;
        return rank(a.priority) - rank(b.priority) || (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31");
      })
      .slice(0, 3)
  };
}

export async function getPlayerAttentionSummary(supabase: SupabaseServerClient, userId: string, playerId: string, period: AnalyticsPeriod = "30d") {
  const data = await getAttentionCenterData(supabase, userId, parseAttentionCenterState({ period, player: playerId }));
  return data.allItems.filter((item) => item.playerId === playerId && item.dismissedAt == null && !isSnoozed(item));
}
