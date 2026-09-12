import { Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/button";
import { DrillCard } from "@/components/drills/drill-card";
import { DrillFilters } from "@/components/drills/drill-filters";
import { createClient } from "@/lib/supabase/server";
import { listUserDrills, parseDrillFilters } from "@/lib/drills/queries";
import { getUserLocale } from "@/lib/i18n/server";

type DrillLibraryPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DrillLibraryPage({ searchParams }: DrillLibraryPageProps) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const resolvedSearchParams = await searchParams;
  const filters = parseDrillFilters(resolvedSearchParams);
  const drills = await listUserDrills(supabase, user.id, filters);
  const locale = await getUserLocale(supabase, user.id);
  const copy = drillLibraryCopy[locale];
  const draftCount = filters.view === "drafts" ? drills.length : await countDraftDrills(supabase, user.id);
  const viewLabels = {
    active: copy.views.active,
    published: copy.views.published,
    drafts: `${copy.views.drafts} · ${draftCount}`,
    archived: copy.views.archived,
    trash: copy.views.trash
  } as const;
  const hasFilters = Boolean(
    filters.usage !== "all" ||
    filters.search ||
    filters.ageGroup ||
    filters.mainFocus ||
    filters.subFocus ||
    filters.trainingBlock ||
    filters.drillType ||
    filters.minPlayers ||
    filters.maxPlayers ||
    filters.minDuration ||
    filters.maxDuration ||
    filters.material ||
    filters.sort !== "updated"
  );

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase text-board-green">{copy.eyebrow}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">{copy.title}</h1>
          <p className="mt-2 text-slate-600">
            {copy.description}
          </p>
        </div>
        <ButtonLink href="/drills/new">
          <Plus className="h-4 w-4" />
          {copy.create}
        </ButtonLink>
      </section>

      <nav className="flex flex-wrap gap-2 rounded-lg border border-board-line bg-white p-2 shadow-soft" aria-label={copy.viewsLabel}>
        {(["active", "published", "drafts", "archived", "trash"] as const).map((view) => (
          <Link
            key={view}
            href={view === "active" ? "/drills" : `/drills?view=${view}`}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-semibold transition",
              filters.view === view ? "bg-board-green text-white" : "text-slate-600 hover:bg-slate-100 hover:text-board-navy"
            )}
          >
            {viewLabels[view]}
          </Link>
        ))}
      </nav>

      <DrillFilters filters={filters} locale={locale} />

      <section className={drills.length ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 min-[1900px]:grid-cols-5" : "space-y-4"}>
        {drills.length ? (
          drills.map((drill) => <DrillCard key={drill.id} drill={drill} view={filters.view} />)
        ) : (
          <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
            <h2 className="text-lg font-bold text-board-navy">{emptyTitle(filters, locale)}</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
              {emptyDescription(filters, locale)}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {hasFilters ? <ButtonLink href="/drills" variant="secondary">{copy.clearFilters}</ButtonLink> : null}
              <ButtonLink href="/drills/new">
                <Plus className="h-4 w-4" />
                {copy.create}
              </ButtonLink>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function emptyTitle(filters: ReturnType<typeof parseDrillFilters>, locale: "en" | "de") {
  if (locale === "de") {
    if (filters.usage === "favorites") return "Noch keine Lieblingsübungen";
    if (filters.usage === "recent") return "Keine zuletzt genutzten Übungen";
    if (filters.usage === "never") return "Keine ungenutzten Übungen gefunden";
    const view = drillLibraryCopy.de.views[filters.view];
    return `Keine ${view.toLowerCase()} gefunden`;
  }
  if (filters.usage === "favorites") return "No favorite Drills yet";
  if (filters.usage === "recent") return "No recently used Drills";
  if (filters.usage === "never") return "No unused Drills found";
  return `No ${filters.view === "active" ? "drills" : filters.view} found`;
}

function emptyDescription(filters: ReturnType<typeof parseDrillFilters>, locale: "en" | "de") {
  if (locale === "de") {
    if (filters.usage === "favorites") return "Markiere deine wichtigsten Übungen als Favoriten, damit du sie schnell wiederfindest.";
    if (filters.usage === "recent") return "Zuletzt genutzt enthält nur Übungen aus vergangenen Trainingseinheiten, nicht aus zukünftigen Plänen.";
    if (filters.usage === "never") return "Jede passende Übung wurde bereits genutzt oder deine aktuellen Filter blenden ungenutzte Übungen aus.";
    return "Erstelle deine erste Übung oder setze die Filter zurück. Übungskarten zeigen Vorschau, Material, Nutzung und Schnellaktionen.";
  }
  if (filters.usage === "favorites") return "Favorite the drills you rely on most so you can find them quickly.";
  if (filters.usage === "recent") return "Recently used only includes drills from historical training sessions, not future plans.";
  if (filters.usage === "never") return "Every matching drill has historical usage, or your current filters are hiding unused drills.";
  return "Create your first drill, or clear the filters if you were searching. Drill cards show previews, materials, usage, and quick actions once your library has content.";
}

const drillLibraryCopy = {
  en: {
    eyebrow: "Drill Library",
    title: "Your reusable drill base",
    description: "Search, filter, favorite, duplicate, and manage the drills only you can access.",
    create: "Create drill",
    clearFilters: "Clear filters",
    viewsLabel: "Drill library views",
    views: { active: "All Drills", published: "Published", drafts: "Drafts", archived: "Archived", trash: "Trash" }
  },
  de: {
    eyebrow: "Übungsbibliothek",
    title: "Deine wiederverwendbare Übungssammlung",
    description: "Suche, filtere, favorisiere, dupliziere und verwalte nur die Übungen, auf die du Zugriff hast.",
    create: "Übung erstellen",
    clearFilters: "Filter zurücksetzen",
    viewsLabel: "Ansichten der Übungsbibliothek",
    views: { active: "Alle Übungen", published: "Veröffentlicht", drafts: "Entwürfe", archived: "Archiviert", trash: "Papierkorb" }
  }
} as const;

async function countDraftDrills(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { count, error } = await supabase
    .from("drills")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "draft")
    .is("archived_at", null)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
