import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { CheckInActions, CheckInRow } from "@/components/squad/attendance-controls";
import { attendanceCounts, eventTimeRange, eventTitle, formatEventDate } from "@/lib/squad/attendance-format";
import { getTrainingEventDetail } from "@/lib/squad/attendance-queries";
import { isGoalkeeperPosition } from "@/lib/squad/attendance-utils";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type CheckInPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type CheckInFilter = "all" | "unresolved" | "present" | "late" | "absent" | "roster" | "trial";

const filterLabels: Record<CheckInFilter, string> = {
  all: "All",
  unresolved: "Unresolved",
  present: "Present",
  late: "Late",
  absent: "Absent",
  roster: "Roster",
  trial: "Trial players"
};

export default async function CheckInPage({ params, searchParams }: CheckInPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const event = await getTrainingEventDetail(supabase, user.id, id);
  if (!event) notFound();
  const counts = attendanceCounts(event.attendance);
  const unresolved = event.attendance.filter((entry) => !entry.finalStatus).length;
  const presentEntries = event.attendance.filter((entry) => entry.finalStatus === "present" || entry.finalStatus === "Z");
  const presentGoalkeepers = presentEntries.filter((entry) => isGoalkeeperPosition(entry.player?.position)).length;
  const presentTrialPlayers = presentEntries.filter((entry) => entry.player?.playerType === "trial").length;
  const hasStarted = event.attendance.some((entry) => entry.finalStatus);
  const rawFilter = Array.isArray(query.view) ? query.view[0] : query.view;
  const selectedFilter = parseCheckInFilter(rawFilter, hasStarted && unresolved > 0 ? "unresolved" : "all");
  const visibleEntries = event.attendance.filter((entry) => {
    if (selectedFilter === "unresolved") return !entry.finalStatus;
    if (selectedFilter === "present") return entry.finalStatus === "present";
    if (selectedFilter === "late") return entry.finalStatus === "Z";
    if (selectedFilter === "absent") return Boolean(entry.finalStatus && entry.finalStatus !== "present" && entry.finalStatus !== "Z");
    if (selectedFilter === "roster") return entry.player?.playerType !== "trial";
    if (selectedFilter === "trial") return entry.player?.playerType === "trial";
    return true;
  });

  return (
    <div className="space-y-5">
      <Link href={`/squad/attendance/${event.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
        <ArrowLeft className="h-4 w-4" />
        Back to event
      </Link>
      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-board-green">
              {formatEventDate(event.date)} · {eventTimeRange(event)} · {event.status.replaceAll("_", " ")}
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-normal text-board-navy sm:text-3xl">{eventTitle(event)}</h1>
            {event.location ? (
              <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-600">
                <MapPin className="h-4 w-4" />
                {event.location}
              </p>
            ) : null}
            <p className="mt-2 text-sm text-slate-600">Mark who is present, late or absent.</p>
          </div>
          {event.attendance.length ? (
            <div className="rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
              Saved after each action
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <CheckInMetric label="Present" value={counts.present} tone="success" />
          <CheckInMetric label="Late" value={counts.late} tone="warning" />
          <CheckInMetric label="Absent" value={counts.absent} tone="danger" />
          <CheckInMetric label="Unresolved" value={unresolved} />
          <CheckInMetric label="Total" value={event.attendance.length} />
        </div>
        {presentEntries.length ? (
          <p className="mt-3 text-xs font-semibold text-slate-500">
            {presentGoalkeepers} GK present · {presentTrialPlayers} trial player{presentTrialPlayers === 1 ? "" : "s"} present
          </p>
        ) : null}
        {event.attendance.length ? <div className="mt-4"><CheckInActions eventId={event.id} /></div> : null}
      </section>

      {event.attendance.length ? (
        <nav className="flex gap-2 overflow-x-auto rounded-lg border border-board-line bg-white p-2 shadow-soft" aria-label="Check-in filters">
          {(Object.keys(filterLabels) as CheckInFilter[]).map((filter) => (
            <Link
              key={filter}
              href={filter === "all" ? `/squad/attendance/${event.id}/check-in` : `/squad/attendance/${event.id}/check-in?view=${filter}`}
              className={cn(
                "shrink-0 rounded-md px-3 py-2 text-sm font-semibold transition",
                selectedFilter === filter ? "bg-board-green text-white" : "text-slate-600 hover:bg-slate-100 hover:text-board-navy"
              )}
            >
              {filterLabels[filter]}
            </Link>
          ))}
        </nav>
      ) : null}

      <section className="space-y-3">
        {event.attendance.length ? (
          visibleEntries.length ? (
            visibleEntries.map((entry) => <CheckInRow key={entry.id} entry={entry} eventId={event.id} />)
          ) : (
            <p className="rounded-lg border border-dashed border-board-line bg-white p-5 text-center text-sm font-semibold text-slate-500 shadow-soft">
              No players match this filter.
            </p>
          )
        ) : (
          <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
            <h2 className="font-bold text-board-navy">No players to check in</h2>
            <p className="mt-2 text-sm text-slate-600">Go back to the event and add squad or trial players first.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function parseCheckInFilter(value: string | undefined, fallback: CheckInFilter): CheckInFilter {
  return value === "all" || value === "unresolved" || value === "present" || value === "late" || value === "absent" || value === "roster" || value === "trial"
    ? value
    : fallback;
}

function CheckInMetric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const styles = {
    neutral: "bg-slate-50 text-board-navy",
    success: "bg-green-50 text-green-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-700"
  };
  return (
    <div className={`rounded-md px-3 py-3 ${styles[tone]}`}>
      <p className="text-xs font-bold uppercase tracking-wide opacity-75">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
