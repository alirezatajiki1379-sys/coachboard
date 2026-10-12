import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft } from "lucide-react";
import { PlayerConversationReport } from "@/components/squad/player-conversation-report";
import { PrintButton } from "@/components/sessions/print-button";
import { getPlayerAnalytics } from "@/lib/squad/analytics-queries";
import type { AnalyticsPeriod } from "@/lib/squad/analytics";
import { getPlayerDevelopmentProfile } from "@/lib/squad/development";
import { getUserLocale } from "@/lib/i18n/server";
import { mapPlayerAvailabilityPeriodRow, mapPlayerMedicalPeriodRow, type PlayerAvailabilityPeriodRow, type PlayerMedicalPeriodRow } from "@/lib/squad/mappers";
import { ensureActiveSquad } from "@/lib/squad/squads";
import { loadTrialPeriodData } from "@/lib/squad/trials";
import { createClient } from "@/lib/supabase/server";

type ReportPackPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ReportPackPage({ searchParams }: ReportPackPageProps) {
  const query = await searchParams;
  const requestedIds = unique(many(query.player)).slice(0, 100);
  if (!requestedIds.length) notFound();
  const period = parsePeriod(one(query.period));
  const customFrom = dateParam(one(query.from));
  const customTo = dateParam(one(query.to));
  const mode = one(query.mode) === "player_conversation" ? "player_conversation" : "internal_coach_report";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const db = supabase as unknown as SupabaseClient;
  const [activeSquad, locale] = await Promise.all([ensureActiveSquad(supabase, user.id), getUserLocale(supabase, user.id)]);
  const { data: players, error } = await db.from("squad_players").select("id,player_type").eq("user_id", user.id).eq("squad_id", activeSquad.id).in("id", requestedIds).is("archived_at", null).is("deleted_at", null);
  if (error) throw new Error(error.message);
  const allowed = new Map((players ?? []).map((player) => [player.id as string, player]));
  const orderedIds = requestedIds.filter((id) => allowed.has(id));
  if (!orderedIds.length) notFound();

  const reports = await Promise.all(orderedIds.map(async (playerId) => {
    const [analytics, development, medicalResult, availabilityResult, trialData] = await Promise.all([
      getPlayerAnalytics(supabase, user.id, playerId, period, customFrom, customTo),
      getPlayerDevelopmentProfile(supabase, user.id, playerId),
      db.from("player_medical_periods").select("id,user_id,player_id,type,start_date,end_date,expected_return_date,actual_return_date,description,status,created_at,updated_at").eq("user_id", user.id).eq("player_id", playerId).order("start_date", { ascending: false }),
      db.from("player_availability_periods").select("id,user_id,player_id,squad_id,reason,starts_on,ends_on,status,created_at,updated_at").eq("user_id", user.id).eq("player_id", playerId).order("starts_on", { ascending: false }),
      allowed.get(playerId)?.player_type === "trial" ? loadTrialPeriodData(db, user.id, playerId) : Promise.resolve(null)
    ]);
    if (!analytics || medicalResult.error || availabilityResult.error) return null;
    return {
      playerId,
      summary: analytics.summary,
      development,
      medicalPeriods: ((medicalResult.data ?? []) as PlayerMedicalPeriodRow[]).map((row) => mapPlayerMedicalPeriodRow({ ...row, notes: null })),
      availabilityPeriods: ((availabilityResult.data ?? []) as PlayerAvailabilityPeriodRow[]).map((row) => mapPlayerAvailabilityPeriodRow({ ...row, note: null })),
      trialSummary: trialData?.summary
    };
  }));
  const validReports = reports.filter((report): report is NonNullable<typeof report> => Boolean(report));

  return <div className="report-pack mx-auto max-w-5xl space-y-5"><style>{`@page { size: A4; margin: 14mm; } @media print { .report-pack-item + .report-pack-item { break-before: page; page-break-before: always; } .report-pack { max-width: none !important; } }`}</style><div className="flex flex-wrap items-center justify-between gap-3 print:hidden"><Link href="/squad" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-board-navy"><ArrowLeft className="h-4 w-4" />{locale === "de" ? "Zurück zum Kader" : "Back to Squad"}</Link><div className="flex items-center gap-3"><p className="text-sm font-semibold text-slate-600">{validReports.length} {locale === "de" ? "Spielerreports" : "Player reports"}</p><PrintButton /></div></div>{validReports.map((report) => <div key={report.playerId} className="report-pack-item"><PlayerConversationReport playerId={report.playerId} summary={report.summary} development={report.development} medicalPeriods={report.medicalPeriods} availabilityPeriods={report.availabilityPeriods} notes={[]} locale={locale} period={period} customFrom={customFrom} customTo={customTo} sections={{ attendance: true, absenceReasons: true, availability: true, performance: true, developmentGoals: true, observations: false, playerNotes: false }} selectedNoteIds={[]} selectedObservationIds={[]} mode={mode} configured includePrivateTrainingNotes={false} playerCard={{ squadName: activeSquad.name, trialSummary: report.trialSummary }} readOnly packMode /></div>)}</div>;
}

function parsePeriod(value?: string): AnalyticsPeriod { return value === "last5" || value === "last10" || value === "30d" || value === "90d" || value === "season" || value === "all" || value === "custom" ? value : "last10"; }
function one(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function many(value: string | string[] | undefined) { return value ? Array.isArray(value) ? value : [value] : []; }
function unique(values: string[]) { return Array.from(new Set(values.filter((value) => /^[0-9a-f-]{36}$/i.test(value)))); }
function dateParam(value?: string) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined; }
