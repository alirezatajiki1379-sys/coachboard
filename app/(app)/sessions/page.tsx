import { CalendarPlus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { SessionCard } from "@/components/sessions/session-card";
import { createClient } from "@/lib/supabase/server";
import { listUserSessions, parseSessionListView } from "@/lib/sessions/queries";
import { getUserLocale } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

type SessionsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SessionsPage({ searchParams }: SessionsPageProps) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const view = parseSessionListView(await searchParams);
  const sessions = await listUserSessions(supabase, user.id, view);
  const locale = await getUserLocale(supabase, user.id);
  const copy = sessionLibraryCopy[locale];
  const viewLabels = copy.viewLabels;

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase text-board-green">{copy.eyebrow}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">{copy.title}</h1>
          <p className="mt-2 text-slate-600">{copy.description}</p>
        </div>
        <ButtonLink href="/sessions/new">
          <CalendarPlus className="h-4 w-4" />
          {copy.create}
        </ButtonLink>
      </section>

      <nav className="flex flex-wrap gap-2 rounded-lg border border-board-line bg-white p-2 shadow-soft" aria-label={copy.viewsLabel}>
        {(["active", "archived", "trash"] as const).map((item) => (
          <Link
            key={item}
            href={item === "active" ? "/sessions" : `/sessions?view=${item}`}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-semibold transition",
              view === item ? "bg-board-green text-white" : "text-slate-600 hover:bg-slate-100 hover:text-board-navy"
            )}
          >
            {viewLabels[item]}
          </Link>
        ))}
      </nav>

      <section className="space-y-4">
        {sessions.length ? (
          sessions.map((session) => <SessionCard key={session.id} session={session} view={view} />)
        ) : (
          <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
            <h2 className="text-lg font-bold text-board-navy">{copy.emptyTitle[view]}</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
              {copy.emptyDescription}
            </p>
            <ButtonLink href="/sessions/new" className="mt-5">
              <CalendarPlus className="h-4 w-4" />
              {copy.create}
            </ButtonLink>
          </div>
        )}
      </section>
    </div>
  );
}

const sessionLibraryCopy = {
  en: {
    eyebrow: "Training plans",
    title: "Training plan library",
    description: "Build ordered timelines, calculate materials, and prepare complete training plans.",
    create: "Create training plan",
    viewsLabel: "Training plan views",
    viewLabels: { active: "Active", archived: "Archived", trash: "Trash" },
    emptyTitle: {
      active: "No active training plans found.",
      archived: "No archived training plans found.",
      trash: "No training plans in Trash."
    },
    emptyDescription: "Training plans combine saved drills into blocks, station sets, player groups, timelines, and a printable material list."
  },
  de: {
    eyebrow: "Trainingspläne",
    title: "Trainingsplan-Bibliothek",
    description: "Erstelle geordnete Abläufe, berechne Material und bereite vollständige Trainingspläne vor.",
    create: "Trainingsplan erstellen",
    viewsLabel: "Trainingsplan-Ansichten",
    viewLabels: { active: "Aktiv", archived: "Archiviert", trash: "Papierkorb" },
    emptyTitle: {
      active: "Keine aktiven Trainingspläne vorhanden.",
      archived: "Keine archivierten Trainingspläne vorhanden.",
      trash: "Keine Trainingspläne im Papierkorb."
    },
    emptyDescription: "Trainingspläne verbinden gespeicherte Übungen mit Blöcken, Stationssets, Spielergruppen, Zeitplänen und einer druckbaren Materialliste."
  }
} as const;
