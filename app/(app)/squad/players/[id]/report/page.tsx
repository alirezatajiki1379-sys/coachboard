import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PlayerConversationReport, type PlayerConversationReportProps } from "@/components/squad/player-conversation-report";
import { getPlayerAnalytics } from "@/lib/squad/analytics-queries";
import type { AnalyticsPeriod } from "@/lib/squad/analytics";
import { getPlayerDevelopmentProfile } from "@/lib/squad/development";
import { listPlayerNotes } from "@/lib/squad/player-notes";
import { mapPlayerAvailabilityPeriodRow, mapPlayerMedicalPeriodRow, type PlayerAvailabilityPeriodRow, type PlayerMedicalPeriodRow } from "@/lib/squad/mappers";
import { getUserLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { getPlayerReviewConversation } from "@/lib/squad/player-review-conversations";
import { loadTrialPeriodData } from "@/lib/squad/trials";
import type { PlayerAnalyticsSummary } from "@/lib/squad/analytics";
import type { PlayerDevelopmentProfile } from "@/lib/squad/development";
import type { PlayerAvailabilityPeriod, PlayerMedicalPeriod, PlayerNote } from "@/types/domain";

type PlayerReportPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PlayerReportPage({ params, searchParams }: PlayerReportPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const db = supabase as unknown as SupabaseClient;
  const conversationId = one(query.conversation);
  const [locale, conversation] = await Promise.all([
    getUserLocale(supabase, user.id),
    conversationId ? getPlayerReviewConversation(db, user.id, conversationId) : Promise.resolve(null)
  ]);
  if (conversationId && (!conversation || conversation.playerId !== id)) notFound();
  if (conversation?.status === "finalized") {
    const snapshot = completedSnapshot(conversation.contentSnapshot);
    if (!snapshot) throw new Error("The completed Player Conversation snapshot is unavailable.");
    return <PlayerConversationReport
      playerId={id}
      summary={snapshot.summary}
      development={snapshot.development}
      medicalPeriods={snapshot.medicalPeriods}
      availabilityPeriods={snapshot.availabilityPeriods}
      notes={snapshot.notes}
      locale={locale}
      period={snapshot.period}
      customFrom={snapshot.customFrom}
      customTo={snapshot.customTo}
      sections={snapshot.sections}
      selectedNoteIds={snapshot.selectedNoteIds}
      selectedObservationIds={snapshot.selectedObservationIds}
      mode="player_conversation"
      configured
      includePrivateTrainingNotes={false}
      playerCard={snapshot.playerCard}
      conversation={conversation}
      readOnly
      notice={notice(one(query.saved), locale)}
    />;
  }

  const period = conversation ? "custom" : parsePeriod(query.period);
  const customFrom = conversation?.periodStart ?? dateParam(one(query.from));
  const customTo = conversation?.periodEnd ?? dateParam(one(query.to));
  const [analytics, development, medicalResult, availabilityResult, notes, squadResult] = await Promise.all([
    getPlayerAnalytics(supabase, user.id, id, period, customFrom, customTo),
    getPlayerDevelopmentProfile(supabase, user.id, id),
    db.from("player_medical_periods").select("id,user_id,player_id,type,start_date,end_date,expected_return_date,actual_return_date,description,status,created_at,updated_at").eq("user_id", user.id).eq("player_id", id).order("start_date", { ascending: false }),
    db.from("player_availability_periods").select("id,user_id,player_id,squad_id,reason,starts_on,ends_on,status,created_at,updated_at").eq("user_id", user.id).eq("player_id", id).order("starts_on", { ascending: false }),
    listPlayerNotes(db, user.id, id),
    db.from("squad_players").select("player_type,squad_id,squads(name)").eq("user_id", user.id).eq("id", id).maybeSingle()
  ]);
  if (!analytics) notFound();
  if (medicalResult.error) throw new Error(medicalResult.error.message);
  if (availabilityResult.error) throw new Error(availabilityResult.error.message);
  if (squadResult.error) throw new Error(squadResult.error.message);
  const trialData = analytics.summary.player.playerType === "trial" ? await loadTrialPeriodData(db, user.id, id) : null;

  const configured = one(query.configured) === "1";
  const section = (name: string) => conversation?.sections?.[name] ?? (configured ? one(query[name]) === "1" : true);
  const mode = one(query.mode) === "internal_coach_report" ? "internal_coach_report" : "player_conversation";

  return <PlayerConversationReport
    playerId={id}
    summary={analytics.summary}
    development={development}
    medicalPeriods={((medicalResult.data ?? []) as PlayerMedicalPeriodRow[]).map((row) => mapPlayerMedicalPeriodRow({ ...row, notes: null }))}
    availabilityPeriods={((availabilityResult.data ?? []) as PlayerAvailabilityPeriodRow[]).map((row) => mapPlayerAvailabilityPeriodRow({ ...row, note: null }))}
    notes={notes}
    locale={locale}
    period={period}
    customFrom={customFrom}
    customTo={customTo}
    sections={{
      attendance: section("attendance"),
      absenceReasons: section("absenceReasons"),
      availability: section("availability"),
      performance: section("performance"),
      developmentGoals: section("developmentGoals"),
      observations: section("observations"),
      playerNotes: section("playerNotes")
    }}
    selectedNoteIds={conversation?.selectedNoteIds ?? many(query.note)}
    selectedObservationIds={conversation?.selectedObservationIds ?? many(query.observation)}
    mode={mode}
    configured={configured}
    includePrivateTrainingNotes={one(query.includePrivateTrainingNotes) === "1"}
    playerCard={{ squadName: squadName(squadResult.data), trialSummary: trialData?.summary }}
    conversation={conversation ?? undefined}
    notice={notice(one(query.saved), locale)}
    error={one(query.reportError)}
  />;
}

type CompletedSnapshot = Pick<PlayerConversationReportProps, "summary" | "development" | "medicalPeriods" | "availabilityPeriods" | "notes" | "period" | "customFrom" | "customTo" | "sections" | "selectedNoteIds" | "selectedObservationIds" | "playerCard">;

function completedSnapshot(value: unknown): CompletedSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as Record<string, unknown>;
  if (snapshot.version !== 1 || !snapshot.summary || !snapshot.development || !snapshot.sections || !snapshot.playerCard) return null;
  return {
    summary: snapshot.summary as PlayerAnalyticsSummary,
    development: snapshot.development as PlayerDevelopmentProfile,
    medicalPeriods: Array.isArray(snapshot.medicalPeriods) ? snapshot.medicalPeriods as PlayerMedicalPeriod[] : [],
    availabilityPeriods: Array.isArray(snapshot.availabilityPeriods) ? snapshot.availabilityPeriods as PlayerAvailabilityPeriod[] : [],
    notes: Array.isArray(snapshot.notes) ? snapshot.notes as PlayerNote[] : [],
    period: parsePeriod(typeof snapshot.period === "string" ? snapshot.period : undefined),
    customFrom: typeof snapshot.customFrom === "string" ? snapshot.customFrom : undefined,
    customTo: typeof snapshot.customTo === "string" ? snapshot.customTo : undefined,
    sections: snapshot.sections as CompletedSnapshot["sections"],
    selectedNoteIds: Array.isArray(snapshot.selectedNoteIds) ? snapshot.selectedNoteIds.filter((item): item is string => typeof item === "string") : [],
    selectedObservationIds: Array.isArray(snapshot.selectedObservationIds) ? snapshot.selectedObservationIds.filter((item): item is string => typeof item === "string") : [],
    playerCard: snapshot.playerCard as CompletedSnapshot["playerCard"]
  };
}

function squadName(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const squads = (value as { squads?: { name?: unknown } | Array<{ name?: unknown }> | null }).squads;
  const squad = Array.isArray(squads) ? squads[0] : squads;
  return typeof squad?.name === "string" ? squad.name : undefined;
}

function notice(value: string | undefined, locale: "en" | "de") {
  if (value === "draft") return locale === "de" ? "Entwurf gespeichert." : "Draft saved.";
  if (value === "completed") return locale === "de" ? "Gespräch abgeschlossen. Der historische Stand ist gespeichert." : "Conversation completed. The historical snapshot is saved.";
  return undefined;
}

function parsePeriod(value?: string | string[]): AnalyticsPeriod {
  const raw = one(value);
  return raw === "last5" || raw === "last10" || raw === "30d" || raw === "90d" || raw === "season" || raw === "all" || raw === "custom" ? raw : "season";
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function many(value: string | string[] | undefined) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function dateParam(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}
