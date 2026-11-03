import { Info } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { analyticsCopy } from "./analytics-copy";

const metricIndex = { rating: 0, trend: 1, expected: 2, ratingCoverage: 3, coverage: 4, reliability: 6, evidence: 7 } as const;
export type ExplainedMetric = keyof typeof metricIndex | "participation" | "attendance";

export function metricExplanation(metric: ExplainedMetric, locale: Locale) {
  if (metric === "participation") return locale === "de"
    ? { title: "Teilnahmequote", text: "Anwesend, Verspätet und Training abgebrochen geteilt durch alle relevanten historischen Teilnehmer-Einträge, einschließlich Nicht eingeplant und Nicht erfasst." }
    : { title: "Participation rate", text: "Present, Late and Left early divided by all relevant historical participant snapshots, including Not expected and Not recorded." };
  if (metric === "attendance") return locale === "de"
    ? { title: "Anwesenheit", text: "Teilnahmen geteilt durch Teilnahmegelegenheiten: jede tatsächliche Teilnahme sowie eingeplante Trainings mit erfasstem Ergebnis. Nicht eingeplante tatsächliche Teilnahmen zählen mit." }
    : { title: "Attendance", text: "Participation divided by attendance opportunities: every actual participation, plus expected trainings with a recorded outcome. Actual participation while not expected is included." };
  return analyticsCopy[locale].helpItems[metricIndex[metric]];
}

export function AnalyticsMetricHelp({ metric, locale }: { metric: ExplainedMetric; locale: Locale }) {
  const item = metricExplanation(metric, locale);
  return <details className="mt-2 text-xs font-normal text-slate-600">
    <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 rounded focus-visible:outline focus-visible:outline-2" aria-label={locale === "de" ? `Berechnung: ${item.title}` : `Calculation: ${item.title}`}>
      <Info className="h-3.5 w-3.5" /><span>{locale === "de" ? "Berechnung" : "Calculation"}</span>
    </summary>
    <p className="mt-1 max-w-prose whitespace-normal break-words text-left leading-5 [overflow-wrap:anywhere]">{item.text}</p>
  </details>;
}

export function AnalyticsMethodology({ locale }: { locale: Locale }) {
  const copy = analyticsCopy[locale];
  const items = [metricExplanation("participation", locale), metricExplanation("attendance", locale), ...copy.helpItems];
  return <section className="border-t border-board-line py-5" data-methodology>
    <h2 className="text-lg font-bold text-board-navy">{copy.helpTitle}</h2>
    <dl className="mt-4 grid gap-x-8 gap-y-5 md:grid-cols-2">{items.map((item) => <div key={item.title} className="min-w-0"><dt className="font-bold text-board-navy">{item.title}</dt><dd className="mt-1 text-sm leading-6 text-slate-600">{item.text}</dd></div>)}</dl>
  </section>;
}
