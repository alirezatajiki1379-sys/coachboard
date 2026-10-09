"use client";

import { cloneElement, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, Check, CheckCircle2, FileArchive, ImageOff, Loader2, Pencil, RotateCcw, Search, Upload, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { DialogPortal } from "@/components/shared/dialog-portal";
import { createClient } from "@/lib/supabase/client";
import { drillImageBucket, drillImageExtension, validateDrillImageFile } from "@/lib/drills/image-upload";
import { completeDrillImport, finalizeDrillImportImage, startDrillImport, type DrillImportDecision, type DrillImportPayloadItem } from "@/lib/drills/import-actions";
import { findDrillDuplicate, validateNormalizedImportItem, type DrillDuplicateCandidate, type DrillDuplicateMatch, type DrillImportItem, type DrillImportValidationIssue } from "@/lib/drills/import-schema";
import { parseDrillImportPackage, type ParsedDrillImportPackage } from "@/lib/drills/import-package";
import { clearDrillImportDraft, readDrillImportDraft, readDrillImportPackage, storeDrillImportPackage, writeDrillImportDraft } from "@/lib/drills/import-draft";
import type { DrillImportBatchSummary } from "@/lib/drills/import-queries";
import { drillTypes, mainFocuses } from "@/config/options";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type ReviewRow = {
  index: number;
  item: DrillImportItem;
  issues: DrillImportValidationIssue[];
  selected: boolean;
  decision: DrillImportDecision;
  duplicate?: DrillDuplicateMatch;
  imageRemoved: boolean;
};

type ReviewFilter = "all" | "ready" | "duplicates" | "issues" | "selected";
const pageSize = 20;

export function DrillImportStudio({ userId, locale, candidates, history }: {
  userId: string;
  locale: Locale;
  candidates: DrillDuplicateCandidate[];
  history: DrillImportBatchSummary[];
}) {
  const copy = importCopy[locale];
  const router = useRouter();
  const [parsedPackage, setParsedPackage] = useState<ParsedDrillImportPackage | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [replacementImages, setReplacementImages] = useState<Map<number, File>>(new Map());
  const [statusFilter, setStatusFilter] = useState<ReviewFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ batchId: string; imported: number; skipped: number; failed: number } | null>(null);
  const [draftFound, setDraftFound] = useState<ReturnType<typeof readDrillImportDraft>>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const draftReady = useRef(false);

  useEffect(() => {
    setDraftFound(readDrillImportDraft(userId));
    draftReady.current = true;
  }, [userId]);

  useEffect(() => {
    if (!draftReady.current || !parsedPackage || !rows.length || result) return;
    const timer = window.setTimeout(() => {
      try {
        writeDrillImportDraft(userId, {
          version: 1,
          savedAt: new Date().toISOString(),
          sourceFilename: parsedPackage.sourceFilename,
          rows: rows.map(({ index, selected, decision, imageRemoved, item }) => ({ index, selected, decision, imageRemoved, item }))
        });
        setDraftMessage(copy.draftSaved);
      } catch {
        setDraftMessage(copy.draftFailed);
      }
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [copy.draftFailed, copy.draftSaved, parsedPackage, result, rows, userId]);

  const filteredRows = useMemo(() => rows.filter((row) => {
    const queryMatches = !search.trim() || [row.item.title, row.item.mainFocus, row.item.source.title, row.item.source.publisher].filter(Boolean).join(" ").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
    if (!queryMatches) return false;
    if (statusFilter === "ready") return !row.issues.some((issue) => issue.severity === "error") && !row.duplicate;
    if (statusFilter === "duplicates") return Boolean(row.duplicate);
    if (statusFilter === "issues") return row.issues.some((issue) => issue.severity === "error");
    if (statusFilter === "selected") return row.selected;
    return true;
  }), [rows, search, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const visibleRows = filteredRows.slice((Math.min(page, pageCount) - 1) * pageSize, Math.min(page, pageCount) * pageSize);
  const selectedRows = rows.filter((row) => row.selected && row.decision !== "skip");
  const selectedErrors = selectedRows.filter((row) => row.issues.some((issue) => issue.severity === "error"));
  const summary = summarizeRows(rows);

  async function loadPackage(file: File, recoveredRows?: NonNullable<typeof draftFound>["rows"]) {
    setError("");
    setDraftMessage(copy.readingPackage);
    try {
      const nextPackage = await parseDrillImportPackage(file);
      const restored = new Map((recoveredRows ?? []).map((row) => [row.index, row]));
      setParsedPackage(nextPackage);
      setRows(nextPackage.manifest.drills.map((entry) => {
        const saved = restored.get(entry.index);
        const item = saved?.item ?? entry.item;
        const validated = validateNormalizedImportItem(item, entry.index);
        const duplicate = findDrillDuplicate(item, candidates);
        return {
          index: entry.index,
          item,
          issues: mergePackageIssues(validated.issues, entry.issues),
          selected: saved?.selected ?? !validated.issues.some((issue) => issue.severity === "error"),
          decision: saved?.decision ?? (duplicate ? "skip" : "import"),
          duplicate,
          imageRemoved: saved?.imageRemoved ?? false
        };
      }));
      setReplacementImages(new Map());
      setResult(null);
      setPage(1);
      setDraftFound(null);
      setDraftMessage(copy.reviewReady);
      await storeDrillImportPackage(userId, file);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.packageFailed);
      setDraftMessage("");
    }
  }

  function updateRow(index: number, updater: (row: ReviewRow) => ReviewRow) {
    setRows((current) => current.map((row) => row.index === index ? updater(row) : row));
  }

  function saveEditedItem(index: number, item: DrillImportItem) {
    const validated = validateNormalizedImportItem(item, index);
    const duplicate = findDrillDuplicate(item, candidates);
    updateRow(index, (row) => ({ ...row, item, issues: keepPackageImageIssues(row.issues, validated.issues), duplicate, decision: duplicate && row.decision === "import" ? "skip" : row.decision }));
    setEditingIndex(null);
  }

  async function beginImport() {
    if (!parsedPackage || !selectedRows.length || selectedErrors.length) return;
    setError("");
    setProgress(1);
    startTransition(async () => {
      const payloadItems: DrillImportPayloadItem[] = rows.map(({ index, item, selected, decision, duplicate }) => ({
        index,
        item: imageItem(item, replacementImages.get(index), rows.find((row) => row.index === index)?.imageRemoved),
        selected,
        decision,
        matchedDrillId: duplicate?.drillId
      }));
      const started = await startDrillImport({
        name: parsedPackage.manifest.batch.name,
        schemaVersion: parsedPackage.manifest.schemaVersion,
        sourceFilename: parsedPackage.sourceFilename,
        packageSizeBytes: parsedPackage.packageSizeBytes,
        items: payloadItems
      });
      if (!started.ok || !started.batchId) {
        setError(started.error ?? copy.importFailed);
        setProgress(0);
        return;
      }
      const supabase = createClient();
      let completedTasks = 0;
      await runWithConcurrency(started.tasks ?? [], 4, async (task) => {
        const row = rows.find((entry) => entry.index === task.itemIndex);
        const image = row ? replacementImages.get(row.index) ?? (!row.imageRemoved && row.item.image ? parsedPackage.images.get(row.item.image) : undefined) : undefined;
        if (!image) {
          await finalizeDrillImportImage({ batchId: started.batchId!, itemId: task.itemId, error: copy.imageMissingDuringImport });
        } else {
          try {
            const mimeType = await validateDrillImageFile(image);
            const path = `${userId}/${task.drillId}/${crypto.randomUUID()}.${drillImageExtension(mimeType)}`;
            const { error: uploadError } = await supabase.storage.from(drillImageBucket).upload(path, image, { contentType: mimeType, cacheControl: "3600", upsert: false });
            if (uploadError) throw new Error(uploadError.message);
            const finalized = await finalizeDrillImportImage({ batchId: started.batchId!, itemId: task.itemId, path });
            if (!finalized.ok) await supabase.storage.from(drillImageBucket).remove([path]);
          } catch (caught) {
            await finalizeDrillImportImage({ batchId: started.batchId!, itemId: task.itemId, error: caught instanceof Error ? caught.message : copy.imageUploadFailed });
          }
        }
        completedTasks += 1;
        setProgress(Math.max(5, Math.round((completedTasks / Math.max(1, started.tasks?.length ?? 1)) * 95)));
      });
      const completed = await completeDrillImport(started.batchId);
      if (!completed.ok || !completed.summary) {
        setError(completed.error ?? copy.importFailed);
        setProgress(0);
        return;
      }
      setProgress(100);
      setResult({ batchId: started.batchId, ...completed.summary });
      await clearDrillImportDraft(userId);
      setDraftMessage("");
      router.refresh();
    });
  }

  async function recoverDraft() {
    if (!draftFound) return;
    const file = await readDrillImportPackage(userId);
    if (!file) {
      setError(copy.recoveryPackageMissing);
      setDraftFound(null);
      return;
    }
    await loadPackage(file, draftFound.rows);
  }

  async function discardDraft() {
    await clearDrillImportDraft(userId);
    setDraftFound(null);
  }

  async function cancelReview() {
    if (!window.confirm(copy.cancelConfirm)) return;
    await clearDrillImportDraft(userId);
    setParsedPackage(null);
    setRows([]);
    setReplacementImages(new Map());
    setDraftMessage("");
    setError("");
  }

  return (
    <div className="space-y-6">
      {draftFound ? <RecoveryPanel draft={draftFound} locale={locale} onRecover={recoverDraft} onDiscard={discardDraft} /> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {draftMessage ? <p className="text-sm font-semibold text-slate-500" aria-live="polite">{draftMessage}</p> : null}

      {!parsedPackage && !result ? (
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <label className="flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-board-line bg-white p-6 text-center shadow-soft transition hover:border-board-green hover:bg-green-50/30">
            <FileArchive className="h-12 w-12 text-board-green" />
            <span className="mt-4 text-xl font-bold text-board-navy">{copy.selectPackage}</span>
            <span className="mt-2 max-w-lg text-sm leading-6 text-slate-600">{copy.packageHint}</span>
            <span className="mt-4 rounded-md bg-board-navy px-4 py-2 text-sm font-bold text-white">{copy.chooseZip}</span>
            <input type="file" accept=".zip,application/zip" className="sr-only" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void loadPackage(file);
              event.currentTarget.value = "";
            }} />
          </label>
          <ImportHistory history={history} locale={locale} />
        </section>
      ) : null}

      {parsedPackage && !result ? (
        <>
          <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-bold uppercase text-board-green">{copy.importReview}</p>
                <h2 className="mt-1 text-2xl font-bold text-board-navy">{parsedPackage.manifest.batch.name}</h2>
                <p className="mt-1 text-sm text-slate-600">{parsedPackage.sourceFilename} · {rows.length} {copy.drillsDetected}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => setRows((current) => current.map((row) => ({ ...row, selected: !row.issues.some((issue) => issue.severity === "error") })))}>{copy.selectAllReady}</Button>
                <Button type="button" variant="secondary" onClick={() => setRows((current) => current.map((row) => ({ ...row, selected: false })))}>{copy.deselectAll}</Button>
                <Button type="button" variant="ghost" onClick={() => void cancelReview()}>{copy.cancel}</Button>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Metric label={copy.detected} value={rows.length} />
              <Metric label={copy.ready} value={summary.ready} />
              <Metric label={copy.duplicates} value={summary.duplicates} warning={summary.duplicates > 0} />
              <Metric label={copy.issues} value={summary.issues} danger={summary.issues > 0} />
              <Metric label={copy.selected} value={selectedRows.length} />
            </div>
          </section>

          <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex gap-2 overflow-x-auto pb-1" aria-label={copy.reviewFilters}>
                {(["all", "ready", "duplicates", "issues", "selected"] as ReviewFilter[]).map((filter) => (
                  <button key={filter} type="button" onClick={() => { setStatusFilter(filter); setPage(1); }} className={cn("whitespace-nowrap rounded-md px-3 py-2 text-sm font-bold", statusFilter === filter ? "bg-board-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>{copy.filters[filter]}</button>
                ))}
              </div>
              <label className="relative block w-full lg:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <span className="sr-only">{copy.search}</span>
                <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={copy.search} className="h-10 w-full rounded-md border border-board-line bg-white pl-9 pr-3 text-sm text-board-navy" />
              </label>
            </div>
          </section>

          <div className="space-y-3">
            {visibleRows.length ? visibleRows.map((row) => (
              <ReviewCard
                key={row.index}
                row={row}
                image={row.imageRemoved ? undefined : replacementImages.get(row.index) ?? (row.item.image ? parsedPackage.images.get(row.item.image) : undefined)}
                locale={locale}
                onEdit={() => setEditingIndex(row.index)}
                onChange={(next) => updateRow(row.index, () => next)}
                onReplaceImage={(file) => {
                  void validateDrillImageFile(file).then(() => {
                    setReplacementImages((current) => new Map(current).set(row.index, file));
                    updateRow(row.index, (current) => ({ ...current, imageRemoved: false, issues: current.issues.filter((issue) => issue.field !== "image") }));
                  }).catch(() => updateRow(row.index, (current) => ({ ...current, issues: [...current.issues.filter((issue) => issue.field !== "image"), { field: "image", code: "invalid_file", severity: "error" }] })));
                }}
              />
            )) : <Notice>{copy.noReviewItems}</Notice>}
          </div>

          {pageCount > 1 ? <div className="flex items-center justify-between gap-3 rounded-lg border border-board-line bg-white p-3">
            <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{copy.previous}</Button>
            <span className="text-sm font-bold text-slate-600">{copy.page} {Math.min(page, pageCount)} / {pageCount}</span>
            <Button type="button" variant="secondary" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>{copy.next}</Button>
          </div> : null}

          <section className="sticky bottom-3 z-20 rounded-lg border border-board-line bg-white/95 p-4 shadow-xl backdrop-blur">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold text-board-navy">{selectedRows.length} {copy.selectedForImport}</p>
                <p className="text-sm text-slate-600">{selectedErrors.length ? copy.fixSelectedIssues : copy.privateNotice}</p>
                {isPending ? <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 sm:w-72"><div className="h-full bg-board-green transition-all" style={{ width: `${progress}%` }} /></div> : null}
              </div>
              <Button type="button" disabled={isPending || !selectedRows.length || Boolean(selectedErrors.length)} onClick={() => void beginImport()}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {copy.importSelected.replace("{count}", String(selectedRows.length))}
              </Button>
            </div>
          </section>
        </>
      ) : null}

      {result ? (
        <section className="rounded-lg border border-board-line bg-white p-6 shadow-soft">
          <CheckCircle2 className="h-10 w-10 text-board-green" />
          <h2 className="mt-3 text-2xl font-bold text-board-navy">{copy.importComplete}</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Metric label={copy.imported} value={result.imported} />
            <Metric label={copy.skipped} value={result.skipped} />
            <Metric label={copy.failed} value={result.failed} danger={result.failed > 0} />
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <ButtonLink href={`/drills?importBatch=${result.batchId}`}>{copy.viewImported}</ButtonLink>
            <ButtonLink href={`/drills/import/${result.batchId}`} variant="secondary">{copy.viewBatch}</ButtonLink>
          </div>
        </section>
      ) : null}

      {editingIndex != null ? <EditDialog row={rows.find((row) => row.index === editingIndex)!} locale={locale} onClose={() => setEditingIndex(null)} onSave={(item) => saveEditedItem(editingIndex, item)} /> : null}
    </div>
  );
}

function ReviewCard({ row, image, locale, onEdit, onChange, onReplaceImage }: {
  row: ReviewRow;
  image?: File;
  locale: Locale;
  onEdit: () => void;
  onChange: (row: ReviewRow) => void;
  onReplaceImage: (file: File) => void;
}) {
  const copy = importCopy[locale];
  const [imageUrl, setImageUrl] = useState("");
  useEffect(() => {
    if (!image) { setImageUrl(""); return; }
    const url = URL.createObjectURL(image);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);
  const errors = row.issues.filter((issue) => issue.severity === "error");
  const warnings = row.issues.filter((issue) => issue.severity === "warning");
  const decisionOptions: Array<{ value: DrillImportDecision; label: string; disabled?: boolean }> = row.duplicate ? [
    { value: "skip", label: copy.skip },
    { value: "import_anyway", label: copy.importAnyway },
    { value: "update", label: copy.updateExisting, disabled: !row.duplicate.safeToUpdate }
  ] : [{ value: "import", label: copy.import }];

  return (
    <article className={cn("rounded-lg border bg-white p-4 shadow-soft", errors.length ? "border-red-200" : row.duplicate ? "border-amber-200" : "border-board-line")}>
      <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_220px]">
        <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-board-line bg-slate-100">
          {imageUrl ? <Image src={imageUrl} alt="" fill sizes="(max-width: 768px) 100vw, 220px" unoptimized className="object-contain" /> : <div className="flex h-full flex-col items-center justify-center text-slate-400"><ImageOff className="h-7 w-7" /><span className="mt-2 text-xs font-bold">{copy.noImage}</span></div>}
        </div>
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <input type="checkbox" checked={row.selected} aria-label={copy.selectDrill.replace("{title}", row.item.title)} onChange={(event) => onChange({ ...row, selected: event.target.checked })} className="mt-1 h-5 w-5 accent-board-green" />
            <div className="min-w-0">
              <div className="flex flex-wrap gap-2">
                {errors.length ? <Badge tone="red">{copy.issue}</Badge> : row.duplicate ? <Badge tone="amber">{copy.possibleDuplicate}</Badge> : <Badge tone="green">{copy.newDrill}</Badge>}
                {warnings.length ? <Badge tone="slate">{warnings.length} {copy.warnings}</Badge> : null}
              </div>
              <h3 translate="no" className="mt-2 break-words text-lg font-bold text-board-navy">{row.item.title || copy.untitled}</h3>
              <p className="mt-1 line-clamp-2 text-sm text-slate-600">{row.item.shortDescription || copy.noDescription}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                <span className="rounded-md bg-slate-100 px-2 py-1">{row.item.mainFocus || copy.missingFocus}</span>
                <span className="rounded-md bg-slate-100 px-2 py-1">{row.item.minPlayers}-{row.item.maxPlayers} {copy.players}</span>
                <span className="rounded-md bg-slate-100 px-2 py-1">{row.item.durationMinutes} min</span>
              </div>
              {row.item.source.title || row.item.source.publisher ? <p className="mt-3 text-xs font-semibold text-slate-500">{copy.source}: {[row.item.source.publisher, row.item.source.title, row.item.source.page ? `${copy.pageShort} ${row.item.source.page}` : ""].filter(Boolean).join(" · ")}</p> : null}
              {row.duplicate ? <p className="mt-2 text-sm font-semibold text-amber-800">{copy.matches}: {row.duplicate.title} · {duplicateLabel(row.duplicate.kind, locale)}</p> : null}
              {row.issues.length ? <ul className="mt-3 space-y-1 text-xs font-semibold text-slate-600">{row.issues.map((issue, index) => <li key={`${issue.field}-${issue.code}-${index}`}>• {issueText(issue, locale)}</li>)}</ul> : null}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-board-line pt-3 md:col-span-2 xl:col-span-1 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
          <Button type="button" variant="secondary" onClick={onEdit}><Pencil className="h-4 w-4" />{copy.edit}</Button>
          <label className="app-button inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md bg-white px-4 text-sm font-semibold ring-1 ring-board-line hover:bg-slate-50">
            <Upload className="h-4 w-4" />{copy.replaceImage}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onReplaceImage(file);
              event.currentTarget.value = "";
            }} />
          </label>
          {image ? <Button type="button" variant="ghost" onClick={() => onChange({ ...row, imageRemoved: true, item: { ...row.item, image: undefined }, issues: row.issues.filter((issue) => issue.field !== "image") })}><ImageOff className="h-4 w-4" />{copy.removeImage}</Button> : null}
          {row.duplicate ? <label className="mt-1 block"><span className="text-xs font-bold uppercase text-slate-500">{copy.action}</span><select value={row.decision} onChange={(event) => onChange({ ...row, decision: event.target.value as DrillImportDecision })} className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-2 text-sm">{decisionOptions.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select></label> : null}
        </div>
      </div>
    </article>
  );
}

function EditDialog({ row, locale, onClose, onSave }: { row: ReviewRow; locale: Locale; onClose: () => void; onSave: (item: DrillImportItem) => void }) {
  const copy = importCopy[locale];
  const [item, setItem] = useState(row.item);
  return <DialogPortal><div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="drill-import-edit-title" className="max-h-[min(92dvh,860px)] w-full overflow-y-auto rounded-t-lg bg-white p-5 shadow-xl sm:max-w-3xl sm:rounded-lg">
      <div className="flex items-center justify-between gap-3"><h2 id="drill-import-edit-title" className="text-xl font-bold text-board-navy">{copy.editDrill}</h2><button type="button" onClick={onClose} aria-label={copy.close} className="rounded-md p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label={copy.title} className="sm:col-span-2"><input value={item.title} onChange={(event) => setItem({ ...item, title: event.target.value })} /></Field>
        <Field label={copy.shortDescription} className="sm:col-span-2"><textarea rows={3} value={item.shortDescription ?? ""} onChange={(event) => setItem({ ...item, shortDescription: event.target.value })} /></Field>
        <Field label={copy.organization} className="sm:col-span-2"><textarea rows={4} value={item.organization ?? ""} onChange={(event) => setItem({ ...item, organization: event.target.value })} /></Field>
        <Field label={copy.coachingPoints} className="sm:col-span-2"><textarea rows={4} value={item.coachingPoints ?? ""} onChange={(event) => setItem({ ...item, coachingPoints: event.target.value })} /></Field>
        <Field label={copy.duration}><input type="number" min={1} max={300} value={item.durationMinutes} onChange={(event) => setItem({ ...item, durationMinutes: Number(event.target.value) })} /></Field>
        <Field label={copy.playerRange}><div className="grid grid-cols-2 gap-2"><input aria-label={copy.minimumPlayers} type="number" min={1} max={100} value={item.minPlayers} onChange={(event) => setItem({ ...item, minPlayers: Number(event.target.value) })} /><input aria-label={copy.maximumPlayers} type="number" min={1} max={100} value={item.maxPlayers} onChange={(event) => setItem({ ...item, maxPlayers: Number(event.target.value) })} /></div></Field>
        <Field label={copy.focus}><select value={item.mainFocus} onChange={(event) => setItem({ ...item, mainFocus: event.target.value as DrillImportItem["mainFocus"] })}><option value="">{copy.select}</option>{mainFocuses.map((value) => <option key={value}>{value}</option>)}</select></Field>
        <Field label={copy.drillType}><select value={item.drillType} onChange={(event) => setItem({ ...item, drillType: event.target.value as DrillImportItem["drillType"] })}><option value="">{copy.select}</option>{drillTypes.map((value) => <option key={value}>{value}</option>)}</select></Field>
        <Field label={copy.tags} className="sm:col-span-2"><input value={item.tags.join(", ")} onChange={(event) => setItem({ ...item, tags: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} /></Field>
        <Field label={copy.sourceTitle}><input value={item.source.title ?? ""} onChange={(event) => setItem({ ...item, source: { ...item.source, title: event.target.value } })} /></Field>
        <Field label={copy.publisher}><input value={item.source.publisher ?? ""} onChange={(event) => setItem({ ...item, source: { ...item.source, publisher: event.target.value } })} /></Field>
        <Field label={copy.sourcePage}><input value={item.source.page ?? ""} onChange={(event) => setItem({ ...item, source: { ...item.source, page: event.target.value } })} /></Field>
        <Field label={copy.reference}><input value={item.source.reference ?? ""} onChange={(event) => setItem({ ...item, source: { ...item.source, reference: event.target.value } })} /></Field>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="secondary" onClick={onClose}>{copy.cancel}</Button><Button type="button" onClick={() => onSave(item)}><Check className="h-4 w-4" />{copy.applyChanges}</Button></div>
    </div>
  </div></DialogPortal>;
}

function RecoveryPanel({ draft, locale, onRecover, onDiscard }: { draft: NonNullable<ReturnType<typeof readDrillImportDraft>>; locale: Locale; onRecover: () => void; onDiscard: () => void }) {
  const copy = importCopy[locale];
  return <section className="rounded-lg border border-blue-200 bg-blue-50 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-board-navy">{copy.recoverTitle}</h2><p className="mt-1 text-sm text-slate-600">{copy.recoverText.replace("{time}", new Date(draft.savedAt).toLocaleString(locale === "de" ? "de-DE" : "en-GB"))}</p></div><div className="flex flex-wrap gap-2"><Button type="button" onClick={onRecover}><RotateCcw className="h-4 w-4" />{copy.recover}</Button><Button type="button" variant="secondary" onClick={onDiscard}>{copy.discard}</Button></div></div></section>;
}

function ImportHistory({ history, locale }: { history: DrillImportBatchSummary[]; locale: Locale }) {
  const copy = importCopy[locale];
  return <aside className="rounded-lg border border-board-line bg-white p-5 shadow-soft"><h2 className="text-lg font-bold text-board-navy">{copy.importHistory}</h2><div className="mt-4 max-h-[32rem] space-y-3 overflow-y-auto pr-1">{history.length ? history.map((batch) => <article key={batch.id} className="rounded-md border border-board-line p-3"><p className="font-bold text-board-navy">{batch.name}</p><p className="mt-1 text-xs text-slate-500">{new Date(batch.createdAt).toLocaleString(locale === "de" ? "de-DE" : "en-GB")}</p><p className="mt-2 text-sm font-semibold text-slate-600">{batch.importedCount} {copy.imported.toLocaleLowerCase()} · {batch.skippedCount} {copy.skipped.toLocaleLowerCase()} · {batch.failedCount} {copy.failed.toLocaleLowerCase()}</p><ButtonLink href={`/drills/import/${batch.id}`} variant="secondary" className="mt-3 h-9 px-3">{copy.viewBatch}</ButtonLink></article>) : <p className="rounded-md border border-dashed border-board-line p-4 text-sm text-slate-600">{copy.noImports}</p>}</div></aside>;
}

function Field({ label, children, className }: { label: string; children: React.ReactElement<{ className?: string }>; className?: string }) {
  return <label className={className}><span className="text-sm font-bold text-slate-700">{label}</span>{cloneElement(children, { className: cn("mt-1 min-h-10 w-full rounded-md border border-board-line bg-white px-3 py-2 text-sm text-board-navy", children.props.className) })}</label>;
}

function Metric({ label, value, warning = false, danger = false }: { label: string; value: number; warning?: boolean; danger?: boolean }) { return <div className={cn("rounded-md border px-3 py-3", danger ? "border-red-200 bg-red-50" : warning ? "border-amber-200 bg-amber-50" : "border-board-line bg-board-paper")}><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-board-navy">{value}</p></div>; }
function Badge({ children, tone }: { children: React.ReactNode; tone: "green" | "amber" | "red" | "slate" }) { const classes = { green: "bg-green-50 text-green-800", amber: "bg-amber-50 text-amber-800", red: "bg-red-50 text-red-700", slate: "bg-slate-100 text-slate-600" }; return <span className={cn("rounded-full px-2 py-1 text-[11px] font-bold uppercase", classes[tone])}>{children}</span>; }
function Notice({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "error" }) { return <div className={cn("rounded-lg border p-4 text-sm font-semibold", tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-board-line bg-white text-slate-600")}>{tone === "error" ? <AlertTriangle className="mr-2 inline h-4 w-4" /> : null}{children}</div>; }

function summarizeRows(rows: ReviewRow[]) { return { ready: rows.filter((row) => !row.duplicate && !row.issues.some((issue) => issue.severity === "error")).length, duplicates: rows.filter((row) => row.duplicate).length, issues: rows.filter((row) => row.issues.some((issue) => issue.severity === "error")).length }; }
function mergePackageIssues(validated: DrillImportValidationIssue[], packageIssues: DrillImportValidationIssue[]) { return [...validated, ...packageIssues.filter((issue) => issue.field === "image" && !validated.some((current) => current.field === issue.field && current.code === issue.code))]; }
function keepPackageImageIssues(current: DrillImportValidationIssue[], validated: DrillImportValidationIssue[]) { return [...validated, ...current.filter((issue) => issue.field === "image" && !validated.some((entry) => entry.field === issue.field && entry.code === issue.code))]; }
function imageItem(item: DrillImportItem, replacement?: File, removed?: boolean): DrillImportItem { return { ...item, image: removed ? undefined : replacement ? `images/${replacement.name}` : item.image }; }
async function runWithConcurrency<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>) { let cursor = 0; await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => { while (cursor < items.length) { const index = cursor++; await task(items[index]); } })); }

function issueText(issue: DrillImportValidationIssue, locale: Locale) { const labels: Record<string, [string, string]> = { "title:required": ["Title is required.", "Titel ist erforderlich."], "mainFocus:required": ["Focus is required.", "Schwerpunkt ist erforderlich."], "mainFocus:unsupported": ["Focus is not supported.", "Schwerpunkt wird nicht unterstützt."], "drillType:required": ["Drill type is required.", "Übungstyp ist erforderlich."], "drillType:unsupported": ["Drill type is not supported.", "Übungstyp wird nicht unterstützt."], "maxPlayers:below_minimum": ["Maximum players must be at least the minimum.", "Maximale Spielerzahl muss mindestens der Mindestzahl entsprechen."], "image:missing_file": ["Referenced image is missing.", "Referenziertes Bild fehlt."], "image:invalid_file": ["Referenced image is invalid.", "Referenziertes Bild ist ungültig."], "image:unsafe_path": ["Image path is unsafe.", "Bildpfad ist unsicher."], "durationMinutes:defaulted": ["Duration defaulted to 10 minutes.", "Dauer wurde auf 10 Minuten gesetzt."], "minPlayers:defaulted": ["Minimum players defaulted to 1.", "Mindestspielerzahl wurde auf 1 gesetzt."], "maxPlayers:defaulted": ["Maximum players defaulted.", "Maximalspielerzahl wurde vorbelegt."] }; return labels[`${issue.field}:${issue.code}`]?.[locale === "de" ? 1 : 0] ?? `${issue.field}: ${issue.code.replaceAll("_", " ")}`; }
function duplicateLabel(kind: DrillDuplicateMatch["kind"], locale: Locale) { const labels = { external_id: ["same external ID", "gleiche externe ID"], source_page: ["same source and page", "gleiche Quelle und Seite"], exact_title: ["same title", "gleicher Titel"], similar_title: ["similar title", "ähnlicher Titel"] } as const; return labels[kind][locale === "de" ? 1 : 0]; }

const importCopy = {
  en: { selectPackage: "Select import package", packageHint: "Upload a reviewed CoachBoard ZIP containing drills.json and optional JPG, PNG or WebP images. Nothing is imported before review.", chooseZip: "Choose ZIP", readingPackage: "Reading and validating package…", packageFailed: "The package could not be read.", reviewReady: "Package validated. Review every selected Drill before importing.", draftSaved: "Review draft saved locally", draftFailed: "The review draft could not be saved locally", importReview: "Import Review", drillsDetected: "Drills detected", selectAllReady: "Select all ready", deselectAll: "Deselect all", cancel: "Cancel", detected: "Detected", ready: "Ready", duplicates: "Duplicates", issues: "Issues", selected: "Selected", reviewFilters: "Review filters", filters: { all: "All", ready: "Ready", duplicates: "Duplicates", issues: "Issues", selected: "Selected" }, search: "Search review", noReviewItems: "No Drills match this review filter.", previous: "Previous", next: "Next", page: "Page", selectedForImport: "Drills selected", fixSelectedIssues: "Fix or deselect every Drill with a blocking issue.", privateNotice: "Imported Drills remain private to your account.", importSelected: "Import {count} Drills", importFailed: "The import could not be completed.", imageMissingDuringImport: "The reviewed image is no longer available.", imageUploadFailed: "The image upload failed.", importComplete: "Import complete", imported: "Imported", skipped: "Skipped", failed: "Failed", viewImported: "View imported Drills", viewBatch: "View batch", importHistory: "Import history", noImports: "No imports yet.", noImage: "No image", selectDrill: "Select {title}", issue: "Issue", possibleDuplicate: "Possible duplicate", newDrill: "New", warnings: "warnings", untitled: "Untitled Drill", noDescription: "No short description", missingFocus: "Missing focus", players: "players", source: "Source", pageShort: "p.", matches: "Matches", edit: "Edit", replaceImage: "Replace image", removeImage: "Remove image", action: "Action", skip: "Skip", importAnyway: "Import anyway", updateExisting: "Update existing", import: "Import", editDrill: "Edit imported Drill", close: "Close", title: "Title", shortDescription: "Short description", organization: "Organization", coachingPoints: "Coaching Points", duration: "Duration (minutes)", playerRange: "Player range", minimumPlayers: "Minimum players", maximumPlayers: "Maximum players", focus: "Focus", drillType: "Drill type", tags: "Tags (comma-separated)", sourceTitle: "Source title", publisher: "Publisher", sourcePage: "Source page", reference: "Reference", select: "Select", applyChanges: "Apply changes", recoverTitle: "Continue import review?", recoverText: "Unsaved review work from {time} was found.", recover: "Recover review", discard: "Discard", recoveryPackageMissing: "The review settings were found, but the original ZIP is no longer available. Select the package again.", cancelConfirm: "Cancel this import review and remove its local draft?" },
  de: { selectPackage: "Importpaket auswählen", packageHint: "Lade ein geprüftes CoachBoard-ZIP mit drills.json und optionalen JPG-, PNG- oder WebP-Bildern hoch. Vor der Prüfung wird nichts importiert.", chooseZip: "ZIP auswählen", readingPackage: "Paket wird gelesen und geprüft…", packageFailed: "Das Paket konnte nicht gelesen werden.", reviewReady: "Paket geprüft. Prüfe jede ausgewählte Übung vor dem Import.", draftSaved: "Prüfentwurf lokal gespeichert", draftFailed: "Der Prüfentwurf konnte lokal nicht gespeichert werden", importReview: "Import prüfen", drillsDetected: "Übungen erkannt", selectAllReady: "Alle bereiten auswählen", deselectAll: "Auswahl aufheben", cancel: "Abbrechen", detected: "Erkannt", ready: "Bereit", duplicates: "Duplikate", issues: "Probleme", selected: "Ausgewählt", reviewFilters: "Prüffilter", filters: { all: "Alle", ready: "Bereit", duplicates: "Duplikate", issues: "Probleme", selected: "Ausgewählt" }, search: "Import durchsuchen", noReviewItems: "Keine Übungen entsprechen diesem Prüffilter.", previous: "Zurück", next: "Weiter", page: "Seite", selectedForImport: "Übungen ausgewählt", fixSelectedIssues: "Behebe Probleme oder entferne betroffene Übungen aus der Auswahl.", privateNotice: "Importierte Übungen bleiben privat in deinem Konto.", importSelected: "{count} Übungen importieren", importFailed: "Der Import konnte nicht abgeschlossen werden.", imageMissingDuringImport: "Das geprüfte Bild ist nicht mehr verfügbar.", imageUploadFailed: "Der Bild-Upload ist fehlgeschlagen.", importComplete: "Import abgeschlossen", imported: "Importiert", skipped: "Übersprungen", failed: "Fehlgeschlagen", viewImported: "Importierte Übungen öffnen", viewBatch: "Import öffnen", importHistory: "Importverlauf", noImports: "Noch keine Importe.", noImage: "Kein Bild", selectDrill: "{title} auswählen", issue: "Problem", possibleDuplicate: "Mögliches Duplikat", newDrill: "Neu", warnings: "Hinweise", untitled: "Übung ohne Titel", noDescription: "Keine Kurzbeschreibung", missingFocus: "Schwerpunkt fehlt", players: "Spieler", source: "Quelle", pageShort: "S.", matches: "Treffer", edit: "Bearbeiten", replaceImage: "Bild ersetzen", removeImage: "Bild entfernen", action: "Aktion", skip: "Überspringen", importAnyway: "Trotzdem importieren", updateExisting: "Bestehende aktualisieren", import: "Importieren", editDrill: "Importierte Übung bearbeiten", close: "Schließen", title: "Titel", shortDescription: "Kurzbeschreibung", organization: "Organisation", coachingPoints: "Coaching-Punkte", duration: "Dauer (Minuten)", playerRange: "Spielerzahl", minimumPlayers: "Mindestspieler", maximumPlayers: "Maximalspieler", focus: "Schwerpunkt", drillType: "Übungstyp", tags: "Tags (kommagetrennt)", sourceTitle: "Quellentitel", publisher: "Herausgeber", sourcePage: "Quellseite", reference: "Referenz", select: "Auswählen", applyChanges: "Änderungen übernehmen", recoverTitle: "Importprüfung fortsetzen?", recoverText: "Es wurde ungespeicherte Prüfarbeit vom {time} gefunden.", recover: "Prüfung wiederherstellen", discard: "Verwerfen", recoveryPackageMissing: "Die Prüfeinstellungen wurden gefunden, aber das ursprüngliche ZIP ist nicht mehr verfügbar. Wähle das Paket erneut aus.", cancelConfirm: "Importprüfung abbrechen und lokalen Entwurf entfernen?" }
} as const;
