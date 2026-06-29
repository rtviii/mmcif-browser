// Instance-level reference joins for the dig-deeper panel. Given a specific row in a parsed
// mmCIF block, resolve (a) the rows it REFERENCES via dictionary foreign keys (forward), and
// (b) the rows that REFERENCE it (reverse) — both the formal FK children and, for an atom_site
// residue/atom, the secondary-structure / bond / site annotations that point at residues through
// beg_/end_/ptnr1_ columns rather than a declared parent. Pure: no React, no store.

import type { Dictionary } from "@/lib/types";
import { getCategory, type MolCifCategory, type MolCifFile } from "./types";

// Reverse-scanning a category is linear in its row count. Grouping by category means we only count
// (no per-row objects), so the cap can be generous; skip only absurdly large categories so a click
// never hangs. Reported back so the UI can say it was skipped.
const REVERSE_COUNT_CAP = 200000;

export interface JoinHit {
  category: string;
  rowIndex: number; // -1 when the referenced category isn't present in the file (schema-only)
  via: string; // the linking attribute on the SOURCE row (the FK column the user pinned)
  targetField: string; // the field in `category` that holds the linking value (highlight this in a preview)
  value: string; // the key value that links them
  summary: string; // short human label for the joined row
}

// Reverse references grouped by referencing category: "atom_site · 147 rows via label_asym_id".
// Carries a sample row (first match) for the hover preview + click-to-jump.
export interface ReverseGroup {
  category: string;
  via: string; // the linking attribute on the referencing rows
  count: number;
  sampleRowIndex: number; // first matching row in that category
  sampleSummary: string;
}

export interface JoinResult {
  forward: JoinHit[];
  reverse: ReverseGroup[];
  skipped: string[]; // categories not scanned because they exceed the count cap
}

export interface InstanceRef {
  blockIndex: number;
  category: string;
  rowIndex: number;
}

const isPlaceholder = (v: string) => v === "" || v === "." || v === "?";

function parseItemName(name: string): { cat: string; field: string } {
  const n = name.startsWith("_") ? name.slice(1) : name;
  const dot = n.indexOf(".");
  return dot < 0 ? { cat: n, field: "" } : { cat: n.slice(0, dot), field: n.slice(dot + 1) };
}

const str = (cat: MolCifCategory, field: string, row: number): string => {
  const f = cat.getField(field);
  return f ? f.str(row) : "";
};

const intOrNull = (s: string): number | null => {
  if (isPlaceholder(s)) return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
};

// A short, readable label for row `i` of `cat`: prefer a descriptive field, else the linking value.
function summarizeRow(cat: MolCifCategory, catName: string, i: number, fallback: string): string {
  if (i < 0) return `${fallback} (not in file)`;
  for (const f of ["pdbx_description", "name", "details", "type", "conf_type_id", "pdbx_PDB_helix_id"]) {
    const v = str(cat, f, i);
    if (v && !isPlaceholder(v)) return v;
  }
  return fallback;
}

// Find the first row in `cat` whose `field` equals `value` (linear; categories are small here).
function findRow(cat: MolCifCategory, field: string, value: string): number {
  const f = cat.getField(field);
  if (!f) return -1;
  for (let i = 0; i < cat.rowCount; i++) if (f.str(i) === value) return i;
  return -1;
}

// Residue-reference annotations that point at residues through positional columns (not declared
// parents). `range` matches asym + beg<=seq<=end (helices, strands); `exact` matches asym + seq.
interface ResidueMatcher {
  category: string;
  ranges?: { asym: string; begSeq: string; endSeq: string }[];
  exacts?: { asym: string; seq: string }[];
}
const RESIDUE_REFS: ResidueMatcher[] = [
  {
    category: "struct_conf", // helices / turns
    ranges: [
      { asym: "beg_label_asym_id", begSeq: "beg_label_seq_id", endSeq: "end_label_seq_id" },
      { asym: "beg_auth_asym_id", begSeq: "beg_auth_seq_id", endSeq: "end_auth_seq_id" },
    ],
  },
  {
    category: "struct_sheet_range", // beta strands
    ranges: [
      { asym: "beg_label_asym_id", begSeq: "beg_label_seq_id", endSeq: "end_label_seq_id" },
      { asym: "beg_auth_asym_id", begSeq: "beg_auth_seq_id", endSeq: "end_auth_seq_id" },
    ],
  },
  {
    category: "struct_conn", // bonds / contacts (two partners)
    exacts: [
      { asym: "ptnr1_label_asym_id", seq: "ptnr1_label_seq_id" },
      { asym: "ptnr2_label_asym_id", seq: "ptnr2_label_seq_id" },
      { asym: "ptnr1_auth_asym_id", seq: "ptnr1_auth_seq_id" },
      { asym: "ptnr2_auth_asym_id", seq: "ptnr2_auth_seq_id" },
    ],
  },
  {
    category: "struct_site_gen", // binding-site residues
    exacts: [
      { asym: "label_asym_id", seq: "label_seq_id" },
      { asym: "auth_asym_id", seq: "auth_seq_id" },
    ],
  },
  {
    category: "pdbx_struct_mod_residue", // modified residues
    exacts: [
      { asym: "label_asym_id", seq: "label_seq_id" },
      { asym: "auth_asym_id", seq: "auth_seq_id" },
    ],
  },
];

interface Residue {
  labelAsym: string;
  labelSeq: number | null;
  authAsym: string;
  authSeq: number | null;
}

