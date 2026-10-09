import JSZip from "jszip";
import { validateDrillImageFile } from "@/lib/drills/image-upload";
import { isSafePackagePath, parseDrillImportManifest, type DrillImportManifest } from "@/lib/drills/import-schema";

export const maxDrillImportZipBytes = 100 * 1024 * 1024;
export const maxDrillImportUncompressedBytes = 250 * 1024 * 1024;
export const maxDrillImportFiles = 220;
export const maxDrillImportManifestBytes = 5 * 1024 * 1024;

export type ParsedDrillImportPackage = {
  manifest: DrillImportManifest;
  images: Map<string, File>;
  sourceFilename: string;
  packageSizeBytes: number;
};

type ZipEntryWithSize = JSZip.JSZipObject & {
  unsafeOriginalName?: string;
  _data?: { uncompressedSize?: number };
};

export async function parseDrillImportPackage(file: File): Promise<ParsedDrillImportPackage> {
  if (!file.name.toLowerCase().endsWith(".zip")) throw new Error("Select a ZIP import package.");
  if (!file.size || file.size > maxDrillImportZipBytes) throw new Error("The ZIP package must be 100 MB or smaller.");

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file, { checkCRC32: true, createFolders: false });
  } catch {
    throw new Error("The ZIP package is invalid or corrupted.");
  }

  const entries = Object.values(zip.files).filter((entry) => !entry.dir) as ZipEntryWithSize[];
  if (!entries.length) throw new Error("The ZIP package is empty.");
  if (entries.length > maxDrillImportFiles) throw new Error(`The ZIP package may contain at most ${maxDrillImportFiles} files.`);

  let declaredUncompressedBytes = 0;
  for (const entry of entries) {
    const originalName = entry.unsafeOriginalName ?? entry.name;
    if (!isSafePackagePath(originalName) || !isSafePackagePath(entry.name)) throw new Error(`Unsafe ZIP path: ${originalName}`);
    declaredUncompressedBytes += entry._data?.uncompressedSize ?? 0;
  }
  if (declaredUncompressedBytes > maxDrillImportUncompressedBytes) throw new Error("The uncompressed package is too large.");

  const meaningfulEntries = entries.filter((entry) => !entry.name.startsWith("__MACOSX/") && !entry.name.endsWith("/.DS_Store") && !entry.name.endsWith(".DS_Store"));
  const manifestEntry = meaningfulEntries.find((entry) => entry.name === "drills.json");
  if (!manifestEntry) throw new Error("The package must contain drills.json at its root.");
  const manifestSize = manifestEntry._data?.uncompressedSize ?? 0;
  if (manifestSize > maxDrillImportManifestBytes) throw new Error("drills.json is too large.");

  for (const entry of meaningfulEntries) {
    if (entry.name === "drills.json") continue;
    if (!/^images\/.+\.(jpe?g|png|webp)$/i.test(entry.name)) throw new Error(`Unsupported package file: ${entry.name}`);
  }

  let rawManifest: unknown;
  try {
    const manifestText = await manifestEntry.async("string");
    if (new Blob([manifestText]).size > maxDrillImportManifestBytes) throw new Error("drills.json is too large.");
    rawManifest = JSON.parse(manifestText.replace(/^\uFEFF/, ""));
  } catch (error) {
    if (error instanceof Error && error.message === "drills.json is too large.") throw error;
    throw new Error("drills.json does not contain valid JSON.");
  }
  const manifest = parseDrillImportManifest(rawManifest);
  const referencedPaths = new Set(manifest.drills.flatMap(({ item }) => item.image ? [item.image] : []));
  const images = new Map<string, File>();
  let actualUncompressedBytes = 0;

  for (const path of referencedPaths) {
    const entry = zip.file(path);
    const manifestItem = manifest.drills.find(({ item }) => item.image === path);
    if (!entry) {
      manifestItem?.issues.push({ field: "image", code: "missing_file", severity: "error" });
      continue;
    }
    const declaredImageSize = (entry as ZipEntryWithSize)._data?.uncompressedSize ?? 0;
    if (declaredImageSize > 10 * 1024 * 1024) {
      manifestItem?.issues.push({ field: "image", code: "invalid_file", severity: "error" });
      continue;
    }
    const blob = await entry.async("blob");
    actualUncompressedBytes += blob.size;
    if (actualUncompressedBytes > maxDrillImportUncompressedBytes) throw new Error("The uncompressed package is too large.");
    try {
      const mimeType = await validateDrillImageFile(blob);
      images.set(path, new File([blob], path.split("/").pop() ?? "drill-image", { type: mimeType }));
    } catch {
      manifestItem?.issues.push({ field: "image", code: "invalid_file", severity: "error" });
    }
  }

  return { manifest, images, sourceFilename: file.name, packageSizeBytes: file.size };
}
