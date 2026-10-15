import Link from "next/link";
import { formatNumber, type Locale } from "@/lib/i18n";
import type { PlayerAnalyticsSummary } from "@/lib/squad/analytics";
import { cn } from "@/lib/utils";

export function ReliabilityValue({
  summary,
  locale,
  showReviewLink = true,
  align = "right",
  className
}: {
  summary: PlayerAnalyticsSummary;
  locale: Locale;
  showReviewLink?: boolean;
  align?: "left" | "right";
  className?: string;
}) {
  const details = reliabilityBreakdownLabels(summary, locale);
  return (
    <div className={cn("flex flex-col gap-0.5", align === "right" ? "items-end text-right" : "items-start text-left", className)}>
      <span className="font-bold tabular-nums text-board-navy">{formatNumber(summary.reliabilityPenalty, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
      {details.map((detail) => <span key={detail} className="text-xs font-semibold text-slate-500">{detail}</span>)}
      {showReviewLink && summary.reliabilityBreakdown.legacyNeedsReview > 0 && summary.legacyReliabilityReviewEventId ? (
        <Link href={`/trainings/${summary.legacyReliabilityReviewEventId}/check-in`} className="text-xs font-bold text-amber-700 underline-offset-4 hover:underline">
          {locale === "de" ? "Anwesenheit prüfen" : "Review attendance"}
        </Link>
      ) : null}
    </div>
  );
}

export function reliabilityBreakdownLabels(summary: PlayerAnalyticsSummary, locale: Locale) {
  const breakdown = summary.reliabilityBreakdown;
  const labels: string[] = [];
  if (breakdown.unexcused) labels.push(locale === "de" ? `${breakdown.unexcused}× unentschuldigt` : `${breakdown.unexcused}× unexcused`);
  if (breakdown.late) labels.push(locale === "de" ? `${breakdown.late}× verspätet` : `${breakdown.late}× late`);
  if (breakdown.lateCancellation) labels.push(locale === "de" ? `${breakdown.lateCancellation}× verspätet abgesagt` : `${breakdown.lateCancellation}× late cancellation`);
  if (breakdown.legacyNeedsReview) labels.push(locale === "de"
    ? breakdown.legacyNeedsReview === 1 ? "1 alter Eintrag zu prüfen" : `${breakdown.legacyNeedsReview} alte Einträge zu prüfen`
    : `${breakdown.legacyNeedsReview} old attendance record${breakdown.legacyNeedsReview === 1 ? "" : "s"} to review`);
  return labels;
}
