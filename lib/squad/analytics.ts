import { attendanceReasonLabels, calculateReliabilityPenalty } from "@/lib/squad/attendance-utils";
import { seasonLabelForDate } from "@/lib/trainings/utils";
import type {
  PlayerCoachAssessment,
  PlayerCoachAssessmentValue,
  SquadAttendanceEntry,
  SquadPlayer,
  SquadTrainingEvent
} from "@/types/domain";

export type AnalyticsPeriod = "last5" | "last10" | "30d" | "90d" | "season" | "all" | "custom";
export type AnalyticsPlayerTypeFilter = "all" | "roster" | "trial";
export type AnalyticsSortKey =
  | "name"
  | "position"
  | "status"
  | "trainings"
  | "rated"
  | "average"
  | "latestFive"
  | "trend"
  | "attendance"
  | "reliability"
  | "lastTraining"
  | "evidence"
  | "coachAssessment";

export type PlayerAnalyticsRecord = SquadAttendanceEntry & {
  event?: SquadTrainingEvent;
};

export type PlayerAnalyticsSummary = {
  player: SquadPlayer;
  records: PlayerAnalyticsRecord[];
  trainings: number;
  attended: number;
  late: number;
  absent: number;
  unexcused: number;
  rated: number;
  averageRating: number | null;
  latestFiveAverage: number | null;
  trend: PerformanceTrend;
  attendanceRate: number | null;
  reliabilityPenalty: number;
  averageReliabilityPenalty: number | null;
  ratingDistribution: RatingDistribution;
  attendanceDistribution: AttendanceDistribution;
  categorySummaries: CategorySummary[];
  highestRatedArea?: CategorySummary;
  lowestRatedArea?: CategorySummary;
  evidenceBase: EvidenceBase;
  dataSummary: string;
  latestTraining?: PlayerAnalyticsRecord;
  latestRating?: number;
  assessment?: PlayerCoachAssessment;
};

export type RatingDistribution = Record<1 | 2 | 3 | 4 | 5, number>;

export type AttendanceDistribution = {
  present: number;
  late: number;
  injured: number;
  sick: number;
  excused: number;
  privateReason: number;
  lateCancellation: number;
  unexcused: number;
};

export type PerformanceTrend = {
  label: "No trend" | "Early trend" | "Improving" | "Stable" | "Declining";
  value: number | null;
  description: string;
  latestAverage?: number;
  previousAverage?: number;
};

export type EvidenceBase = {
  label: "No performance data" | "First impressions" | "Early tendency" | "Developing evidence" | "Stronger evidence base";
  detail: string;
};

export type CategorySummary = {
  key: "ratingTechnique" | "ratingGameUnderstanding" | "ratingIntensity" | "ratingBehavior";
  label: string;
  average: number | null;
  count: number;
  latestFive: number[];
  trend: PerformanceTrend;
};

const categoryLabels: Record<CategorySummary["key"], string> = {
  ratingTechnique: "Technique",
  ratingGameUnderstanding: "Game understanding",
  ratingIntensity: "Intensity",
  ratingBehavior: "Behavior"
};

export const analyticsPeriodLabels: Record<AnalyticsPeriod, string> = {
  last5: "Last 5 trainings",
  last10: "Last 10 trainings",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  season: "This season",
  all: "All time",
  custom: "Custom range"
};

export const coachAssessmentLabels: Record<PlayerCoachAssessmentValue, string> = {
  decision_open: "Decision open",
  continue_observing: "Continue observing",
  positive_development: "Positive development",
  prospect_player: "Prospect player",
  squad_candidate: "Squad candidate",
  below_required_level: "Currently below required level"
};

export function calculateAverageRating(values: Array<number | null | undefined>) {
  const ratings = values.filter(isRating);
  if (!ratings.length) return null;
  return ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
}

export function calculateRatingDistribution(values: Array<number | null | undefined>): RatingDistribution {
  const distribution: RatingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const value of values) {
    if (isRating(value)) distribution[value as 1 | 2 | 3 | 4 | 5] += 1;
  }
  return distribution;
}

