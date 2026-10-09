import Link from "next/link";
import { ArrowLeft, CheckCircle2, CircleAlert, CircleMinus, ExternalLink } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { ButtonLink } from "@/components/ui/button";
import { ArchiveImportBatchButton } from "@/components/drills/archive-import-batch-button";
import { getDrillImportBatch } from "@/lib/drills/import-queries";
import { getUserLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

type PageProps = { params: Promise<{ id: string }> };

export default async function DrillImportBatchPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [detail, locale] = await Promise.all([getDrillImportBatch(supabase, user.id, id), getUserLocale(supabase, user.id)]);
  if (!detail) notFound();
  const copy = locale === "de" ? {
    back: "Zurück zum Übungsimport", eyebrow: "Importverlauf", description: "Ergebnis dieses privaten Übungsimports.", imported: "Importiert", skipped: "Übersprungen", failed: "Fehlgeschlagen", total: "Gesamt", open: "Übung öffnen", noDrill: "Keine Übung erstellt", archive: "Alle importierten Übungen archivieren", confirm: "Alle noch vorhandenen Übungen aus diesem Import archivieren? Sie können später wiederhergestellt werden.", source: "Quelldatei", status: "Status"
  } : {
    back: "Back to Drill Import", eyebrow: "Import history", description: "Outcome of this private Drill import.", imported: "Imported", skipped: "Skipped", failed: "Failed", total: "Total", open: "Open Drill", noDrill: "No Drill created", archive: "Archive all imported Drills", confirm: "Archive every remaining Drill from this import? They can be restored later.", source: "Source file", status: "Status"
  };
  const { batch, items } = detail;
  return <PageContainer width="wide">
    <PageHeader eyebrow={copy.eyebrow} title={batch.name} description={copy.description} breadcrumb={<Link href="/drills/import" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-board-green"><ArrowLeft className="h-4 w-4" />{copy.back}</Link>} actions={<ArchiveImportBatchButton batchId={batch.id} label={copy.archive} confirmation={copy.confirm} />} />
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label={copy.total} value={batch.totalItems} />
      <Metric label={copy.imported} value={batch.importedCount} />
      <Metric label={copy.skipped} value={batch.skippedCount} />
      <Metric label={copy.failed} value={batch.failedCount} danger={batch.failedCount > 0} />
    </section>
    <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600"><span><strong className="text-board-navy">{copy.status}:</strong> {batch.status}</span>{batch.sourceFilename ? <span><strong className="text-board-navy">{copy.source}:</strong> {batch.sourceFilename}</span> : null}<span>{new Date(batch.createdAt).toLocaleString(locale === "de" ? "de-DE" : "en-GB")}</span></div>
      <div className="mt-5 divide-y divide-board-line rounded-md border border-board-line">
        {items.map((item) => <article key={item.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-start gap-3">{item.status === "imported" ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-board-green" /> : item.status === "failed" ? <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" /> : <CircleMinus className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />}<div className="min-w-0"><p translate="no" className="break-words font-bold text-board-navy">{item.title}</p><p className="mt-1 text-xs font-semibold uppercase text-slate-500">{item.status} · {item.action}</p>{item.error ? <p className="mt-1 text-sm text-red-700">{item.error}</p> : null}</div></div>{item.drillId ? <ButtonLink href={`/drills/${item.drillId}`} variant="secondary" className="h-9 px-3"><ExternalLink className="h-4 w-4" />{copy.open}</ButtonLink> : <span className="text-xs font-semibold text-slate-400">{copy.noDrill}</span>}</article>)}
      </div>
    </section>
  </PageContainer>;
}

function Metric({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) { return <div className={danger ? "rounded-lg border border-red-200 bg-red-50 p-4" : "rounded-lg border border-board-line bg-white p-4 shadow-soft"}><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-board-navy">{value}</p></div>; }
