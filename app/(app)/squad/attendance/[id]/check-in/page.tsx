import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { CheckInPanel } from "@/components/squad/attendance-controls";
import { eventTimeRange, eventTitle, formatEventDate } from "@/lib/squad/attendance-format";
import { createSystemTranslator } from "@/lib/i18n/system-text";
import { getUserLocale } from "@/lib/i18n/server";
import { getTrainingEventDetail } from "@/lib/squad/attendance-queries";
import { createClient } from "@/lib/supabase/server";

type CheckInPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type CheckInFilter = "open" | "all" | "present" | "absent" | "late" | "leftEarly" | "roster" | "trial";

export default async function CheckInPage({ params, searchParams }: CheckInPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [event, locale] = await Promise.all([
    getTrainingEventDetail(supabase, user.id, id),
    getUserLocale(supabase, user.id)
  ]);
  if (!event) notFound();
  const ui = createSystemTranslator(locale);
  const rawFilter = Array.isArray(query.view) ? query.view[0] : query.view;
  const hasOpenAttendance = event.attendance.some((entry) => !entry.finalStatus);
  const selectedFilter = parseCheckInFilter(rawFilter, hasOpenAttendance ? "open" : "all");

  return (
    <div className="space-y-5">
      <Link href={`/trainings/${event.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
        <ArrowLeft className="h-4 w-4" />
        {ui("Back to training")}
      </Link>
      <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-board-green">{ui("Attendance")}</p>
            <h1 className="mt-2 text-2xl font-bold tracking-normal text-board-navy sm:text-3xl">{eventTitle(event)}</h1>
            <p className="mt-2 text-sm font-semibold text-slate-600">
              {formatEventDate(event.date, locale)} · {eventTimeRange(event)}
            </p>
            {event.location ? (
              <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-600">
                <MapPin className="h-4 w-4" />
                {event.location}
              </p>
            ) : null}
          </div>
          {event.attendance.length ? (
            <div className="rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
              {ui("Changes are saved directly")}
            </div>
          ) : null}
        </div>

        <CheckInPanel event={event} initialFilter={selectedFilter} />
      </section>
    </div>
  );
}

function parseCheckInFilter(value: string | undefined, fallback: CheckInFilter): CheckInFilter {
  return value === "open" || value === "all" || value === "present" || value === "late" || value === "leftEarly" || value === "absent" || value === "roster" || value === "trial"
    ? value
    : fallback;
}
