import { ArrowLeft, Clock, Edit, Users } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { DrillActions } from "@/components/drills/drill-actions";
import { DrillGraphicPreview } from "@/components/drills/drill-graphic-preview";
import { editorStateToString } from "@/lib/drills/editor";
import { getDrillGraphic } from "@/lib/drills/graphics";
import { createClient } from "@/lib/supabase/server";
import { getUserDrill } from "@/lib/drills/queries";
import { materialSummary } from "@/lib/drills/materials";

type DrillDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function DrillDetailPage({ params }: DrillDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [drill, graphic] = await Promise.all([getUserDrill(supabase, user.id, id), getDrillGraphic(supabase, user.id, id)]);
  if (!drill) {
    notFound();
  }
  const view = drill.deletedAt ? "trash" : drill.archivedAt ? "archived" : "active";

  return (
    <div className="space-y-6">
      <Link href="/drills" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
        <ArrowLeft className="h-4 w-4" />
        Back to library
      </Link>

      <section className="rounded-lg border border-board-line bg-white p-6 shadow-soft">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold uppercase text-board-green">{drill.mainFocus}</p>
              {drill.status === "draft" ? <StatusBadge label="Draft" /> : null}
              {drill.status === "draft" ? <StatusBadge label="Reusable Draft" neutral /> : null}
              {view === "archived" ? <StatusBadge label="Archived" /> : null}
              {view === "trash" ? <StatusBadge label="Trash" danger /> : null}
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">{drill.title}</h1>
            <p className="mt-3 max-w-3xl text-slate-600">{drill.shortDescription || "No short description yet."}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {view !== "trash" ? <ButtonLink href={`/drills/${drill.id}/edit`} variant="secondary">
              <Edit className="h-4 w-4" />
              {drill.status === "draft" ? "Continue editing" : "Edit"}
            </ButtonLink> : null}
            <DrillActions drillId={drill.id} isFavorite={drill.isFavorite} view={view} isDraft={drill.status === "draft"} />
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <Metric label="Duration" value={`${drill.durationMinutes} min`} icon={<Clock className="h-4 w-4" />} />
          <Metric label="Players" value={`${drill.minPlayers}-${drill.maxPlayers}`} icon={<Users className="h-4 w-4" />} />
          <Metric label="Difficulty" value={`${drill.difficultyLevel}/5`} />
          <Metric label="Intensity" value={`${drill.intensityLevel}/5`} />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
            <h2 className="text-lg font-bold text-board-navy">Drill graphic</h2>
            {graphic.objects.length ? (
              <div className="mt-4">
                <DrillGraphicPreview graphicJson={editorStateToString(graphic)} autoFitContent />
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-board-line bg-board-paper p-6">
                <div className="pitch-grid flex aspect-[16/9] min-h-52 items-center justify-center rounded-md border border-white/50 p-4 text-center">
                  <div className="rounded-md bg-white/90 p-4 shadow-soft">
                    <p className="font-semibold text-board-navy">No drill graphic created yet.</p>
                    <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
                      Open the edit page to create the pitch setup with players, cones, balls, arrows and goals.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>
          <ContentBlock title="Organization" value={drill.organization} />
          <ContentBlock title="Coaching points" value={drill.coachingPoints} />
          <ContentBlock title="Variations" value={drill.variations} />
          <div className="grid gap-6 md:grid-cols-2">
            <ContentBlock title="Easier version" value={drill.easierVersion} />
            <ContentBlock title="Harder version" value={drill.harderVersion} />
          </div>
        </div>

        <aside className="space-y-4">
          <InfoCard title="Categories" items={[drill.drillType, drill.subFocus, ...drill.ageGroups, ...drill.trainingBlocks]} />
          <InfoCard title="Materials" items={[materialSummary(drill.materials)]} />
          <InfoCard title="Tags" items={drill.tags.length ? drill.tags : ["No tags"]} />
        </aside>
      </section>
    </div>
  );
}

function StatusBadge({ label, danger = false, neutral = false }: { label: string; danger?: boolean; neutral?: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${danger ? "bg-red-50 text-red-700" : neutral ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
      {label}
    </span>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-board-line bg-board-paper p-4">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
        {icon}
        {label}
      </p>
      <p className="mt-2 text-lg font-bold text-board-navy">{value}</p>
    </div>
  );
}

function ContentBlock({ title, value }: { title: string; value?: string }) {
  return (
    <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <h2 className="text-lg font-bold text-board-navy">{title}</h2>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{value || "Not added yet."}</p>
    </section>
  );
}

function InfoCard({ title, items }: { title: string; items: Array<string | undefined> }) {
  return (
    <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <h2 className="text-sm font-bold uppercase text-slate-500">{title}</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.filter(Boolean).map((item) => (
          <span key={item} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}
