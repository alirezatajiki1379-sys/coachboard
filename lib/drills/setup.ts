import type { Json } from "@/types/database";
import type { DrillSetupArea, DrillSetupParameter } from "@/types/domain";

export function parseSetupArea(value: Json | null | undefined): DrillSetupArea | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const length = positiveNumber(value.length);
  const width = positiveNumber(value.width);
  if (length == null && width == null) return undefined;
  return { length, width, unit: "m" };
}

export function setupAreaToJson(area: DrillSetupArea | undefined): Json | null {
  if (!area?.length && !area?.width) return null;
  return {
    length: area.length ?? null,
    width: area.width ?? null,
    unit: "m"
  };
}

export function parseSetupParameters(value: Json | null | undefined): DrillSetupParameter[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const label = typeof item.label === "string" ? item.label.trim() : "";
    const measurement = positiveNumber(item.value);
    if (!label || measurement == null) return [];
    return [{
      id: typeof item.id === "string" && item.id ? item.id : cryptoSafeId(label),
      label,
      value: measurement,
      unit: "m" as const
    }];
  });
}

export function setupParametersToJson(parameters: DrillSetupParameter[]): Json {
  return parameters
    .filter((parameter) => parameter.label.trim() && parameter.value > 0)
    .map((parameter) => ({
      id: parameter.id,
      label: parameter.label.trim(),
      value: roundSetupNumber(parameter.value),
      unit: "m"
    }));
}

export function parseSetupNumberInput(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return undefined;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? roundSetupNumber(parsed) : undefined;
}

export function formatMeters(value: number, locale: string = "en-GB") {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} m`;
}

export function formatArea(area: DrillSetupArea | undefined, locale: string = "en-GB") {
  if (!area?.length && !area?.width) return "";
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  if (area.length && area.width) return `${formatter.format(area.length)} × ${formatter.format(area.width)} m`;
  if (area.length) return `${formatter.format(area.length)} m length`;
  if (area.width) return `${formatter.format(area.width)} m width`;
  return "";
}

function positiveNumber(value: unknown) {
  if (typeof value !== "number") return undefined;
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return roundSetupNumber(value);
}

function roundSetupNumber(value: number) {
  return Math.round(value * 10) / 10;
}

function cryptoSafeId(seed: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `setup-${seed.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
}
