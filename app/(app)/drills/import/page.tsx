import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { DrillImportStudio } from "@/components/drills/drill-import-studio";
import { createClient } from "@/lib/supabase/server";
import { getUserLocale } from "@/lib/i18n/server";
import { listDrillDuplicateCandidates, listDrillImportBatches } from "@/lib/drills/import-queries";

export default async function DrillImportPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [locale, candidates, history] = await Promise.all([
    getUserLocale(supabase, user.id),
    listDrillDuplicateCandidates(supabase, user.id),
    listDrillImportBatches(supabase, user.id)
  ]);
  const copy = locale === "de" ? {
    eyebrow: "Übungsbibliothek",
    title: "Übungsimport",
    description: "Prüfe strukturierte Übungen und Bilder aus einem CoachBoard-Importpaket, bevor sie in deiner privaten Bibliothek gespeichert werden.",
    back: "Zurück zur Übungsbibliothek"
  } : {
    eyebrow: "Drill Library",
    title: "Drill Import",
    description: "Review structured Drills and images from a CoachBoard import package before anything is saved to your private library.",
    back: "Back to Drill Library"
  };
  return <PageContainer width="wide">
    <PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description} breadcrumb={<Link href="/drills" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-board-green"><ArrowLeft className="h-4 w-4" />{copy.back}</Link>} />
    <DrillImportStudio userId={user.id} locale={locale} candidates={candidates} history={history} />
  </PageContainer>;
}
