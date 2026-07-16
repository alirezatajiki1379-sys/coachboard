import { DrillForm } from "@/components/drills/drill-form";
import { createDrill } from "@/lib/drills/actions";
import { editorStateToString } from "@/lib/drills/editor";
import { defaultEditorState } from "@/types/editor";

export default function NewDrillPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase text-board-green">Create Drill</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-board-navy">Add a drill to your library</h1>
        <p className="mt-2 text-slate-600">
          Add the coaching content, draw the pitch setup, and update materials from the graphic when you are ready.
        </p>
      </div>
      <DrillForm action={createDrill} mode="create" graphicJson={editorStateToString(defaultEditorState)} />
    </div>
  );
}
