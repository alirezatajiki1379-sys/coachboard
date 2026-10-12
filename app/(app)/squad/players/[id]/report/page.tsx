import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PlayerConversationReport } from "@/components/squad/player-conversation-report";
import { getPlayerAnalytics } from "@/lib/squad/analytics-queries";
import type { AnalyticsPeriod } from "@/lib/squad/analytics";
import { getPlayerDevelopmentProfile } from "@/lib/squad/development";
import { listPlayerNotes } from "@/lib/squad/player-notes";
import { mapPlayerAvailabilityPeriodRow, mapPlayerMedicalPeriodRow, type PlayerAvailabilityPeriodRow, type PlayerMedicalPeriodRow } from "@/lib/squad/mappers";
import { getUserLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

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

  const period = parsePeriod(query.period);
  const customFrom = dateParam(one(query.from));
  const customTo = dateParam(one(query.to));
  const db = supabase as unknown as SupabaseClient;
  const [analytics, development, medicalResult, availabilityResult, notes, locale] = await Promise.all([
    getPlayerAnalytics(supabase, user.id, id, period, customFrom, customTo),
    getPlayerDevelopmentProfile(supabase, user.id, id),
    db.from("player_medical_periods").select("id,user_id,player_id,type,start_date,end_date,expected_return_date,actual_return_date,description,status,created_at,updated_at").eq("user_id", user.id).eq("player_id", id).order("start_date", { ascending: false }),
    db.from("player_availability_periods").select("id,user_id,player_id,squad_id,reason,starts_on,ends_on,status,created_at,updated_at").eq("user_id", user.id).eq("player_id", id).order("starts_on", { ascending: false }),
    listPlayerNotes(db, user.id, id),
    getUserLocale(supabase, user.id)
  ]);
  if (!analytics) notFound();
  if (medicalResult.error) throw new Error(medicalResult.error.message);
  if (availabilityResult.error) throw new Error(availabilityResult.error.message);

  const configured = one(query.configured) === "1";
  const section = (name: string) => configured ? one(query[name]) === "1" : true;
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
    selectedNoteIds={many(query.note)}
    selectedObservationIds={many(query.observation)}
    mode={mode}
    configured={configured}
    includePrivateTrainingNotes={one(query.includePrivateTrainingNotes) === "1"}
  />;
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
