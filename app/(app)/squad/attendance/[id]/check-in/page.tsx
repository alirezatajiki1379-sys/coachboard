import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { CheckInPanel } from "@/components/squad/attendance-controls";
import { eventTimeRange, eventTitle, formatEventDate } from "@/lib/squad/attendance-format";
import { getTrainingEventDetail } from "@/lib/squad/attendance-queries";
import { createClient } from "@/lib/supabase/server";

type CheckInPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type CheckInFilter = "all" | "present" | "absent" | "late" | "roster" | "trial";

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
  const rawFilter = Array.isArray(query.view) ? query.view[0] : query.view;
  const selectedFilter = parseCheckInFilter(rawFilter, "all");

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

        <CheckInPanel event={event} initialFilter={selectedFilter} />
      </section>
    </div>
  );
}

function parseCheckInFilter(value: string | undefined, fallback: CheckInFilter): CheckInFilter {
  return value === "all" || value === "present" || value === "late" || value === "absent" || value === "roster" || value === "trial"
    ? value
    : fallback;
}
