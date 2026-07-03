// Instance-level reference joins for the dig-deeper panel. Given a specific row in a parsed
// mmCIF block, resolve (a) the rows it REFERENCES via dictionary foreign keys (forward), and
// (b) the rows that REFERENCE it (reverse) — both the formal FK children and, for an atom_site
// residue/atom, the secondary-structure / bond / site annotations that point at residues through
// beg_/end_/ptnr1_ columns rather than a declared parent. Pure: no React, no store, no Mol*.
//
// The forward resolver is COMPOSITE: a record like _pdbx_alt_groups (which points into atom_site via
// several columns at once — chain + a residue range + altloc + atom name) is resolved by ANDing those
// columns together to the exact atom(s) it selects, not by looking each column up independently. When
// the composite target is atom_site the result is a small chain -> residue -> atom hierarchy the panel
// renders as a breadcrumb.

import type { Dictionary } from "@/lib/types";
import { getCategory, type MolCifCategory, type MolCifFile } from "./types";

// Reverse-scanning a category is linear in its row count. Grouping by category means we only count
// (no per-row objects), so the cap can be generous; skip only absurdly large categories so a click
// never hangs. Reported back so the UI can say it was skipped.
const REVERSE_COUNT_CAP = 200000;
// Composite matches into atom_site can span thousands of atoms (a whole residue range). We only need
// a representative row + a count, so stop collecting rows past this (the count is still exact-ish; the
// UI shows "N atoms" and the sample is the first match).
const STRUCTURAL_MATCH_CAP = 5000;

