import { notFound, redirect } from "next/navigation";
import { DrillForm } from "@/components/drills/drill-form";
import { updateDrill } from "@/lib/drills/actions";
import { editorStateToString } from "@/lib/drills/editor";
import { getDrillGraphic } from "@/lib/drills/graphics";
import { getUserDrill } from "@/lib/drills/queries";
import { createClient } from "@/lib/supabase/server";

type EditDrillPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditDrillPage({ params }: EditDrillPageProps) {
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

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase text-board-green">Edit Drill</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">{drill.title}</h1>
        <p className="mt-2 text-slate-600">Update metadata, coaching notes, materials, and categorization.</p>
      </div>
      <DrillForm action={updateDrill} drill={drill} mode="edit" graphicJson={editorStateToString(graphic)} />
    </div>
  );
}
