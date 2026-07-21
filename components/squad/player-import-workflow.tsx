"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Download, FileSpreadsheet, Loader2, RotateCcw, Upload } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { confirmPlayerImport, undoPlayerImport, type PlayerImportActionState, type PlayerImportBatchSummary } from "@/lib/squad/import-actions";
import {
  buildReviewedRows,
  importFieldLabel,
  importFields,
  suggestColumnMapping,
  templateCsv,
  type ColumnMapping,
  type ImportMode,
  type ImportOperation,
  type ImportSourceType,
  type ParsedSheet,
  type PlayerImportPayload,
  type ReviewedImportRow
} from "@/lib/squad/importer";
import type { SquadPlayer } from "@/types/domain";
import { cn } from "@/lib/utils";

type PlayerImportWorkflowProps = {
  existingPlayers: SquadPlayer[];
  history: PlayerImportBatchSummary[];
};

const maxFileSize = 10 * 1024 * 1024;
const maxRows = 2000;
const maxColumns = 100;

export function PlayerImportWorkflow({ existingPlayers, history }: PlayerImportWorkflowProps) {
  const [step, setStep] = useState(1);
  const [sourceType, setSourceType] = useState<ImportSourceType>("paste");
  const [sourceName, setSourceName] = useState("");
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [pasteValue, setPasteValue] = useState("");
  const [error, setError] = useState("");
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [rows, setRows] = useState<ReviewedImportRow[]>([]);
  const [importMode, setImportMode] = useState<ImportMode>("add_new");
  const [result, setResult] = useState<PlayerImportActionState | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeSheet = sheets[sheetIndex];
  const detected = useMemo(() => activeSheet ? detectTable(activeSheet.rows) : null, [activeSheet]);
  const readyCount = rows.filter((row) => !row.excluded && !row.errors.length && row.operation !== "skip").length;
  const warningCount = rows.reduce((sum, row) => sum + row.warnings.length, 0);
  const errorCount = rows.filter((row) => row.errors.length && !row.excluded).length;
  const duplicateCount = rows.filter((row) => row.duplicateSignals.length && !row.excluded).length;
  const positionSummary = summarizePositions(rows);

  function loadSheet(nextSheets: ParsedSheet[], nextSourceType: ImportSourceType, nextName: string) {
    setSheets(nextSheets);
    setSheetIndex(0);
    setSourceType(nextSourceType);
    setSourceName(nextName);
    setError("");
    setResult(null);
    setStep(nextSheets.length > 1 ? 2 : 3);
    const table = detectTable(nextSheets[0].rows);
    setMappings(table.headers.map(suggestColumnMapping));
  }

  function prepareMapping() {
    if (!detected) return;
    setMappings(detected.headers.map((header, index) => mappings[index] ?? suggestColumnMapping(header)));
    setStep(3);
  }

  function prepareReview() {
    if (!detected) return;
    const reviewed = buildReviewedRows(detected.headers, detected.rows, mappings, existingPlayers);
    setRows(reviewed);
    setStep(4);
  }

  function confirmImport() {
    const payload: PlayerImportPayload = {
      sourceType,
      sourceName,
      sourceSheet: activeSheet?.name,
      importMode,
      rows
    };
    startTransition(async () => {
      const response = await confirmPlayerImport(payload);
      setResult(response);
      if (response.ok) setStep(7);
      else setError(response.error ?? "Import failed.");
    });
  }

  return (
    <div className="space-y-6">
      <WorkflowSteps current={step} />
      {error ? <Alert message={error} /> : null}

      {step === 1 ? (
        <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
            <h2 className="text-lg font-bold text-board-navy">Select source</h2>
            <p className="mt-1 text-sm text-slate-600">Review mappings, correct errors and resolve possible duplicates before any player is created.</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <UploadBox onError={setError} onLoaded={loadSheet} />
              <PasteBox value={pasteValue} onChange={setPasteValue} onLoad={() => {
                try {
                  loadSheet([{ name: "Pasted table", rows: parseDelimited(pasteValue, "\t") }], "paste", "Pasted table");
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : "Could not read pasted table.");
                }
              }} />
            </div>
            <button type="button" onClick={downloadTemplate} className="mt-5 inline-flex items-center gap-2 rounded-md border border-board-line px-4 py-2 text-sm font-bold text-board-navy hover:bg-slate-50">
              <Download className="h-4 w-4" />
              Download CoachBoard template
            </button>
          </div>
          <ImportHistory history={history} />
        </section>
      ) : null}

      {step === 2 && activeSheet ? (
        <Panel title="Select sheet" action={<Button onClick={prepareMapping}>Use this sheet</Button>}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sheets.map((sheet, index) => (
              <button
                type="button"
                key={sheet.name}
                onClick={() => {
                  setSheetIndex(index);
                  const table = detectTable(sheet.rows);
                  setMappings(table.headers.map(suggestColumnMapping));
                }}
                className={cn("rounded-lg border p-4 text-left", index === sheetIndex ? "border-board-green bg-green-50" : "border-board-line bg-white")}
              >
                <p className="font-bold text-board-navy">{sheet.name}</p>
                <p className="mt-1 text-sm text-slate-600">{sheet.rows.length} rows</p>
              </button>
            ))}
          </div>
          <SheetPreview sheet={activeSheet} />
        </Panel>
      ) : null}

      {step === 3 && detected ? (
        <Panel title="Map columns" action={<Button onClick={prepareReview}>Review data</Button>}>
          <div className="mb-4 rounded-md bg-amber-50 p-3 text-sm font-semibold text-amber-800">
            Generic columns such as Spalte7 and Spalte8 are suggested but require confirmation.
          </div>
          <div className="overflow-x-auto rounded-lg border border-board-line">
            <table className="min-w-full divide-y divide-board-line text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Source column</th>
                  <th className="px-3 py-2">Sample values</th>
                  <th className="px-3 py-2">CoachBoard field</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-board-line bg-white">
                {detected.headers.map((header, index) => (
                  <tr key={`${header}-${index}`}>
                    <td className="px-3 py-3 font-bold text-board-navy">{header || `Column ${index + 1}`}</td>
                    <td className="max-w-xs px-3 py-3 text-slate-600">{sampleValues(detected.rows, index).join(" · ") || "Empty"}</td>
                    <td className="px-3 py-3">
                      <select
                        value={mappings[index]?.field ?? "ignore"}
                        onChange={(event) => setMappings((current) => current.map((mapping, mappingIndex) => mappingIndex === index ? { ...mapping, field: event.target.value as ColumnMapping["field"], requiresConfirmation: false } : mapping))}
                        className="h-10 w-full min-w-56 rounded-md border border-board-line bg-white px-2 text-board-navy"
                      >
                        {groupedFields().map(([group, fields]) => (
                          <optgroup key={group} label={group}>
                            {fields.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge value={mappings[index]?.requiresConfirmation ? "Confirmation required" : confidenceLabel(mappings[index]?.confidence)} tone={mappings[index]?.requiresConfirmation ? "amber" : mappings[index]?.confidence === "high" ? "green" : "slate"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      {step === 4 ? (
        <Panel title="Review data" action={<Button onClick={() => setStep(5)}>Resolve duplicates</Button>}>
          <Summary created={readyCount} warnings={warningCount} errors={errorCount} duplicates={duplicateCount} />
          <PositionSummary summary={positionSummary} />
          <ReviewRows rows={rows} onRowsChange={setRows} />
        </Panel>
      ) : null}

      {step === 5 ? (
        <Panel title="Resolve duplicates" action={<Button onClick={() => setStep(6)}>Confirm import</Button>}>
          <p className="text-sm text-slate-600">Possible duplicates are never merged silently. Choose what should happen for each row.</p>
          <ReviewRows rows={rows} onRowsChange={setRows} duplicatesOnly />
        </Panel>
      ) : null}

      {step === 6 ? (
        <Panel title="Ready to import" action={<Button onClick={confirmImport} disabled={isPending || !readyCount}>{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Import players</Button>}>
          <div className="grid gap-4 md:grid-cols-4">
            <Metric label="Rows found" value={String(rows.length)} />
            <Metric label="Selected operations" value={String(readyCount)} />
            <Metric label="Warnings" value={String(warningCount)} />
            <Metric label="Errors" value={String(errorCount)} />
          </div>
          <PositionSummary summary={positionSummary} />
          <label className="mt-5 block">
            <span className="text-sm font-bold text-slate-700">Import mode</span>
            <select value={importMode} onChange={(event) => setImportMode(event.target.value as ImportMode)} className="mt-1 h-11 w-full rounded-md border border-board-line bg-white px-3 text-board-navy md:max-w-sm">
              <option value="add_new">Add new players, skip possible duplicates</option>
              <option value="add_update">Add and update reviewed duplicates</option>
              <option value="update_only">Update existing players only</option>
            </select>
          </label>
        </Panel>
      ) : null}

      {step === 7 && result?.ok ? (
        <Panel title="Import completed" action={<ButtonLink href={`/squad?importBatch=${result.batchId}`}>Open imported players</ButtonLink>}>
          <div className="grid gap-4 md:grid-cols-5">
            <Metric label="Created" value={String(result.summary?.created ?? 0)} />
            <Metric label="Updated" value={String(result.summary?.updated ?? 0)} />
            <Metric label="Skipped" value={String(result.summary?.skipped ?? 0)} />
            <Metric label="Failed" value={String(result.summary?.failed ?? 0)} />
            <Metric label="Warnings" value={String(result.summary?.warnings ?? 0)} />
          </div>
          <PositionSummary summary={positionSummary} />
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => window.location.reload()} variant="secondary">Import another file</Button>
            {result.batchId ? <UndoButton batchId={result.batchId} /> : null}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function WorkflowSteps({ current }: { current: number }) {
  const labels = ["Select source", "Select sheet", "Map columns", "Review data", "Resolve duplicates", "Confirm import", "View results"];
  return (
    <ol className="flex gap-2 overflow-x-auto rounded-lg border border-board-line bg-white p-2 shadow-soft" aria-label="Import progress">
      {labels.map((label, index) => (
        <li key={label} className={cn("min-w-fit rounded-md px-3 py-2 text-xs font-bold", current === index + 1 ? "bg-board-green text-white" : "bg-slate-50 text-slate-600")}>
          {index + 1}. {label}
        </li>
      ))}
    </ol>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold text-board-navy">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function UploadBox({ onError, onLoaded }: { onError: (message: string) => void; onLoaded: (sheets: ParsedSheet[], sourceType: ImportSourceType, name: string) => void }) {
  const [filename, setFilename] = useState("");
  return (
    <label className="flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-board-line bg-slate-50 p-5 text-center hover:border-board-green">
      <FileSpreadsheet className="h-9 w-9 text-board-green" />
      <span className="mt-3 font-bold text-board-navy">Drop an Excel or CSV file here</span>
      <span className="mt-1 text-sm text-slate-600">or choose a file. Accepted: .xlsx, .csv. Max 10 MB.</span>
      {filename ? <span className="mt-2 rounded-md bg-white px-2 py-1 text-xs font-bold text-slate-600">{filename}</span> : null}
      <input
        type="file"
        accept=".xlsx,.csv,text/csv"
        className="sr-only"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setFilename(`${file.name} · ${Math.round(file.size / 1024)} KB`);
          try {
            const parsed = await parseFile(file);
            onLoaded(parsed.sheets, parsed.sourceType, file.name);
          } catch (caught) {
            onError(caught instanceof Error ? caught.message : "This file could not be read.");
          }
        }}
      />
    </label>
  );
}

function PasteBox({ value, onChange, onLoad }: { value: string; onChange: (value: string) => void; onLoad: () => void }) {
  return (
    <div className="rounded-lg border border-board-line bg-white p-4">
      <h3 className="font-bold text-board-navy">Paste table</h3>
      <p className="mt-1 text-sm text-slate-600">Paste rows copied from Excel, Google Sheets or LibreOffice.</p>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={7} className="mt-3 w-full rounded-md border border-board-line p-3 text-sm text-board-navy" />
      <Button type="button" onClick={onLoad} disabled={!value.trim()} className="mt-3 w-full">Use pasted table</Button>
    </div>
  );
}

function ImportHistory({ history }: { history: PlayerImportBatchSummary[] }) {
  return (
    <aside className="rounded-lg border border-board-line bg-white p-5 shadow-soft">
      <h2 className="text-lg font-bold text-board-navy">Import history</h2>
      <div className="mt-4 space-y-3">
        {history.length ? history.map((batch) => (
          <article key={batch.id} className="rounded-md border border-board-line p-3 text-sm">
            <p className="font-bold text-board-navy">{batch.sourceName || batch.sourceType}</p>
            <p className="mt-1 text-slate-600">{new Date(batch.createdAt).toLocaleString()} · {batch.status}</p>
            <p className="mt-2 font-semibold text-slate-700">{batch.createdCount} created · {batch.updatedCount} updated · {batch.skippedCount} skipped · {batch.failedCount} failed</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ButtonLink href={`/squad?importBatch=${batch.id}`} variant="secondary" className="h-9 px-3">Open players</ButtonLink>
              {!batch.rolledBackAt && batch.createdCount ? <UndoButton batchId={batch.id} small /> : null}
            </div>
          </article>
        )) : <p className="rounded-md border border-dashed border-board-line p-4 text-sm text-slate-600">No imports yet.</p>}
      </div>
    </aside>
  );
}

function ReviewRows({ rows, onRowsChange, duplicatesOnly = false }: { rows: ReviewedImportRow[]; onRowsChange: (rows: ReviewedImportRow[]) => void; duplicatesOnly?: boolean }) {
  const visible = duplicatesOnly ? rows.filter((row) => row.duplicateSignals.length) : rows;
  if (!visible.length) return <p className="rounded-md border border-dashed border-board-line p-4 text-sm text-slate-600">No rows in this view.</p>;
  return (
    <div className="mt-4 space-y-3">
      {visible.map((row) => (
        <article key={row.rowNumber} className={cn("rounded-lg border p-4", row.errors.length ? "border-red-200 bg-red-50" : row.duplicateSignals.length ? "border-amber-200 bg-amber-50" : "border-board-line bg-white")}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="font-bold text-board-navy">Row {row.rowNumber}: {row.values.firstName?.normalized} {row.values.lastName?.normalized}</p>
              <p className="mt-1 text-sm text-slate-600">{row.status} · {row.warnings.length} warnings · {row.errors.length} errors</p>
              {row.duplicateSignals.length ? <p className="mt-2 text-sm font-semibold text-amber-800">{row.duplicateSignals.join(" ")}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={row.operation} onChange={(event) => updateRow(rows, onRowsChange, row.rowNumber, { operation: event.target.value as ImportOperation })} className="h-10 rounded-md border border-board-line bg-white px-2 text-sm">
                <option value="create">Create new</option>
                <option value="fill_missing">Fill missing info</option>
                <option value="update">Update existing</option>
                <option value="skip">Skip row</option>
              </select>
              <Button type="button" variant="secondary" onClick={() => updateRow(rows, onRowsChange, row.rowNumber, { excluded: !row.excluded, status: row.excluded ? row.status : "excluded" })}>{row.excluded ? "Include" : "Exclude"}</Button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Object.entries(row.values).filter(([key]) => key !== "ignore" && key !== "fullName").map(([key, value]) => (
              <label key={key} className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{importFieldLabel(key as ColumnMapping["field"])}</span>
                <input
                  value={value?.normalized ?? ""}
                  onChange={(event) => updateCell(rows, onRowsChange, row.rowNumber, key as ColumnMapping["field"], event.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-2 text-sm text-board-navy"
                />
                {value?.original && value.original !== value.normalized ? <span className="mt-1 block text-xs text-slate-500">Original: {value.original}</span> : null}
              </label>
            ))}
          </div>
          {row.errors.length || row.warnings.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {[...row.errors, ...row.warnings].map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function updateRow(rows: ReviewedImportRow[], onRowsChange: (rows: ReviewedImportRow[]) => void, rowNumber: number, patch: Partial<ReviewedImportRow>) {
  onRowsChange(rows.map((row) => row.rowNumber === rowNumber ? { ...row, ...patch } : row));
}

function updateCell(rows: ReviewedImportRow[], onRowsChange: (rows: ReviewedImportRow[]) => void, rowNumber: number, field: ColumnMapping["field"], normalized: string) {
  onRowsChange(rows.map((row) => row.rowNumber === rowNumber ? {
    ...row,
    values: {
      ...row.values,
      [field]: {
        original: row.values[field]?.original ?? normalized,
        normalized,
        warnings: row.values[field]?.warnings ?? []
      }
    }
  } : row));
}

function SheetPreview({ sheet }: { sheet: ParsedSheet }) {
  const preview = sheet.rows.slice(0, 6);
  return (
    <div className="mt-5 overflow-x-auto rounded-lg border border-board-line">
      <table className="min-w-full divide-y divide-board-line text-sm">
        <tbody className="divide-y divide-board-line">
          {preview.map((row, index) => <tr key={index}>{row.slice(0, 8).map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2 text-slate-700">{cell}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

function Summary({ created, warnings, errors, duplicates }: { created: number; warnings: number; errors: number; duplicates: number }) {
  return <div className="grid gap-3 md:grid-cols-4"><Metric label="Ready operations" value={String(created)} /><Metric label="Warnings" value={String(warnings)} /><Metric label="Errors" value={String(errors)} /><Metric label="Possible duplicates" value={String(duplicates)} /></div>;
}

type PositionImportSummary = {
  total: number;
  recognized: number;
  withSecondary: number;
  needsReview: number;
  missing: number;
};

function summarizePositions(rows: ReviewedImportRow[]): PositionImportSummary {
  const active = rows.filter((row) => !row.excluded);
  return {
    total: active.length,
    recognized: active.filter((row) => Boolean(row.values.position?.normalized)).length,
    withSecondary: active.filter((row) => Boolean(row.values.secondaryPositions?.normalized)).length,
    needsReview: active.filter((row) => row.warnings.some((warning) => warning.toLowerCase().includes("unknown position"))).length,
    missing: active.filter((row) => !row.values.position?.normalized).length
  };
}

function PositionSummary({ summary }: { summary: PositionImportSummary }) {
  return (
    <section className="mt-4 rounded-lg border border-board-line bg-board-paper p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="font-bold text-board-navy">Positions</h3>
          <p className="mt-1 text-sm text-slate-600">
            {summary.total} Players total · {summary.recognized} with primary position · {summary.withSecondary} with secondary positions
          </p>
        </div>
        {summary.needsReview || summary.missing ? (
          <div className="rounded-md bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
            {summary.needsReview} need review · {summary.missing} missing
          </div>
        ) : (
          <div className="rounded-md bg-green-50 px-3 py-2 text-sm font-bold text-green-800">All recognized</div>
        )}
      </div>
      {summary.needsReview ? (
        <p className="mt-2 text-sm font-semibold text-amber-800">
          Some position values could not be recognized. Review those rows before importing, or continue knowing those positions will stay empty.
        </p>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-board-navy">{value}</p></div>;
}

function StatusBadge({ value, tone }: { value: string; tone: "green" | "amber" | "slate" }) {
  return <span className={cn("inline-flex rounded-md px-2 py-1 text-xs font-bold", tone === "green" ? "bg-green-50 text-green-700" : tone === "amber" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600")}>{value}</span>;
}

function Alert({ message }: { message: string }) {
  return <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"><AlertTriangle className="h-4 w-4 shrink-0" />{message}</div>;
}

function UndoButton({ batchId, small = false }: { batchId: string; small?: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="danger"
      className={small ? "h-9 px-3" : undefined}
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Undo this import? Safe created players may be removed. Players with later coaching data will be kept.")) return;
        startTransition(async () => {
          await undoPlayerImport(batchId);
          window.location.reload();
        });
      }}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
      Undo safe import
    </Button>
  );
}

async function parseFile(file: File): Promise<{ sheets: ParsedSheet[]; sourceType: ImportSourceType }> {
  if (file.size > maxFileSize) throw new Error("File is too large. Maximum size is 10 MB.");
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv")) {
    const text = await file.text();
    return { sheets: [{ name: "CSV", rows: parseDelimited(text, detectDelimiter(text)) }], sourceType: "csv" };
  }
  if (!lower.endsWith(".xlsx")) throw new Error("Unsupported file type. Upload a standard .xlsx or .csv file.");
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellFormula: false, cellHTML: false, cellNF: false });
  const sheets = workbook.SheetNames.map((name) => ({
    name,
    rows: (XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: "" }) as unknown[][]).map((row) => row.map((cell) => String(cell ?? "")))
  })).filter((sheet) => sheet.rows.some((row) => row.some((cell) => cell.trim())));
  if (!sheets.length) throw new Error("No usable worksheet was found.");
  validateSheets(sheets);
  return { sheets, sourceType: "xlsx" };
}

function parseDelimited(text: string, delimiter: string) {
  const rows = text.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => parseLine(line, delimiter)).filter((row) => row.some((cell) => cell.trim()));
  validateSheets([{ name: "Table", rows }]);
  return rows;
}

function parseLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (quoted && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function detectDelimiter(text: string) {
  const first = text.split(/\r?\n/).find(Boolean) ?? "";
  const candidates = [",", ";", "\t"];
  return candidates.sort((a, b) => first.split(b).length - first.split(a).length)[0];
}

function validateSheets(sheets: ParsedSheet[]) {
  for (const sheet of sheets) {
    if (sheet.rows.length > maxRows + 1) throw new Error("This file has too many rows. Maximum is 2,000 player rows.");
    if (Math.max(...sheet.rows.map((row) => row.length), 0) > maxColumns) throw new Error("This file has too many columns. Maximum is 100.");
  }
}

function detectTable(rows: string[][]) {
  const headerIndex = Math.max(0, rows.findIndex((row) => row.filter((cell) => cell.trim()).length >= 2));
  const rawHeaders = rows[headerIndex] ?? [];
  const headers = rawHeaders.map((header, index) => header.trim() || `Column ${index + 1}`);
  const dataRows = rows.slice(headerIndex + 1).filter((row) => row.some((cell) => cell.trim()));
  return { headerIndex, headers, rows: dataRows };
}

function sampleValues(rows: string[][], index: number) {
  return rows.slice(0, 3).map((row) => row[index]).filter(Boolean);
}

function groupedFields() {
  return Array.from(Map.groupBy(importFields, (field) => field.group).entries());
}

function confidenceLabel(value?: string) {
  if (value === "high") return "High confidence";
  if (value === "possible") return "Possible match";
  if (value === "confirm") return "Confirmation required";
  return "Unmapped";
}

function downloadTemplate() {
  const blob = new Blob([templateCsv()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "coachboard-player-import-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
