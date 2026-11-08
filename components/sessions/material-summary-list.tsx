import { jsonToMaterials, materialCategoryLabel, materialDisplayGroups } from "@/lib/drills/materials";
import { materialSummaryLabel, type MaterialSummaryItem } from "@/lib/sessions/utils";
import { DrillMaterialLabel } from "@/components/drills/drill-material-label";
import { createSystemTranslator } from "@/lib/i18n/system-text";
import type { Locale } from "@/lib/i18n";

export function MaterialSummaryList({ materials, emptyText = "No materials yet.", locale }: { materials: MaterialSummaryItem[]; emptyText?: string; locale?: Locale }) {
  const ui = createSystemTranslator(locale ?? "en");
  if (!materials.length) return <p>{locale ? ui(emptyText) : emptyText}</p>;
  const groups = materialDisplayGroups(materials);

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.category}>
          <p className="break-words text-xs font-bold uppercase text-slate-500">{locale ? ui(materialCategoryLabel(group.category)) : materialCategoryLabel(group.category)}</p>
          <ul className="mt-1 space-y-1">
            {group.items.map((item) => {
              const material = locale ? jsonToMaterials([{ ...item }])[0] : null;
              return <li key={item.key} className="min-w-0 break-words">{locale && material ? <DrillMaterialLabel material={material} locale={locale} /> : materialSummaryLabel(item)}</li>;
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
