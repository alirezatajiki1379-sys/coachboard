import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { DrillCard } from "@/components/drills/drill-card";
import { DrillFilters } from "@/components/drills/drill-filters";
import { createClient } from "@/lib/supabase/server";
import { listUserDrills, parseDrillFilters } from "@/lib/drills/queries";

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

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase text-board-green">Drill Library</p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">Your reusable drill base</h1>
          <p className="mt-2 text-slate-600">
            Search, filter, favorite, duplicate, and manage the drills only you can access.
          </p>
        </div>
        <ButtonLink href="/drills/new">
          <Plus className="h-4 w-4" />
          Create drill
        </ButtonLink>
      </section>

      <DrillFilters filters={filters} />

      <section className={drills.length ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 min-[1900px]:grid-cols-5" : "space-y-4"}>
        {drills.length ? (
          drills.map((drill) => <DrillCard key={drill.id} drill={drill} />)
        ) : (
          <div className="rounded-lg border border-dashed border-board-line bg-white p-8 text-center shadow-soft">
            <h2 className="text-lg font-bold text-board-navy">No drills found</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
              Create your first drill, or clear the filters if you were searching. Drill cards show previews, materials,
              and quick actions once your library has content.
            </p>
            <ButtonLink href="/drills/new" className="mt-5">
              <Plus className="h-4 w-4" />
              Create drill
            </ButtonLink>
          </div>
        )}
      </section>
    </div>
  );
}
