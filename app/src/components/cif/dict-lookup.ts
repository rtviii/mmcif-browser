// Dictionary lookup for the inspector's hover definitions. Resolves a hover target
// (a category, or an item keyed by `_${cat}.${field}`) against the loaded PDBx/mmCIF
// dictionary. Shared by the hover tooltip; extracted from the v0 definition panel so the
// join is reused unchanged.

import type { Dictionary } from "@/lib/types";

export type HoverTarget =
  | { kind: "category"; cat: string }
  | { kind: "item"; cat: string; field: string }
  | null;

export interface DefContent {
  title: string;
  body: string | null;
  note?: string;
  type?: string | null;
  enums?: [string, string | null][] | null;
  mandatory?: string | null;
  units?: string | null;
  group?: string;
}

export function lookupDefinition(dict: Dictionary | null, hover: HoverTarget): DefContent | null {
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
}
