import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, Clock3, UserRound } from "lucide-react";
import { PrintButton } from "@/components/sessions/print-button";
import { SessionDrillPreview } from "@/components/sessions/session-drill-preview";
import { createSignedImageUrlMap } from "@/lib/drills/graphics";
import { parseEditorState } from "@/lib/drills/editor";
import { getActiveLocale } from "@/lib/i18n/server";
import { createSystemTranslator } from "@/lib/i18n/system-text";
import { getTrainingEventDetail } from "@/lib/squad/attendance-queries";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import type { DrillVisual } from "@/types/domain";
import { defaultEditorState } from "@/types/editor";

type SectionRow = {
  id: string; title: string; order_index: number; duration_minutes: number; section_notes: string | null;
  responsibility_mode: string; staff_id: string | null; planning_status: string; instruction: string | null; briefing_text: string | null;
};
type DrillRow = {
  id: string; section_id: string | null; title: string; order_index: number; planned_duration_minutes: number | null;
  snapshot_json: Json; override_json: Json; responsibility_mode: string | null; responsible_staff_id: string | null;
  planning_status: string | null; planning_instruction: string | null;
};

export default async function StaffBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [locale, supabase] = await Promise.all([getActiveLocale(), createClient()]);
  const ui = createSystemTranslator(locale);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const event = await getTrainingEventDetail(supabase, user.id, id);
  if (!event || event.deletedAt) notFound();
  const db = supabase as unknown as SupabaseClient;
  const [planResult, sectionResult, drillResult, staffResult] = await Promise.all([
    db.from("training_session_plan_instances").select("title,plan_json").eq("user_id", user.id).eq("event_id", id).maybeSingle(),
    db.from("training_section_briefs").select("id,title,order_index,duration_minutes,section_notes,responsibility_mode,staff_id,planning_status,instruction,briefing_text").eq("user_id", user.id).eq("event_id", id).order("order_index"),
    db.from("training_session_drill_instances").select("id,section_id,title,order_index,planned_duration_minutes,snapshot_json,override_json,responsibility_mode,responsible_staff_id,planning_status,planning_instruction").eq("user_id", user.id).eq("event_id", id).neq("status", "removed").order("order_index"),
    event.squadId ? db.from("squad_staff").select("id,name").eq("user_id", user.id).eq("squad_id", event.squadId) : Promise.resolve({ data: [], error: null })
  ]);
  if (planResult.error) throw new Error(planResult.error.message);
  if (!planResult.data) redirect(`/trainings/${id}/plan`);
  if (sectionResult.error) throw new Error(sectionResult.error.message);
  if (drillResult.error) throw new Error(drillResult.error.message);
  if (staffResult.error) throw new Error(staffResult.error.message);
  const sections = (sectionResult.data ?? []) as SectionRow[];
  const drills = (drillResult.data ?? []) as DrillRow[];
  const staffNames = new Map((staffResult.data ?? []).map((member) => [member.id as string, member.name as string]));
  const paths = drills.flatMap((drill) => {
    const visual = record(record(drill.snapshot_json)?.sourceDrill)?.visual;
    const path = record(visual)?.uploadedImagePath;
    return typeof path === "string" ? [path] : [];
  });
  const signedUrls = await createSignedImageUrlMap(supabase, paths);
  const planJson = record(planResult.data.plan_json);
  const objective = stringValue(planJson?.mainFocus) || event.focus;

  return <div className="mx-auto max-w-[1100px] space-y-5">
    <div className="no-print flex flex-wrap items-center justify-between gap-3">
      <Link href={`/trainings/${id}/plan`} className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-board-green"><ArrowLeft className="h-4 w-4" />{ui("Back to Session Plan")}</Link>
      <PrintButton locale={locale} />
    </div>
    <article className="rounded-lg border border-board-line bg-white p-5 shadow-soft print:border-0 print:p-0 print:shadow-none sm:p-7">
      <header className="border-b-2 border-board-navy pb-5">
        <p className="text-sm font-bold uppercase text-board-green">{ui("Staff Brief")}</p>
        <h1 translate="no" className="mt-1 text-3xl font-bold text-board-navy">{planResult.data.title}</h1>
        <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold text-slate-600">
          <span>{event.date}</span><span>{event.startTime}{event.endTime ? `–${event.endTime}` : ""}</span>{event.squadName ? <span translate="no">{event.squadName}</span> : null}{event.location ? <span translate="no">{event.location}</span> : null}
        </div>
        {objective ? <p translate="no" className="mt-3 text-sm text-slate-700"><b>{ui("Training objective")}:</b> {objective}</p> : null}
      </header>
      <div className="mt-6 space-y-5">
        {sections.map((section, sectionIndex) => {
          const sectionDrills = drills.filter((drill) => drill.section_id === section.id);
          const sectionCoach = responsibilityText(section.responsibility_mode, section.staff_id, staffNames, ui);
          return <section key={section.id} className="break-inside-avoid rounded-md border border-board-line p-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-board-line pb-3">
              <div><p className="text-xs font-bold uppercase text-board-green">{ui("Section")} {sectionIndex + 1}</p><h2 translate="no" className="text-xl font-bold text-board-navy">{section.title}</h2></div>
              <div className="flex flex-wrap gap-2 text-xs font-bold text-slate-600"><span className="inline-flex items-center gap-1 rounded bg-board-paper px-2 py-1"><Clock3 className="h-3.5 w-3.5" />{section.duration_minutes} {ui("min")}</span><span className="inline-flex items-center gap-1 rounded bg-board-paper px-2 py-1"><UserRound className="h-3.5 w-3.5" />{sectionCoach}</span></div>
            </div>
            {section.briefing_text || section.section_notes ? <p translate="no" className="mt-3 text-sm text-slate-700">{section.briefing_text || section.section_notes}</p> : null}
            {section.instruction ? <p translate="no" className="mt-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900"><b>{ui("Planning instruction")}:</b> {section.instruction}</p> : null}
            <div className="mt-3 space-y-3">{sectionDrills.length ? sectionDrills.map((drill) => {
              const source = record(record(drill.snapshot_json)?.sourceDrill); const override = record(drill.override_json);
              const description = stringValue(override?.briefingText) || stringValue(override?.description) || stringValue(source?.shortDescription ?? source?.short_description);
              const organization = stringValue(override?.organization) || stringValue(source?.organization);
              const sessionNote = stringValue(override?.sessionNote) || stringValue(override?.coachNotes);
              const points = Array.isArray(override?.coachingPoints) ? stringArray(override?.coachingPoints) : coachingPoints(source?.coachingPoints ?? source?.coaching_points);
              const visual = snapshotVisual(source, signedUrls);
              const coach = drill.responsibility_mode ? responsibilityText(drill.responsibility_mode, drill.responsible_staff_id, staffNames, ui) : sectionCoach;
              return <article key={drill.id} className="break-inside-avoid grid gap-4 rounded-md bg-board-paper p-3 md:grid-cols-[minmax(0,1fr)_250px]">
                <div className="min-w-0"><div className="flex flex-wrap items-start justify-between gap-2"><h3 translate="no" className="font-bold text-board-navy">{drill.title}</h3><span className="text-xs font-bold text-slate-500">{drill.planned_duration_minutes ?? 0} {ui("min")} · {coach}</span></div>{description ? <p translate="no" className="mt-2 text-sm text-slate-700">{description}</p> : null}{organization ? <p translate="no" className="mt-2 text-sm text-slate-600"><b>{ui("Organization")}:</b> {organization}</p> : null}{sessionNote ? <p translate="no" className="mt-2 text-sm text-slate-600"><b>{ui("Session note")}:</b> {sessionNote}</p> : null}{points.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">{points.map((point) => <li key={point} translate="no">{point}</li>)}</ul> : null}{drill.planning_instruction ? <p translate="no" className="mt-2 text-xs font-semibold text-amber-800">{ui("Planning instruction")}: {drill.planning_instruction}</p> : null}</div>
                <SessionDrillPreview visual={visual} title={drill.title} />
              </article>;
            }) : <p className="rounded-md border border-dashed border-board-line p-3 text-sm text-slate-500">{ui("No Drills in this section yet.")}</p>}</div>
          </section>;
        })}
      </div>
    </article>
  </div>;
}

