import type { Json } from "@/types/database";
import type { MaterialColor, MaterialItem, MaterialType } from "@/types/domain";
import type { DrillEditorObject, DrillEditorState } from "@/types/editor";

const materialTypes: MaterialType[] = [
  "balls",
  "cones",
  "flat_markers",
  "bibs",
  "rings",
  "goals",
  "mini_goals",
  "poles",
  "mannequins",
  "other"
];

const materialColors: MaterialColor[] = [
  "Red",
  "Blue",
  "Yellow",
  "Green",
  "White",
  "Black",
  "Orange",
  "Purple"
];

function isMaterialType(value: string): value is MaterialType {
  return materialTypes.includes(value as MaterialType);
}

function normalizeType(value: string): MaterialType {
  const normalized = value.toLowerCase().replaceAll(" ", "_").replaceAll("-", "_");
  if (isMaterialType(normalized)) {
    return normalized;
  }

  if (normalized === "ball") return "balls";
  if (normalized === "cone") return "cones";
  if (normalized === "marker" || normalized === "disc" || normalized === "flat_marker") return "flat_markers";
  if (normalized === "bib") return "bibs";
  if (normalized === "ring") return "rings";
  if (normalized === "goal") return "goals";
  if (normalized === "mini_goal") return "mini_goals";
  if (normalized === "pole") return "poles";
  if (normalized === "mannequin") return "mannequins";

  return "other";
}

function isKnownMaterialWord(value: string) {
  return normalizeType(value) !== "other" || value.toLowerCase().replaceAll(" ", "_").replaceAll("-", "_") === "other";
}

function toColor(value: string | undefined): MaterialColor | undefined {
  if (!value) return undefined;
  const color = materialColors.find((item) => item.toLowerCase() === value.toLowerCase());
  return color;
}

export function parseMaterials(input: string): MaterialItem[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      const firstNumber = Number.parseInt(parts[0] ?? "", 10);
      const quantity = Number.isFinite(firstNumber) && firstNumber > 0 ? firstNumber : 1;
      const startIndex = Number.isFinite(firstNumber) ? 1 : 0;
      const colorBeforeType = toColor(parts[startIndex]);
      const typeIndex = colorBeforeType ? startIndex + 1 : startIndex;
      const rawType = parts[typeIndex] ?? "other";
      const type = normalizeType(rawType);
      const possibleColor = colorBeforeType ?? toColor(parts[typeIndex + 1]);
      const unknownManualMaterial = type === "other" && !isKnownMaterialWord(rawType);
      const labelStart = unknownManualMaterial ? typeIndex : colorBeforeType ? typeIndex + 1 : possibleColor ? typeIndex + 2 : typeIndex + 1;
      const label = parts.slice(labelStart).join(" ").trim();

      return {
        type,
        color: possibleColor,
        label: label || undefined,
        quantity,
        source: "manual"
      };
    });
}

export function serializeMaterials(materials: MaterialItem[]): string {
  return materials
    .map((material) =>
      [material.quantity, material.type, material.color, material.variant, material.label].filter(Boolean).join(" ")
    )
    .join("\n");
}

export function materialsToJson(materials: MaterialItem[]): Json {
  return materials.map((material) => ({
    type: material.type,
    color: material.color ?? null,
    label: material.label ?? null,
    variant: material.variant ?? null,
    source: material.source ?? "manual",
    quantity: material.quantity
  }));
}

export function parseMaterialsJson(input: string): MaterialItem[] | null {
  if (!input.trim()) return null;
  try {
    return jsonToMaterials(JSON.parse(input) as Json);
  } catch {
    return null;
  }
}

export function jsonToMaterials(value: Json): MaterialItem[] {
  if (!Array.isArray(value)) return [];

  return value.reduce<MaterialItem[]>((items, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return items;
      const rawType = typeof item.type === "string" ? item.type : "other";
      const rawColor = typeof item.color === "string" ? item.color : undefined;
      const rawLabel = typeof item.label === "string" ? item.label : undefined;
      const rawVariant = typeof item.variant === "string" ? item.variant : undefined;
      const rawSource = item.source === "graphic" || item.source === "manual" ? item.source : undefined;
      const rawQuantity = typeof item.quantity === "number" ? item.quantity : 1;

      items.push({
        type: normalizeType(rawType),
        color: toColor(rawColor),
        label: rawLabel,
        variant: rawVariant,
        source: rawSource,
        quantity: rawQuantity > 0 ? rawQuantity : 1
      });

      return items;
  }, []);
}