export function calculatePerformanceTrend(values: number[]): PerformanceTrend {
  const ratings = values.filter(isRating);
  if (ratings.length <= 2) {
    return { label: "No trend", value: null, description: "More rated trainings are needed to calculate a trend." };
  }
  if (ratings.length < 5) {
    return { label: "No trend", value: null, description: "Only the current average is shown until more ratings are available." };
  }

  const latestFive = ratings.slice(0, 5);
  const previousFive = ratings.slice(5, 10);
  if (previousFive.length) {
    const latestAverage = average(latestFive);
    const previousAverage = average(previousFive);
    const value = roundOne(latestAverage - previousAverage);
    return {
      label: trendLabel(value, previousFive.length < 5 ? "Early trend" : undefined),
      value,
      latestAverage,
      previousAverage,
      description:
        previousFive.length < 5
          ? "Early trend compares the latest five rated trainings with the available previous rated trainings in this period."
          : "The trend compares the average of the latest five rated trainings with the five rated trainings before them."
    };
  }

  return { label: "No trend", value: null, description: "Not enough rated trainings in this period for a comparison." };
}

export function calculateAttendanceRate(records: PlayerAnalyticsRecord[]) {
  if (!records.length) return null;
  const attended = records.filter((record) => record.finalStatus === "present" || record.finalStatus === "Z").length;
  return attended / records.length;
}

export function calculateAttendanceDistribution(records: PlayerAnalyticsRecord[]): AttendanceDistribution {
  return {
    present: records.filter((record) => record.finalStatus === "present").length,
    late: records.filter((record) => record.finalStatus === "Z").length,
    injured: records.filter((record) => record.finalStatus === "V").length,
    sick: records.filter((record) => record.finalStatus === "K").length,
    excused: records.filter((record) => record.finalStatus === "E").length,
    privateReason: records.filter((record) => record.finalStatus === "P").length,
    lateCancellation: records.filter((record) => record.finalStatus === "S").length,
    unexcused: records.filter((record) => record.finalStatus === "U").length
  };
}

export function calculateReliabilitySummary(records: PlayerAnalyticsRecord[]) {
  const total = records.reduce((sum, record) => sum + calculateReliabilityPenalty(record), 0);
  return {
    total,
    average: records.length ? total / records.length : null
  };
}

export function classifyEvidenceBase(ratedCount: number): EvidenceBase {
  if (ratedCount === 0) return { label: "No performance data", detail: "No final overall ratings are available for this period." };
  if (ratedCount <= 2) return { label: "First impressions", detail: "Use this as an early observation only." };
  if (ratedCount <= 4) return { label: "Early tendency", detail: "A pattern may be emerging, but the data is still limited." };
  if (ratedCount <= 9) return { label: "Developing evidence", detail: "There are enough ratings for a cautious development view." };
  return { label: "Stronger evidence base", detail: "This player has ten or more rated trainings in this period." };
}

export function calculateCategorySummary(records: PlayerAnalyticsRecord[]): CategorySummary[] {
  return (Object.keys(categoryLabels) as CategorySummary["key"][]).map((key) => {
    const values = records.map((record) => record[key]).filter(isRating);
    return {
      key,
      label: categoryLabels[key],
      average: calculateAverageRating(values),
      count: values.length,
      latestFive: values.slice(0, 5),
      trend: calculatePerformanceTrend(values)
    };
  });
}

export function filterRecordsByPeriod(
  records: PlayerAnalyticsRecord[],
  period: AnalyticsPeriod,
  today = new Date(),
  seasonStartMonth = 7,
  seasonStartDay = 1,
  customFrom?: string,
  customTo?: string
) {
  const sorted = sortRecordsByEventDate(records);
  if (period === "all") return sorted;
  if (period === "custom") {
    const fromTime = customFrom ? parseDateToUtc(customFrom) : Number.NaN;
    const toTime = customTo ? parseDateToUtc(customTo) : Number.NaN;
    if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || fromTime > toTime) return [];
    return sorted.filter((record) => {
      const parsed = record.event?.date ? Date.parse(`${record.event.date}T00:00:00Z`) : Number.NaN;
      return Number.isFinite(parsed) && parsed >= fromTime && parsed <= toTime;
    });
  }
  if (period === "last5" || period === "last10") {
    const limit = period === "last5" ? 5 : 10;
    const eventIds = uniqueEventIds(sorted).slice(0, limit);
    return sorted.filter((record) => eventIds.includes(record.eventId));
  }

  if (period === "season") {
    const currentSeason = seasonLabelForDate(dateToDateString(today), seasonStartMonth, seasonStartDay);
    return sorted.filter((record) => record.event?.date && seasonLabelForDate(record.event.date, seasonStartMonth, seasonStartDay) === currentSeason);
  }

  const days = period === "30d" ? 30 : 90;
  const minTime = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() - days + 1);
  return sorted.filter((record) => {
    const parsed = record.event?.date ? Date.parse(`${record.event.date}T00:00:00Z`) : Number.NaN;
    return Number.isFinite(parsed) && parsed >= minTime;
  });
}

