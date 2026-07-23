import { notFound, redirect } from "next/navigation";
import { DrillForm } from "@/components/drills/drill-form";
import { updateDrill } from "@/lib/drills/actions";
import { editorStateToString } from "@/lib/drills/editor";
import { getDrillGraphic } from "@/lib/drills/graphics";
import { getUserDrill } from "@/lib/drills/queries";
import { createClient } from "@/lib/supabase/server";

type EditDrillPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EditDrillPage({ params, searchParams }: EditDrillPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const rawReturnTo = Array.isArray(query.returnTo) ? query.returnTo[0] : query.returnTo;
  const returnTo = rawReturnTo?.startsWith("/") && !rawReturnTo.startsWith("//") ? rawReturnTo : "";
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

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase text-board-green">Edit Drill</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold tracking-normal text-board-navy">{drill.title}</h1>
          {drill.status === "draft" ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">Draft</span> : null}
        </div>
        <p className="mt-2 text-slate-600">{drill.status === "draft" ? "Continue this reusable draft. Use Publish Drill when it is ready for normal library use." : "Update metadata, coaching notes, materials, and categorization."}</p>
      </div>
      <DrillForm action={updateDrill} drill={drill} mode="edit" graphicJson={editorStateToString(graphic)} defaultReturnTo={returnTo} cancelHref={returnTo || undefined} />
    </div>
  );
}
