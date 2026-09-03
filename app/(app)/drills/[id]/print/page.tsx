import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DrillGraphicPreview } from "@/components/drills/drill-graphic-preview";
import { PrintButton } from "@/components/sessions/print-button";
import { ButtonLink } from "@/components/ui/button";
import { formatDrillAgeSuitability } from "@/lib/drills/age-suitability";
import { editorStateToString } from "@/lib/drills/editor";
import { getDrillGraphic } from "@/lib/drills/graphics";
import { materialSummary } from "@/lib/drills/materials";
import { getUserDrill } from "@/lib/drills/queries";
import { formatArea, formatMeters } from "@/lib/drills/setup";
import { getMessages, localeToIntl } from "@/lib/i18n";
import { getUserLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

type DrillPrintPageProps = {
  params: Promise<{ id: string }>;
};

export default async function DrillPrintPage({ params }: DrillPrintPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [drill, graphic, locale] = await Promise.all([
    getUserDrill(supabase, user.id, id),
    getDrillGraphic(supabase, user.id, id),
    getUserLocale(supabase, user.id)
  ]);
  if (!drill) notFound();

  const messages = getMessages(locale);
  const intlLocale = localeToIntl(locale);
  const areaLabel = formatArea(drill.setupArea, intlLocale);
  const detailBlocks = [
    { label: messages.export.document.organization, value: drill.organization || drill.shortDescription },
    { label: messages.export.document.coachingPoints, value: drill.coachingPoints },
    { label: messages.export.document.variations, value: drill.variations },
    { label: messages.export.document.easier, value: drill.easierVersion },
    { label: messages.export.document.harder, value: drill.harderVersion }
  ].filter((item) => item.value);

  return (
    <div className="print-page mx-auto max-w-[960px] bg-white text-slate-950 shadow-soft print:max-w-none print:shadow-none">
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-board-line bg-white p-4">
        <Link href={`/drills/${drill.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-board-navy">
          <ArrowLeft className="h-4 w-4" />
          {messages.export.actions.backToDrill}
        </Link>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <ButtonLink href={`/drills/${drill.id}/edit`} variant="secondary" className="flex-1 justify-center sm:flex-none">{messages.export.actions.editDrill}</ButtonLink>
          <PrintButton className="flex-1 justify-center sm:flex-none" locale={locale} />
        </div>
      </div>

      <article className="space-y-5 rounded-xl border border-board-line bg-white p-4 print:border-0 print:p-0 sm:p-7">
        <header className="print-avoid overflow-hidden rounded-xl border border-board-line">
          <div className="bg-board-navy px-6 py-5 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-200">{messages.export.document.drillSheet}</p>
            <h1 className="mt-2 text-3xl font-bold tracking-normal sm:text-4xl">{drill.title}</h1>
            <p className="mt-2 text-sm text-white/80">{[drill.mainFocus, drill.subFocus, drill.drillType].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="grid gap-px bg-board-line sm:grid-cols-4 print:grid-cols-4">
            <PrintMeta label={messages.export.document.duration} value={`${drill.durationMinutes} min`} />
            <PrintMeta label={messages.export.document.players} value={`${drill.minPlayers}-${drill.maxPlayers}`} />
            <PrintMeta label={messages.export.document.difficulty} value={`${drill.difficultyLevel}/5`} />
            <PrintMeta label={messages.export.document.intensity} value={`${drill.intensityLevel}/5`} />
          </div>
        </header>

        {graphic.objects.length ? (
          <section className="print-avoid overflow-hidden rounded-xl border border-board-line bg-board-grass">
            <DrillGraphicPreview graphicJson={editorStateToString(graphic)} autoFitContent previewMode="print" className="border-0" />
          </section>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[1fr_280px] print:grid-cols-[1fr_240px]">
          <div className="space-y-4">
            {(areaLabel || drill.setupParameters.length || drill.setupNotes) ? (
              <PrintPanel title={messages.export.document.setup}>
                {areaLabel ? <p><span className="font-bold">{messages.export.document.area}:</span> {areaLabel}</p> : null}
                {drill.setupParameters.length ? (
                  <div className="mt-2">
                    <p className="text-xs font-bold uppercase text-slate-500">{messages.export.document.setupParameters}</p>
                    <ul className="mt-1 space-y-1">
                      {drill.setupParameters.map((parameter) => (
                        <li key={parameter.id}><span className="font-semibold">{parameter.label}:</span> {formatMeters(parameter.value, intlLocale)}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {drill.setupNotes ? <p className="mt-2 whitespace-pre-wrap">{drill.setupNotes}</p> : null}
              </PrintPanel>
            ) : null}

            {detailBlocks.map((block) => (
              <PrintPanel key={block.label} title={block.label}>
                <p className="whitespace-pre-wrap">{block.value}</p>
              </PrintPanel>
            ))}
          </div>

          <aside className="space-y-4">
            <PrintPanel title={messages.export.document.materials}>
              <p>{drill.materials.length ? materialSummary(drill.materials) : messages.export.document.noMaterialsListed}</p>
            </PrintPanel>
            <PrintPanel title={messages.export.document.info}>
              <ul className="space-y-2">
                <li><span className="font-bold">{messages.export.document.area}:</span> {areaLabel || messages.export.document.notSet}</li>
                <li><span className="font-bold">{messages.export.document.ageSuitability}:</span> {formatDrillAgeSuitability(drill)}</li>
                <li><span className="font-bold">{messages.export.document.trainingSections}:</span> {drill.trainingBlocks.join(", ") || messages.export.document.notSet}</li>
              </ul>
            </PrintPanel>
          </aside>
        </section>
      </article>
    </div>
  );
}

function PrintMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="font-semibold text-board-navy">{value}</p>
    </div>
  );
}

function PrintPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="print-avoid rounded-xl border border-board-line bg-white p-4 text-sm leading-6 text-slate-700">
      <h2 className="text-base font-bold text-board-navy">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