export interface JoinHit {
  category: string;
  rowIndex: number; // -1 when the referenced category isn't present in the file (schema-only)
  via: string; // the linking attribute(s) on the SOURCE row (the FK column(s) the user pinned)
  targetField: string; // the field in `category` that holds the linking value (highlight this in a preview)
  count?: number; // when a composite/positional match resolves to more than one row
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

// A single navigable level of a resolved structural reference (chain, residue, or atom). `sampleRowIndex`
// is a representative atom_site row (for the source jump + hover preview); the panel builds the actual
// Mol* query from the identity fields so it can highlight/focus the right granularity in 3D.
export type StructuralLevel = "chain" | "residue" | "atom";
export interface StructuralRefLevel {
  level: StructuralLevel;
  label: string; // short breadcrumb text: "chain A" / "LYS 78" / "CB (alt A)"
  chain: string;
  seqStart?: number;
  seqEnd?: number; // === seqStart for a single residue; a range for start..end selections
  atom?: string; // atom level only
  alt?: string; // altloc, when the reference pins a specific conformer
  comp?: string; // residue name (for the fuller 3D pin label the inspector builds)
  sampleRowIndex: number;
}

// A picked breadcrumb level, handed to the inspector to build the Mol* query + pin it in 3D + scroll.
export interface StructuralPick extends StructuralRefLevel {
  blockIndex: number;
  rowIndex: number;
}

// A composite reference INTO atom_site, expressed as a coarse->fine hierarchy (chain [, residue] [, atom]).
export interface StructuralRef {
  targetCategory: string; // "atom_site"
  levels: StructuralRefLevel[];
  count: number; // number of atom_site rows the whole selector matches
  via: string; // the source columns used, joined for display
}

export interface JoinResult {
  forward: JoinHit[];
  forwardStructural: StructuralRef[]; // composite references into atom_site, rendered as breadcrumbs
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
  for (const f of ["pdbx_description", "name", "details", "type", "conf_type_id", "pdbx_PDB_helix_id", "alt_group_id"]) {
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

// One equality constraint on a target category: target `field` must equal `value` (from source column `via`).
interface Eq {
  field: string;
  value: string;
  via: string;
}

// The declared foreign-key equality constraints of a source row, grouped by the category they point at.
// Placeholders and self-references are dropped.
function declaredEqsByTarget(category: string, cat: MolCifCategory, row: number, dict: Dictionary): Map<string, Eq[]> {
  const m = new Map<string, Eq[]>();
  for (const attr of cat.fieldNames) {
    const item = dict.items[`_${category}.${attr}`];
    if (!item?.parents?.length) continue;
    const value = str(cat, attr, row);
    if (isPlaceholder(value)) continue;
    for (const p of item.parents) {
      const { cat: pcat, field: pfield } = parseItemName(p);
      if (pcat === category) continue;
      (m.get(pcat) ?? m.set(pcat, []).get(pcat)!).push({ field: pfield, value, via: attr });
    }
  }
  return m;
}

const eqValue = (eqs: Eq[], field: string): string | undefined => eqs.find((e) => e.field === field)?.value;
const hasRepeatedField = (eqs: Eq[]): boolean => new Set(eqs.map((e) => e.field)).size !== eqs.length;

// A residue-range on an atom_site seq column, synthesised from a start/end column pair (which carries no
// dictionary parent). Only meaningful when the row also pins a chain, so the range is scoped.
function atomSiteSeqRange(cat: MolCifCategory, row: number, variant: "auth" | "label"): { lo: number; hi: number; via: string } | null {
  const startCol = `${variant}_seq_id_start`;
  const endCol = `${variant}_seq_id_end`;
  if (!cat.fieldNames.includes(startCol) || !cat.fieldNames.includes(endCol)) return null;
  const lo = intOrNull(str(cat, startCol, row));
  const hi = intOrNull(str(cat, endCol, row));
  if (lo === null || hi === null) return null;
  return { lo: Math.min(lo, hi), hi: Math.max(lo, hi), via: `${variant}_seq_id_start..end` };
}

// Resolve a composite reference INTO atom_site to the atoms it selects, as a chain/residue/atom
// hierarchy. `eqs` are the declared-parent equalities (chain, altloc, atom, …); `range` is the optional
// residue range. Returns null when nothing matches (a broken/absent reference isn't shown).
function resolveAtomSiteStructural(
  file: MolCifFile,
  blockIndex: number,
  eqs: Eq[],
  variant: "auth" | "label",
  range: { lo: number; hi: number; via: string } | null,
  skipped: string[],
): StructuralRef | null {
  const atom = getCategory(file, blockIndex, "atom_site");
  if (!atom) return null;
  if (atom.rowCount > REVERSE_COUNT_CAP) {
    if (!skipped.includes("atom_site")) skipped.push("atom_site");
    return null;
  }
  const seqField = variant === "label" ? "label_seq_id" : "auth_seq_id";
  const matched: number[] = [];
  for (let i = 0; i < atom.rowCount; i++) {
    if (!eqs.every((e) => str(atom, e.field, i) === e.value)) continue;
    if (range) {
      const s = intOrNull(str(atom, seqField, i));
      if (s === null || s < range.lo || s > range.hi) continue;
    }
    matched.push(i);
    if (matched.length > STRUCTURAL_MATCH_CAP) break;
  }
  if (matched.length === 0) return null;

  const rep = matched[0];
  const asymField = variant === "label" ? "label_asym_id" : "auth_asym_id";
  const chain = eqValue(eqs, asymField) ?? str(atom, asymField, rep);
  const seqStart = range ? range.lo : intOrNull(str(atom, seqField, rep));
  const seqEnd = range ? range.hi : seqStart;
  const atomName = eqValue(eqs, "label_atom_id"); // placeholders already dropped, so this is a real atom name
  const alt = eqValue(eqs, "label_alt_id");
  const comp = str(atom, "label_comp_id", rep) || undefined;

  // Short, non-redundant breadcrumb labels — the nesting (chain › residue › atom) already carries the
  // context, so deeper levels don't repeat the chain.
  const levels: StructuralRefLevel[] = [];
  if (chain) levels.push({ level: "chain", label: `chain ${chain}`, chain, sampleRowIndex: rep });
  if (seqStart !== null && seqStart !== undefined) {
    const isRange = seqEnd != null && seqEnd !== seqStart;
    levels.push({
      level: "residue",
      label: isRange ? `res ${seqStart}–${seqEnd}` : `${comp ? `${comp} ` : ""}${seqStart}`,
      chain,
      seqStart,
      seqEnd: seqEnd ?? seqStart,
      comp,
      sampleRowIndex: rep,
    });
  }
  if (atomName && seqStart !== null && seqStart !== undefined) {
    levels.push({
      level: "atom",
      label: `${atomName}${alt ? ` (alt ${alt})` : ""}`,
      chain,
      seqStart,
      seqEnd: seqStart,
      atom: atomName,
      alt: alt || undefined,
      comp,
      sampleRowIndex: rep,
    });
  }
  if (levels.length === 0) return null;

  const via = [...eqs.map((e) => e.via), ...(range ? [range.via] : [])].join(" · ");
  return { targetCategory: "atom_site", levels, count: matched.length, via };
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

// One declared column of a candidate category that points into atom_site (child attr -> atom_site field).
interface AtomSiteLink {
  attr: string;
  parentField: string;
}
function atomSiteChildMap(ccat: string, cc: MolCifCategory, dict: Dictionary): AtomSiteLink[] {
  const out: AtomSiteLink[] = [];
  for (const attr of cc.fieldNames) {
    const item = dict.items[`_${ccat}.${attr}`];
    for (const p of item?.parents ?? []) {
      const { cat: pcat, field } = parseItemName(p);
      if (pcat === "atom_site") out.push({ attr, parentField: field });
    }
  }
  return out;
}

// Reverse counterpart of the composite forward resolver: rows of other categories whose FULL structural
// selector (chain + residue range + altloc + atom) contains the pinned atom_site row. Reuses the
// declared atom_site parents to find candidate categories, then matches each candidate row against the
// pinned atom's field values (a specific, composite test — not a broad "same chain" match).
function atomSiteReverseComposite(
  file: MolCifFile,
  blockIndex: number,
  atomCat: MolCifCategory,
  atomRow: number,
  dict: Dictionary,
  itemChildren: Map<string, string[]>,
  add: (category: string, via: string, rowIndex: number, makeSummary: () => string) => void,
  skipped: string[],
): void {
  // candidate categories = anything with a declared parent into one of this row's atom_site columns
  const candidates = new Set<string>();
  for (const attr of atomCat.fieldNames) {
    for (const child of itemChildren.get(`_atom_site.${attr}`) ?? []) {
      const { cat: ccat } = parseItemName(child);
      if (ccat !== "atom_site") candidates.add(ccat);
    }
  }
  for (const ccat of candidates) {
    const cc = getCategory(file, blockIndex, ccat);
    if (!cc) continue;
    if (cc.rowCount > REVERSE_COUNT_CAP) {
      if (!skipped.includes(ccat)) skipped.push(ccat);
      continue;
    }
    const links = atomSiteChildMap(ccat, cc, dict);
    if (links.length === 0) continue;
    // partner-style repeats (two columns -> same atom_site field) are positional, not composite keys —
    // leave those to RESIDUE_REFS.
    if (new Set(links.map((l) => l.parentField)).size !== links.length) continue;

    // the pinned atom's values for the fields this candidate references
    const pinnedVals = links.map((l) => ({ attr: l.attr, value: str(atomCat, l.parentField, atomRow) }));
    // optional residue range on the candidate rows
    const variant = links.some((l) => l.parentField === "auth_asym_id")
      ? "auth"
      : links.some((l) => l.parentField === "label_asym_id")
        ? "label"
        : null;
    const hasRange =
      variant != null && cc.fieldNames.includes(`${variant}_seq_id_start`) && cc.fieldNames.includes(`${variant}_seq_id_end`);
    const pinnedSeq = variant ? intOrNull(str(atomCat, variant === "label" ? "label_seq_id" : "auth_seq_id", atomRow)) : null;

    for (let i = 0; i < cc.rowCount; i++) {
      if (!pinnedVals.every((p) => !isPlaceholder(p.value) && str(cc, p.attr, i) === p.value)) continue;
      if (hasRange) {
        const lo = intOrNull(str(cc, `${variant}_seq_id_start`, i));
        const hi = intOrNull(str(cc, `${variant}_seq_id_end`, i));
        if (lo === null || hi === null || pinnedSeq === null || pinnedSeq < Math.min(lo, hi) || pinnedSeq > Math.max(lo, hi))
          continue;
      }
      add(ccat, links[0].attr, i, () => summarizeRow(cc, ccat, i, ccat));
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
  const forwardStructural: StructuralRef[] = [];
  const skipped: string[] = [];
  const cat = getCategory(file, blockIndex, category);
  if (!cat) return { forward, forwardStructural, reverse: [], skipped };

  // --- forward: declared foreign keys, grouped by target category and resolved compositely ---
  const seenFwd = new Set<string>();
  const pushHit = (h: JoinHit) => {
    const key = `${h.category}#${h.rowIndex}`;
    if (seenFwd.has(key)) return;
    seenFwd.add(key);
    forward.push(h);
  };

  for (const [tcat, eqs] of declaredEqsByTarget(category, cat, rowIndex, dict)) {
    // Two source columns mapping to the SAME target field are separate references (partner-style, e.g.
    // struct_conn ptnr1_/ptnr2_), not a compound key — resolve each independently (first-match).
    if (hasRepeatedField(eqs)) {
      for (const e of eqs) {
        const pc = getCategory(file, blockIndex, tcat);
        const row = pc ? findRow(pc, e.field, e.value) : -1;
        pushHit({
          category: tcat,
          rowIndex: row,
          via: e.via,
          targetField: e.field,
          value: e.value,
          summary: pc ? summarizeRow(pc, tcat, row, `${e.field}=${e.value}`) : `${e.field}=${e.value}`,
        });
      }
      continue;
    }

    if (tcat === "atom_site") {
      const variant: "auth" | "label" = eqs.some((e) => e.field === "label_asym_id") ? "label" : "auth";
      const range = atomSiteSeqRange(cat, rowIndex, variant);
      const sref = resolveAtomSiteStructural(file, blockIndex, eqs, variant, range, skipped);
      if (sref) forwardStructural.push(sref);
      continue;
    }

    // composite (distinct target fields) into a non-atom_site category: AND the equalities.
    const pc = getCategory(file, blockIndex, tcat);
    const via = eqs.map((e) => e.via).join(" · ");
    if (!pc) {
      pushHit({ category: tcat, rowIndex: -1, via, targetField: eqs[0].field, value: eqs[0].value, summary: `${eqs[0].field}=${eqs[0].value}` });
      continue;
    }
    const matched: number[] = [];
    for (let i = 0; i < pc.rowCount; i++) {
      if (eqs.every((e) => str(pc, e.field, i) === e.value)) matched.push(i);
    }
    const row = matched[0] ?? -1;
    pushHit({
      category: tcat,
      rowIndex: row,
      via,
      targetField: eqs.length === 1 ? eqs[0].field : "",
      count: matched.length > 1 ? matched.length : undefined,
      value: eqs[0].value,
      summary: pc ? summarizeRow(pc, tcat, row, via) : via,
    });
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

  // residue-positional annotations (helix/strand/bond/site) + composite structural refs, for atom_site rows
  if (category === "atom_site") {
    const res: Residue = {
      labelAsym: str(cat, "label_asym_id", rowIndex),
      labelSeq: intOrNull(str(cat, "label_seq_id", rowIndex)),
      authAsym: str(cat, "auth_asym_id", rowIndex),
      authSeq: intOrNull(str(cat, "auth_seq_id", rowIndex)),
    };
    residueReverseRefs(file, blockIndex, res, addRev, skipped);
    atomSiteReverseComposite(file, blockIndex, cat, rowIndex, dict, itemChildren, addRev, skipped);
  }

  return { forward, forwardStructural, reverse: [...revGroups.values()], skipped };
}
