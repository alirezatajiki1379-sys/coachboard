import { createSystemTranslator } from "@/lib/i18n/system-text";
import type { Locale } from "@/lib/i18n";
import type { MaterialItem } from "@/types/domain";

const typeLabels: Record<MaterialItem["type"], string> = {
  balls: "Balls", cones: "Cones", flat_markers: "Flat markers", bibs: "Bibs",
  rings: "Rings", goals: "Goals", mini_goals: "Mini goals", poles: "Poles",
  mannequins: "Mannequins", other: "Other"
};
const systemVariants = new Set(["football", "small football", "tennis ball", "basketball", "striped", "classic", "tall", "normal goal", "youth goal"]);

export function DrillMaterialLabel({ material, locale }: { material: MaterialItem; locale: Locale }) {
  const ui = createSystemTranslator(locale);
  return <span>
    {material.quantity} {ui(typeLabels[material.type])}
    {material.color ? ` · ${ui(material.color)}` : null}
    {material.variant ? <> · <span translate="no">{systemVariants.has(material.variant) ? ui(material.variant) : material.variant}</span></> : null}
    {material.label ? <> · <span translate="no">{material.label}</span></> : null}
  </span>;
}
