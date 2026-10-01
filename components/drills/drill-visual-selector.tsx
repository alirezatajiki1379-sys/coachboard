"use client";

import { useEffect, useRef, useState } from "react";
import { ImageUp, Loader2, Pencil, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOptionalI18n } from "@/components/i18n/i18n-provider";
import { getMessages } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { DrillImageError, type DrillImageErrorCode, validateDrillImageFile } from "@/lib/drills/image-upload";
import { clearPendingDrillImage, loadPendingDrillImage, savePendingDrillImage } from "@/lib/drills/pending-image-draft";
import type { DrillVisual, DrillVisualSource } from "@/types/domain";

export function DrillVisualSelector({
  visual,
  source,
  draftKey,
  pendingImageName,
  initialRemoveUploadedImage,
  serverError,
  isSubmitting,
  onSourceChange,
  onPendingFileChange,
  onDirty
}: {
  visual?: DrillVisual;
  source: DrillVisualSource;
  draftKey: string;
  pendingImageName?: string;
  initialRemoveUploadedImage?: boolean;
  serverError?: DrillImageErrorCode;
  isSubmitting: boolean;
  onSourceChange: (source: DrillVisualSource) => void;
  onPendingFileChange: (file?: File) => void;
  onDirty: () => void;
}) {
  const text = useOptionalI18n()?.messages.drillVisual ?? getMessages("en").drillVisual;
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File>();
  const [draftImageName, setDraftImageName] = useState(pendingImageName ?? "");
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [removeUploadedImage, setRemoveUploadedImage] = useState(Boolean(initialRemoveUploadedImage));
  const [localError, setLocalError] = useState<DrillImageErrorCode | "local_failed">();
  const [serverErrorDismissed, setServerErrorDismissed] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (!draftImageName || pendingFile) return;
    let cancelled = false;
    void loadPendingDrillImage(draftKey).then(async (file) => {
      if (cancelled || !file) return;
      await validateDrillImageFile(file);
      if (cancelled) return;
      setPendingFile(file);
      setRecovered(true);
      onPendingFileChange(file);
    }).catch(() => {
      if (!cancelled) {
        setLocalError("local_failed");
        setDraftImageName("");
        void clearPendingDrillImage(draftKey);
      }
    });
    return () => { cancelled = true; };
  }, [draftImageName, draftKey, onPendingFileChange, pendingFile]);

  useEffect(() => {
    if (pendingImageName) setDraftImageName(pendingImageName);
  }, [pendingImageName]);

  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  const displayedImage = previewUrl ?? (!removeUploadedImage ? visual?.uploadedImageUrl : undefined);
  const error = localError ?? (serverErrorDismissed ? undefined : serverError);

  async function selectFile(file?: File) {
    if (!file) return;
    setLocalError(undefined);
    setServerErrorDismissed(true);
    try {
      await validateDrillImageFile(file);
      setPendingFile(file);
      setDraftImageName(file.name);
      setRecovered(false);
      setRemoveUploadedImage(false);
      onPendingFileChange(file);
      onSourceChange("upload");
      onDirty();
      try {
        await savePendingDrillImage(draftKey, file);
      } catch {
        setLocalError("local_failed");
      }
    } catch (selectionError) {
      setLocalError(selectionError instanceof DrillImageError ? selectionError.code : "unsupported_format");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeImage() {
    setPendingFile(undefined);
    setDraftImageName("");
    setPreviewUrl(undefined);
    setRecovered(false);
    setServerErrorDismissed(true);
    setRemoveUploadedImage(Boolean(visual?.uploadedImagePath));
    onPendingFileChange(undefined);
    onSourceChange("editor");
    onDirty();
    if (inputRef.current) inputRef.current.value = "";
    try {
      await clearPendingDrillImage(draftKey);
    } catch {
      // The canonical server image state remains safe even if local cleanup fails.
    }
  }

  return (
    <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft sm:p-5">
      <div>
        <h2 className="text-lg font-bold text-board-navy">{text.title}</h2>
        <p className="mt-1 text-sm text-slate-500">{text.description}</p>
      </div>

      <input type="hidden" name="visualSource" value={source} />
      <input type="hidden" name="removeUploadedImage" value={removeUploadedImage ? "true" : "false"} />
      <input type="hidden" name="pendingUploadedImageName" value={draftImageName} />
      <input type="hidden" name="pendingUploadedImageType" value={pendingFile?.type ?? ""} />
      <input type="hidden" name="pendingUploadedImageSize" value={pendingFile?.size ? String(pendingFile.size) : ""} />

      <div className="mt-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label={text.title}>
        <button
          type="button"
          role="radio"
          aria-checked={source === "editor"}
          onClick={() => { onSourceChange("editor"); onDirty(); }}
          className={cn("flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-bold", source === "editor" ? "border-board-green bg-emerald-50 text-board-green" : "border-board-line text-slate-600 hover:bg-slate-50")}
        >
          <Pencil className="h-4 w-4" />
          {text.editor}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={source === "upload"}
          onClick={() => { onSourceChange("upload"); onDirty(); }}
          className={cn("flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-bold", source === "upload" ? "border-board-green bg-emerald-50 text-board-green" : "border-board-line text-slate-600 hover:bg-slate-50")}
        >
          <ImageUp className="h-4 w-4" />
          {text.upload}
        </button>
      </div>

      {source === "upload" ? (
        <div className="mt-4">
          {displayedImage ? (
            <div>
              <p className="mb-2 text-xs font-bold uppercase text-slate-500">{text.current}</p>
              <div className="flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-md border border-board-line bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={displayedImage} alt={text.current} className="h-full w-full object-contain" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()} disabled={isSubmitting}>
                  <Upload className="h-4 w-4" /> {text.replace}
                </Button>
                <Button type="button" variant="danger" onClick={() => void removeImage()} disabled={isSubmitting}>
                  <Trash2 className="h-4 w-4" /> {text.remove}
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                void selectFile(event.dataTransfer.files[0]);
              }}
              className={cn("flex min-h-44 w-full flex-col items-center justify-center rounded-md border border-dashed p-5 text-center transition", dragActive ? "border-board-green bg-emerald-50" : "border-board-line bg-slate-50 hover:border-board-green")}
            >
              <ImageUp className="h-7 w-7 text-board-green" />
              <span className="mt-2 text-sm font-bold text-board-navy">{text.select}</span>
              <span className="mt-1 text-xs text-slate-500">{text.drop}</span>
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => void selectFile(event.target.files?.[0])}
          />
          <p className="mt-2 text-xs text-slate-500">{text.helper} {text.limit}</p>
          {isSubmitting && pendingFile ? <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-board-green"><Loader2 className="h-4 w-4 animate-spin" />{text.uploading}</p> : null}
          {!isSubmitting && pendingFile && !error ? <p className="mt-2 text-sm font-semibold text-board-green">{recovered ? text.restored : text.ready}</p> : null}
          {error ? <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{imageErrorText(error, text)}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function imageErrorText(error: DrillImageErrorCode | "local_failed", text: ReturnType<typeof getMessages>["drillVisual"]) {
  if (error === "file_too_large") return text.tooLarge;
  if (error === "unsupported_format") return text.unsupported;
  if (error === "missing_upload") return text.missing;
  if (error === "local_failed") return text.localFailed;
  return text.failed;
}