export function materialSummary(materials: MaterialItem[]) {
  if (!materials.length) return "No materials";

  return materials
    .map(materialLineLabel)
    .join(", ");
}

export function materialDisplayName(material: MaterialItem) {
  return [material.color?.toLowerCase(), materialItemName(material, false)]
    .filter(Boolean)
    .join(" ");
}

export function materialLineLabel(material: MaterialItem) {
  return [material.quantity, material.color?.toLowerCase(), materialItemName(material, material.quantity !== 1)]
    .filter(Boolean)
    .join(" ");
}

export function materialCategoryKey(type: MaterialType | string) {
  return type === "mini_goals" ? "goals" : type;
}

export function materialCategoryLabel(type: MaterialType | string) {
  const category = materialCategoryKey(type);
  const labels: Record<string, string> = {
    balls: "Balls",
    cones: "Cones",
    flat_markers: "Flat markers",
    bibs: "Bibs / Leibchen",
    goals: "Goals",
    mini_goals: "Goals",
    poles: "Poles",
    mannequins: "Mannequins",
    rings: "Rings",
    other: "Other"
  };
  return labels[category] ?? "Other";
}

export function materialCategoryOrder(type: MaterialType | string) {
  const category = materialCategoryKey(type);
  const order = ["balls", "cones", "flat_markers", "bibs", "goals", "mini_goals", "poles", "mannequins", "rings", "other"];
  const index = order.indexOf(category);
  return index >= 0 ? index : order.length;
}

export function materialDisplayGroups<T extends { type: string; color?: string; variant?: string; label?: string }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const category = materialCategoryKey(item.type);
    groups.set(category, [...(groups.get(category) ?? []), item]);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => materialCategoryOrder(a) - materialCategoryOrder(b) || a.localeCompare(b))
    .map(([category, groupItems]) => ({
      category,
      items: [...groupItems].sort(compareMaterialLike)
    }));
}

export function detectMaterialsFromGraphic(graphic: DrillEditorState): MaterialItem[] {
  const totals = new Map<string, MaterialItem>();

  for (const object of graphic.objects) {
    const material = materialFromEditorObject(object);
    if (!material) continue;
    const key = materialGroupingKey(material);
    const current = totals.get(key);
    if (current) {
      current.quantity += 1;
    } else {
      totals.set(key, material);
    }
  }

  return Array.from(totals.values()).sort(sortMaterialItems);
}

export function materialGroupingKey(material: MaterialItem) {
  return [
    material.type,
    material.color ?? "",
    normalizeKeyPart(material.variant),
    normalizeKeyPart(material.label)
  ].join(":");
}

function materialFromEditorObject(object: DrillEditorObject): MaterialItem | null {
  if (object.type === "cone") {
    const variant = object.variant === "stripe" || object.variant === "striped" ? "striped" : undefined;
    return {
      type: "cones",
      color: colorFromHex(object.color),
      variant,
      quantity: 1,
      source: "graphic"
    };
  }
  if (object.type === "marker") {
    return {
      type: "flat_markers",
      color: colorFromHex(object.color),
      quantity: 1,
      source: "graphic"
    };
  }
  if (object.type === "ring") {
    return {
      type: "rings",
      color: colorFromHex(object.color),
      quantity: 1,
      source: "graphic"
    };
  }
  if (object.type === "ball") {
    return {
      type: "balls",
      variant: ballVariantLabel(object.variant),
      quantity: 1,
      source: "graphic"
    };
  }
  if (object.type === "bib") {
    return {
      type: "bibs",
      color: colorFromHex(object.color),
      quantity: 1,
      source: "graphic"
    };
  }
  if (object.type === "pole") return { type: "poles", color: colorFromHex(object.color), quantity: 1, source: "graphic" };
  if (object.type === "mannequin") return { type: "mannequins", color: colorFromHex(object.color), quantity: 1, source: "graphic" };
  if (object.type === "mini_goal") return { type: "mini_goals", quantity: 1, source: "graphic" };
  if (object.type === "goal") {
    const variant = (object.variant ?? "").toLowerCase();
    return {
      type: "goals",
      variant: variant.includes("youth") ? "youth goal" : "normal goal",
      quantity: 1,
      source: "graphic"
    };
  }
  return null;
}

