"use client";
import { useMemo } from "react";
import { useStore } from "@/lib/store";

// Dictionary hover-definition panel, shared by the inspector's source view. Looks an item
// up by `_${cat}.${field}` (or a category by name) against the loaded PDBx/mmCIF dictionary.
// Extracted verbatim from the v0 CifInspector tree so the join is reused unchanged.

export type HoverTarget =
  | { kind: "category"; cat: string }
  | { kind: "item"; cat: string; field: string }
  | null;

export function Definition({ hover }: { hover: HoverTarget }) {
  const dict = useStore((s) => s.dict);
  const content = useMemo(() => {
    if (!dict || !hover) return null;
    if (hover.kind === "category") {
      const c = dict.categories[hover.cat];
      if (!c) return { title: hover.cat, body: null, note: "Not defined in the PDBx/mmCIF dictionary." };
      return { title: c.name, body: c.description, type: null, enums: null, group: c.groups.join(", ") };
    }
    const it = dict.items[`_${hover.cat}.${hover.field}`];
    if (!it) return { title: `_${hover.cat}.${hover.field}`, body: null, note: "Not defined in the PDBx/mmCIF dictionary." };
    const t = it.type ? dict.types[it.type] : null;
    return {
      title: it.name,
      body: it.description,
      type: t ? `${t.code} (${t.primitive})` : it.type,
      enums: it.enums ?? null,
      mandatory: it.mandatory,
      units: it.units,
    };
  }, [dict, hover]);

  return (
    <div className="h-44 shrink-0 overflow-y-auto border-t border-neutral-800 bg-neutral-900/50 p-3">
      {!content ? (
        <div className="text-[11px] text-neutral-600">Hover an item (e.g. _atom_site.Cartn_x) for its definition.</div>
      ) : (
        <>
          <div className="font-mono text-[12px] text-neutral-100">{content.title}</div>
          <div className="mt-1 flex flex-wrap gap-2 font-mono text-[10px] text-neutral-500">
            {"type" in content && content.type && <span>type: {content.type}</span>}
            {"mandatory" in content && content.mandatory && <span>mandatory: {content.mandatory}</span>}
            {"units" in content && content.units && <span>units: {content.units}</span>}
            {"group" in content && content.group && <span>groups: {content.group}</span>}
          </div>
          {"note" in content && content.note && (
            <div className="mt-1 text-[11px] text-amber-300/90">{content.note}</div>
          )}
          {content.body && (
            <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-neutral-300">
              {content.body}
            </p>
          )}
          {"enums" in content && content.enums && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {content.enums.map(([v]) => (
                <span key={v} className="rounded bg-sky-500/10 px-1 font-mono text-[10px] text-sky-300">
                  {v}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