export function createPlayerAnalyticsSummary(
  player: SquadPlayer,
  allRecords: PlayerAnalyticsRecord[],
  period: AnalyticsPeriod,
  assessment?: PlayerCoachAssessment,
  seasonStartMonth = 7,
  seasonStartDay = 1,
  customFrom?: string,
  customTo?: string
): PlayerAnalyticsSummary {
  const records = filterRecordsByPeriod(
    allRecords.filter((record) => record.playerId === player.id),
    period,
    new Date(),
    seasonStartMonth,
    seasonStartDay,
    customFrom,
    customTo
  );
  const ratings = records.map((record) => record.overallRating).filter(isRating);
  const attendanceDistribution = calculateAttendanceDistribution(records);
  const reliability = calculateReliabilitySummary(records);
  const categorySummaries = calculateCategorySummary(records);
  const interpretableCategories = categorySummaries.filter((category) => category.count >= 3 && category.average !== null);
  const highestRatedArea = interpretableCategories.length
    ? [...interpretableCategories].sort((a, b) => (b.average ?? 0) - (a.average ?? 0))[0]
    : undefined;
  const lowestRatedArea = interpretableCategories.length
    ? [...interpretableCategories].sort((a, b) => (a.average ?? 0) - (b.average ?? 0))[0]
    : undefined;

  const averageRating = calculateAverageRating(ratings);
  const trend = calculatePerformanceTrend(ratings);
  const attended = records.filter((record) => record.finalStatus === "present" || record.finalStatus === "Z").length;
  const latestRating = ratings[0];
  const evidenceBase = classifyEvidenceBase(ratings.length);

  return {
    player,
    records,
    trainings: records.length,
    attended,
    late: attendanceDistribution.late,
    absent: records.filter((record) => record.finalStatus && !["present", "Z"].includes(record.finalStatus)).length,
    unexcused: attendanceDistribution.unexcused,
    rated: ratings.length,
    averageRating,
    latestFiveAverage: calculateAverageRating(ratings.slice(0, 5)),
    trend,
    attendanceRate: calculateAttendanceRate(records),
    reliabilityPenalty: reliability.total,
    averageReliabilityPenalty: reliability.average,
    ratingDistribution: calculateRatingDistribution(ratings),
    attendanceDistribution,
    categorySummaries,
    highestRatedArea,
    lowestRatedArea,
    evidenceBase,
    dataSummary: classifyDataSummary(averageRating, reliability.total, ratings.length),
    latestTraining: records[0],
    latestRating,
    assessment
  };
}