function ballVariantLabel(variant?: string) {
  if (variant === "tennis") return "tennis ball";
  if (variant === "basketball") return "basketball";
  if (variant === "small-football" || variant === "small_football") return "small football";
  return "football";
}

function colorFromHex(value?: string): MaterialColor | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  const colorMap: Record<string, MaterialColor> = {
    "#dc2626": "Red",
    "#2563eb": "Blue",
    "#f59e0b": "Yellow",
    "#facc15": "Yellow",
    "#16a34a": "Green",
    "#84cc16": "Green",
    "#ffffff": "White",
    "#111827": "Black",
    "#f97316": "Orange",
    "#9333ea": "Purple"
  };
  return colorMap[normalized] ?? toColor(value);
}

function normalizeKeyPart(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function materialBaseName(material: Pick<MaterialItem, "type">, plural: boolean) {
  const names: Record<MaterialType, [string, string]> = {
    balls: ["ball", "balls"],
    cones: ["cone", "cones"],
    flat_markers: ["flat marker", "flat markers"],
    bibs: ["bib", "bibs"],
    rings: ["ring", "rings"],
    goals: ["goal", "goals"],
    mini_goals: ["mini goal", "mini goals"],
    poles: ["pole", "poles"],
    mannequins: ["mannequin", "mannequins"],
    other: ["custom material", "custom materials"]
  };
  const fallback: [string, string] = [String(material.type).replaceAll("_", " "), `${String(material.type).replaceAll("_", " ")}s`];
  return (names[material.type] ?? fallback)[plural ? 1 : 0];
}

function materialItemName(material: Pick<MaterialItem, "type" | "label" | "variant">, plural: boolean) {
  const label = cleanMaterialLabel(material.label, material.type);
  if (label) return label;
  if (material.type === "balls" && material.variant) {
    const variant = material.variant.toLowerCase();
    if (variant === "football") return plural ? "footballs" : "football";
    if (variant === "small football") return plural ? "small footballs" : "small football";
    if (variant === "tennis ball") return plural ? "tennis balls" : "tennis ball";
    if (variant === "basketball") return plural ? "basketballs" : "basketball";
  }
  if (material.type === "cones" && material.variant) {
    return plural ? `${material.variant} cones` : `${material.variant} cone`;
  }
  if (material.type === "goals" && material.variant) {
    return plural ? `${material.variant}s` : material.variant;
  }
  if (material.type === "mini_goals") return plural ? "mini goals" : "mini goal";
  if (material.variant) return plural ? `${material.variant}s` : material.variant;
  return materialBaseName(material, plural);
}

function cleanMaterialLabel(label: string | undefined, type: MaterialType) {
  const trimmed = label?.trim();
  if (!trimmed) return undefined;
  const placeholder = trimmed.toLowerCase();
  if ((placeholder === "custom material" || placeholder === "custom label") && type !== "other") return undefined;
  return trimmed;
}

function compareMaterialLike<T extends { color?: string; variant?: string; label?: string }>(a: T, b: T) {
  return (
    (a.color ?? "").localeCompare(b.color ?? "") ||
    (a.variant ?? "").localeCompare(b.variant ?? "") ||
    (a.label ?? "").localeCompare(b.label ?? "")
  );
}

function sortMaterialItems(a: MaterialItem, b: MaterialItem) {
  return (
    a.type.localeCompare(b.type) ||
    (a.color ?? "").localeCompare(b.color ?? "") ||
    (a.variant ?? "").localeCompare(b.variant ?? "") ||
    (a.label ?? "").localeCompare(b.label ?? "")
  );
}