function snapshotVisual(source: Record<string, unknown> | undefined, signedUrls: Map<string, string>): DrillVisual {
  const stored = record(source?.visual); const path = stringValue(stored?.uploadedImagePath) || undefined;
  return { graphic: source?.graphic ? parseEditorState(source.graphic as Json) : defaultEditorState, source: stored?.source === "upload" && path ? "upload" : "editor", uploadedImagePath: path, uploadedImageUrl: path ? signedUrls.get(path) : undefined, uploadedImageMimeType: optionalString(stored?.uploadedImageMimeType), uploadedImageSizeBytes: numberValue(stored?.uploadedImageSizeBytes) };
}
function responsibilityText(mode: string, staffId: string | null, names: Map<string, string>, ui: (key: string) => string) { if (mode === "me") return ui("Me"); if (mode === "staff") return names.get(staffId ?? "") ?? ui("Staff member"); if (mode === "together") return `${ui("Together")}${staffId && names.get(staffId) ? ` · ${names.get(staffId)}` : ""}`; return ui("Unassigned"); }
function coachingPoints(value: unknown) { return typeof value === "string" ? value.split(/\r?\n|;/).map((point) => point.replace(/^[-*•]\s*/, "").trim()).filter(Boolean) : stringArray(value); }
function record(value: unknown): Record<string, unknown> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function stringValue(value: unknown) { return typeof value === "string" ? value : ""; }
function optionalString(value: unknown) { return typeof value === "string" ? value : undefined; }
function numberValue(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function stringArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