// Reverse refs to a residue via positional columns. Calls `add` once per matching annotation row.
function residueReverseRefs(
  file: MolCifFile,
  blockIndex: number,
  res: Residue,
  add: (category: string, via: string, rowIndex: number, makeSummary: () => string) => void,
  skipped: string[],
): void {
  for (const m of RESIDUE_REFS) {
    const cat = getCategory(file, blockIndex, m.category);
    if (!cat) continue;
    if (cat.rowCount > REVERSE_COUNT_CAP) {
      skipped.push(m.category);
      continue;
    }
    for (let i = 0; i < cat.rowCount; i++) {
      let hit = false;
      let via = "";
      for (const r of m.ranges ?? []) {
        const asym = str(cat, r.asym, i);
        const isLabel = r.asym.includes("label");
        const myAsym = isLabel ? res.labelAsym : res.authAsym;
        const mySeq = isLabel ? res.labelSeq : res.authSeq;
        if (mySeq === null || asym !== myAsym) continue;
        const beg = intOrNull(str(cat, r.begSeq, i));
        const end = intOrNull(str(cat, r.endSeq, i));
        if (beg === null || end === null) continue;
        if (mySeq >= Math.min(beg, end) && mySeq <= Math.max(beg, end)) {
          hit = true;
          via = r.asym;
          break;
        }
      }
      if (!hit)
        for (const x of m.exacts ?? []) {
          const asym = str(cat, x.asym, i);
          const isLabel = x.asym.includes("label");
          const myAsym = isLabel ? res.labelAsym : res.authAsym;
          const mySeq = isLabel ? res.labelSeq : res.authSeq;
          if (mySeq === null || asym !== myAsym) continue;
          if (intOrNull(str(cat, x.seq, i)) === mySeq) {
            hit = true;
            via = x.asym;
            break;
          }
        }
      if (hit) add(m.category, via, i, () => summarizeRow(cat, m.category, i, m.category));
    }
  }
}

export function computeInstanceJoins(
  file: MolCifFile,
  dict: Dictionary,
  itemChildren: Map<string, string[]>,
  instance: InstanceRef,
): JoinResult {
  const { blockIndex, category, rowIndex } = instance;
  const forward: JoinHit[] = [];
  const skipped: string[] = [];
  const cat = getCategory(file, blockIndex, category);
  if (!cat) return { forward, reverse: [], skipped };

  // --- forward: each attribute with a dictionary parent -> the matching parent row ---
  const seenFwd = new Set<string>();
  for (const attr of cat.fieldNames) {
    const item = dict.items[`_${category}.${attr}`];
    if (!item?.parents?.length) continue;
    const value = str(cat, attr, rowIndex);
    if (isPlaceholder(value)) continue;
    for (const p of item.parents) {
      const { cat: pcat, field: pfield } = parseItemName(p);
      if (pcat === category) continue;
      const pc = getCategory(file, blockIndex, pcat);
      const row = pc ? findRow(pc, pfield, value) : -1;
      const key = `${pcat}#${row}`;
      if (seenFwd.has(key)) continue;
      seenFwd.add(key);
      forward.push({
        category: pcat,
        rowIndex: row,
        via: attr,
        targetField: pfield,
        value,
        summary: pc ? summarizeRow(pc, pcat, row, `${pfield}=${value}`) : `${pfield}=${value}`,
      });
    }
  }

  // --- reverse: rows that reference this one, grouped by referencing category with a count and a
  // sample row (first match) for the hover preview / click-to-jump. `seenRev` dedups a row reached
  // through more than one of this row's identity attributes. ---
  const seenRev = new Set<string>();
  const revGroups = new Map<string, ReverseGroup>();
  const addRev = (category: string, via: string, row: number, makeSummary: () => string) => {
    const key = `${category}#${row}`;
    if (seenRev.has(key)) return;
    seenRev.add(key);
    const g = revGroups.get(category);
    if (g) {
      g.count++;
      return;
    }
    revGroups.set(category, { category, via, count: 1, sampleRowIndex: row, sampleSummary: makeSummary() });
  };

  // formal FK children that carry one of this row's identity values
  const keyAttrs = (dict.categories[category]?.keys ?? []).map((k) => parseItemName(k).field);
  const identityAttrs = [...new Set([...keyAttrs, "id"])].filter((a) => cat.fieldNames.includes(a));
  for (const attr of identityAttrs) {
    const value = str(cat, attr, rowIndex);
    if (isPlaceholder(value)) continue;
    for (const child of itemChildren.get(`_${category}.${attr}`) ?? []) {
      const { cat: ccat, field: cfield } = parseItemName(child);
      if (ccat === category) continue;
      const cc = getCategory(file, blockIndex, ccat);
      if (!cc) continue;
      if (cc.rowCount > REVERSE_COUNT_CAP) {
        if (!skipped.includes(ccat)) skipped.push(ccat);
        continue;
      }
      const cf = cc.getField(cfield);
      if (!cf) continue;
      for (let i = 0; i < cc.rowCount; i++) {
        if (cf.str(i) === value) addRev(ccat, cfield, i, () => summarizeRow(cc, ccat, i, `${cfield}=${value}`));
      }
    }
  }

  // residue-positional annotations (helix/strand/bond/site), for atom_site rows
  if (category === "atom_site") {
    const res: Residue = {
      labelAsym: str(cat, "label_asym_id", rowIndex),
      labelSeq: intOrNull(str(cat, "label_seq_id", rowIndex)),
      authAsym: str(cat, "auth_asym_id", rowIndex),
      authSeq: intOrNull(str(cat, "auth_seq_id", rowIndex)),
    };
    residueReverseRefs(file, blockIndex, res, addRev, skipped);
  }

  return { forward, reverse: [...revGroups.values()], skipped };
}
