export const drillImageBucket = "drill-images";
export const maxDrillImageBytes = 10 * 1024 * 1024;

export type DrillImageMimeType = "image/jpeg" | "image/png" | "image/webp";
export type DrillImageErrorCode = "file_too_large" | "unsupported_format" | "upload_failed" | "missing_upload";

export class DrillImageError extends Error {
  readonly code: DrillImageErrorCode;

  constructor(code: DrillImageErrorCode, message: string) {
    super(message);
    this.name = "DrillImageError";
    this.code = code;
  }
}

export async function validateDrillImageFile(file: Blob): Promise<DrillImageMimeType> {
  if (!file.size || file.size > maxDrillImageBytes) {
    throw new DrillImageError("file_too_large", "The image must be 10 MB or smaller.");
  }

  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const detected = detectDrillImageMimeType(bytes);
  if (!detected) {
    throw new DrillImageError("unsupported_format", "Use a JPEG, PNG, or WebP image.");
  }

  const declared = normalizeImageMimeType(file.type);
  if (declared && declared !== detected) {
    throw new DrillImageError("unsupported_format", "The image content does not match its file type.");
  }
  return detected;
}

export function drillImageExtension(mimeType: DrillImageMimeType) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  return "webp";
}

function normalizeImageMimeType(value: string): DrillImageMimeType | undefined {
  const normalized = value.toLowerCase();
  if (normalized === "image/jpeg" || normalized === "image/jpg") return "image/jpeg";
  if (normalized === "image/png") return "image/png";
  if (normalized === "image/webp") return "image/webp";
  return undefined;
}

function detectDrillImageMimeType(bytes: Uint8Array): DrillImageMimeType | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) return "image/png";
  if (
    bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) return "image/webp";
  return undefined;
}
