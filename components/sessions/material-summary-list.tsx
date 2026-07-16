import { materialCategoryLabel, materialDisplayGroups } from "@/lib/drills/materials";
import { materialSummaryLabel, type MaterialSummaryItem } from "@/lib/sessions/utils";

export function MaterialSummaryList({ materials, emptyText = "No materials yet." }: { materials: MaterialSummaryItem[]; emptyText?: string }) {
  if (!materials.length) return <p>{emptyText}</p>;
  const groups = materialDisplayGroups(materials);

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.category}>
          <p className="text-xs font-bold uppercase text-slate-500">{materialCategoryLabel(group.category)}</p>
          <ul className="mt-1 space-y-1">
            {group.items.map((item) => (
              <li key={item.key}>{materialSummaryLabel(item)}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
