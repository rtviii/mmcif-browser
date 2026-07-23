// The network -> source-line index.
//
// The proposal figures already resolve a source line to a 3D target (click a row, focus the atoms).
// This is the missing inverse: given a network name, which lines of the file are ABOUT it? That is
// what lets a chip click highlight the source and snap the panel to it, editor-style.
//
// Two tiers, because they want different treatment:
//   meta  -- the rows that DEFINE the network (_pdbx_alt_groups, _pdbx_heterogeneity_hierarchy,
//            _pdbx_state_coexistence, _pdbx_occupancy_relationship). A handful of rows; these
//            get the full highlight, and the anchor is where the panel scrolls to.
//   atoms -- the _atom_site rows the network's selectors match. Often the bulk of the file; these
//            get a rail mark only, so a selection is findable without drowning the panel.

import type { CifDocument } from "@/lib/cif-source/segment";
import { buildRowToLines } from "@/lib/cif-source/table";
import type { MolCifFile } from "@/lib/cif-source/types";
import { matchesSelector, type AtomKey, type HetModel } from "./het";

// Loop categories whose row identity is a network name, and the field(s) carrying it.
// _pdbx_state_coexistence names a network on BOTH sides of the NOT, so both count; likewise an
// occupancy relationship names one in the head row's target and the rest in its member rows.
export const HET_ID_FIELDS: Record<string, string[]> = {
  pdbx_alt_groups: ["alt_group_id"],
  pdbx_heterogeneity_hierarchy: ["alt_group_id"],
  pdbx_state_coexistence: ["heterogeneity_id", "heterogeneity_ids"],
  pdbx_occupancy_relationship: ["target"],
  pdbx_occupancy_relationship_member: ["state_id"],
};

export interface NetworkLines {
  meta: number[];
  atoms: number[];
  /** Where a click scrolls to: the network's first _pdbx_alt_groups row (its definition). */
  anchor: number;
}

const norm = (s: string | undefined | null) => {
  const v = (s ?? "").trim();
  return v === "" || v === "." || v === "?" ? "" : v;
};

export function buildNetworkLineIndex(
  doc: CifDocument,
  file: MolCifFile,
  model: HetModel,
): Map<string, NetworkLines> {
  const acc = new Map<string, { meta: Set<number>; atoms: Set<number>; anchor: number }>();
  const ensure = (id: string) => {
    let e = acc.get(id);
    if (!e) {
      e = { meta: new Set<number>(), atoms: new Set<number>(), anchor: Infinity };
      acc.set(id, e);
    }
    return e;
  };

  for (const span of doc.spans) {
    if (span.kind !== "loop" || span.dataStart < 0) continue;
    const cat = file.blocks[span.block]?.categories[span.category];
    if (!cat) continue;

    const idFields = HET_ID_FIELDS[span.category];
    if (idFields) {
      const rowLines = buildRowToLines(doc, span, cat.rowCount);
      for (let r = 0; r < cat.rowCount; r++) {
        for (const field of idFields) {
          const id = norm(cat.getField(field)?.str(r));
          // "base" is the implicit root and has no rows of its own; unknown ids are strays.
          if (!id || !model.byId.has(id)) continue;
          const e = ensure(id);
          for (const ln of rowLines[r] ?? []) e.meta.add(ln);
          if (span.category === "pdbx_alt_groups" && rowLines[r]?.length) {
            e.anchor = Math.min(e.anchor, rowLines[r][0]);
          }
        }
      }
      continue;
    }

    // atom_site: one pass over the rows, each tested against every network's selectors. The files
    // here are small; a per-network rescan would be needless O(networks x rows).
    if (span.category === "atom_site") {
      const rowLines = buildRowToLines(doc, span, cat.rowCount);
      const fChain = cat.getField("auth_asym_id");
      const fSeq = cat.getField("auth_seq_id");
      const fAlt = cat.getField("label_alt_id");
      const fAtom = cat.getField("label_atom_id");
      for (let r = 0; r < cat.rowCount; r++) {
        const altId = norm(fAlt?.str(r));
        if (!altId) continue; // an atom with no altloc belongs to base, not to any network
        const seq = fSeq?.int(r);
        if (seq == null || Number.isNaN(seq)) continue;
        const key: AtomKey = {
          chain: norm(fChain?.str(r)),
          seq,
          altId,
          atomId: norm(fAtom?.str(r)),
        };
        for (const net of model.networks) {
          if (!net.members.some((m) => matchesSelector(m, key))) continue;
          const e = ensure(net.id);
          for (const ln of rowLines[r] ?? []) e.atoms.add(ln);
        }
      }
    }
  }

  const out = new Map<string, NetworkLines>();
  for (const [id, e] of acc) {
    const meta = [...e.meta].sort((a, b) => a - b);
    const atoms = [...e.atoms].sort((a, b) => a - b);
    const anchor = Number.isFinite(e.anchor) ? e.anchor : (meta[0] ?? atoms[0] ?? -1);
    out.set(id, { meta, atoms, anchor });
  }
  return out;
}