export function sortPlayerAnalytics(summaries: PlayerAnalyticsSummary[], sort: AnalyticsSortKey) {
  return [...summaries].sort((a, b) => {
    if (sort === "position") return (a.player.position ?? "").localeCompare(b.player.position ?? "") || playerName(a.player).localeCompare(playerName(b.player));
    if (sort === "status") return a.player.playerType.localeCompare(b.player.playerType) || playerName(a.player).localeCompare(playerName(b.player));
    if (sort === "trainings") return b.trainings - a.trainings || playerName(a.player).localeCompare(playerName(b.player));
    if (sort === "rated") return b.rated - a.rated || playerName(a.player).localeCompare(playerName(b.player));
    if (sort === "average") return nullableDesc(a.averageRating, b.averageRating) || playerName(a.player).localeCompare(playerName(b.player));
    if (sort === "latestFive") return nullableDesc(a.latestFiveAverage, b.latestFiveAverage) || playerName(a.player).localeCompare(playerName(b.player));
    if (sort === "trend") return nullableDesc(a.trend.value, b.trend.value) || playerName(a.player).localeCompare(playerName(b.player));
    if (sort === "attendance") return nullableDesc(a.attendanceRate, b.attendanceRate) || playerName(a.player).localeCompare(playerName(b.player));
    if (sort === "reliability") return b.reliabilityPenalty - a.reliabilityPenalty || playerName(a.player).localeCompare(playerName(b.player));
    if (sort === "lastTraining") {
      return (b.latestTraining?.event?.date ?? "").localeCompare(a.latestTraining?.event?.date ?? "") || playerName(a.player).localeCompare(playerName(b.player));
    }
    if (sort === "evidence") return evidenceRank(b.evidenceBase.label) - evidenceRank(a.evidenceBase.label) || b.rated - a.rated || playerName(a.player).localeCompare(playerName(b.player));
    if (sort === "coachAssessment") {
      return (a.assessment?.assessment ?? "decision_open").localeCompare(b.assessment?.assessment ?? "decision_open") || playerName(a.player).localeCompare(playerName(b.player));
    }
    return playerName(a.player).localeCompare(playerName(b.player));
  });
}

export function evidenceBadgeTone(evidence: EvidenceBase["label"]) {
  if (evidence === "No performance data") return "bg-slate-100 text-slate-600";
  if (evidence === "First impressions" || evidence === "Early tendency") return "bg-amber-50 text-amber-700";
  return "bg-green-50 text-green-700";
}

export function formatRating(value: number | null) {
  return value === null ? "No ratings" : roundOne(value).toFixed(1);
}

export function formatPercent(value: number | null) {
  return value === null ? "No data" : `${Math.round(value * 100)}%`;
}

export function playerName(player: SquadPlayer) {
  return [player.firstName, player.lastName].filter(Boolean).join(" ");
}

export function attendanceStatusLabel(key: keyof AttendanceDistribution) {
  const labels: Record<keyof AttendanceDistribution, string> = {
    present: "Present",
    late: "Late",
    injured: attendanceReasonLabels.V,
    sick: attendanceReasonLabels.K,
    excused: attendanceReasonLabels.E,
    privateReason: attendanceReasonLabels.P,
    lateCancellation: attendanceReasonLabels.S,
    unexcused: attendanceReasonLabels.U
  };
  return labels[key];
}

function sortRecordsByEventDate(records: PlayerAnalyticsRecord[]) {
  return [...records].sort((a, b) => {
    const aKey = `${a.event?.date ?? ""} ${a.event?.startTime ?? ""}`;
    const bKey = `${b.event?.date ?? ""} ${b.event?.startTime ?? ""}`;
    return bKey.localeCompare(aKey);
  });
}

function uniqueEventIds(records: PlayerAnalyticsRecord[]) {
  return Array.from(new Set(records.map((record) => record.eventId)));
}

function isRating(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 5;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function trendLabel(value: number, fallback?: PerformanceTrend["label"]): PerformanceTrend["label"] {
  if (value >= 0.3) return "Improving";
  if (value <= -0.3) return "Declining";
  return fallback ?? "Stable";
}

function nullableDesc(a: number | null, b: number | null) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

function evidenceRank(label: EvidenceBase["label"]) {
  if (label === "Stronger evidence base") return 4;
  if (label === "Developing evidence") return 3;
  if (label === "Early tendency") return 2;
  if (label === "First impressions") return 1;
  return 0;
}

function classifyDataSummary(averageRating: number | null, reliabilityPenalty: number, ratedCount: number) {
  if (ratedCount < 5) return "Not enough data for an overall tendency";
  if (averageRating !== null && averageRating >= 4 && reliabilityPenalty >= -1) return "Strong performance and stable reliability";
  if (averageRating !== null && averageRating >= 4) return "Strong performance, reliability to monitor";
  if (averageRating !== null && averageRating >= 3) return "Solid current development";
  return "Performance development to monitor";
}

function dateToDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateToUtc(value: string) {
  const iso = normalizeDateInput(value);
  return iso ? Date.parse(`${iso}T00:00:00Z`) : Number.NaN;
}

function normalizeDateInput(value: string) {
  const trimmed = value.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) return trimmed;
  const germanMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);
  if (!germanMatch) return "";
  const [, day, month, year] = germanMatch;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}
