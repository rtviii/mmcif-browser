// Build the fold-region tree from the segmented document + Mol*'s parsed fields.
//
// Only LOOP spans fold (key-value categories are short and render verbatim). A loop whose
// category has a bespoke handler AND is one-physical-line-per-row gets a semantic tree
// (atom_site: chain > residue; a few others: a single grouping level). Everything else
// gets one generic node over its data body. Fold node line ranges are the source lines
// hidden when the node collapses; row indices are kept for the future 3D linkage.

import type { CifDocument, LoopSpan } from "./segment";
import { type MolCifCategory, type MolCifFile } from "./types";

export type HierarchyMode = "auth" | "label";
export type FoldLevel = "loop" | "chain" | "residue" | "group";

export interface FoldNode {
  id: string;
  label: string;
  category: string;
  level: FoldLevel;
  startLine: number; // first source line this node governs (inclusive)
  endLine: number; // last source line (inclusive)
  rowStart: number; // first parsed row index (within the category)
  rowEnd: number; // last parsed row index (inclusive)
  children?: FoldNode[];
  lazy?: boolean; // children not computed yet (atom_site chains)
  block?: number; // internal: which data block (for lazy residue computation)
  key?: string; // internal: the grouping value (e.g. chain id)
}

export interface FoldCtx {
  doc: CifDocument;
  file: MolCifFile;
  mode: HierarchyMode;
}

export interface FoldTree {
  mode: HierarchyMode;
  roots: FoldNode[]; // top-level nodes, in source order (sorted by startLine)
  byId: Map<string, FoldNode>;
  ctx: FoldCtx;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/** Resolve a grouping field name to the auth_/label_ variant for the active mode. */
function pick(cat: MolCifCategory, mode: HierarchyMode, auth: string, label: string) {
  const primary = mode === "auth" ? auth : label;
  return cat.getField(primary) ?? cat.getField(label) ?? cat.getField(auth);
}

/** One generic node covering a loop's whole data body. */
function genericNode(span: LoopSpan, rowCount: number): FoldNode {
  return {
    id: `loop:${span.block}:${span.category}`,
    label: `${span.category} · ${fmt(rowCount)} rows`,
    category: span.category,
    level: "loop",
    startLine: span.dataStart,
    endLine: span.dataEnd,
    rowStart: 0,
    rowEnd: Math.max(0, rowCount - 1),
  };
}

/** atom_site: contiguous runs of the chain id -> chain nodes (residues filled lazily). */
function atomSiteNodes(span: LoopSpan, cat: MolCifCategory, mode: HierarchyMode): FoldNode[] {
  const asymF = pick(cat, mode, "auth_asym_id", "label_asym_id");
  const n = span.dataLineCount;
  if (!asymF || n === 0) return [genericNode(span, cat.rowCount)];
  const asym = asymF.toStringArray({ start: 0, end: n });
  const nodes: FoldNode[] = [];
  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && asym[j] === asym[i]) j++;
    nodes.push({
      id: `as:${span.block}:ch:${asym[i]}:${i}`,
      label: `chain ${asym[i]} · ${fmt(j - i)} atoms`,
      category: "atom_site",
      level: "chain",
      startLine: span.dataStart + i,
      endLine: span.dataStart + j - 1,
      rowStart: i,
      rowEnd: j - 1,
      lazy: true,
      block: span.block,
      key: asym[i],
    });
    i = j;
  }
  return nodes;
}

/** Fill a chain node's residue children on first expand (contiguous seq+ins runs). */
export function ensureChildren(tree: FoldTree, node: FoldNode): void {
  if (!node.lazy) return;
  node.lazy = false;
  const { file, mode } = tree.ctx;
  const cat = file.blocks[node.block ?? 0]?.categories["atom_site"];
  if (!cat) {
    node.children = [];
    return;
  }
  const dataStart = node.startLine - node.rowStart;
  const seqF = pick(cat, mode, "auth_seq_id", "label_seq_id");
  const compF = cat.getField("label_comp_id") ?? cat.getField("auth_comp_id");
  const insF = cat.getField("pdbx_PDB_ins_code");
  const start = node.rowStart;
  const endEx = node.rowEnd + 1;
  const seq = seqF ? seqF.toStringArray({ start, end: endEx }) : null;
  const comp = compF ? compF.toStringArray({ start, end: endEx }) : null;
  const ins = insF ? insF.toStringArray({ start, end: endEx }) : null;
  const m = node.rowEnd - node.rowStart + 1;
  const residues: FoldNode[] = [];
  let i = 0;
  while (i < m) {
    let j = i + 1;
    while (
      j < m &&
      (!seq || seq[j] === seq[i]) &&
      (!ins || ins[j] === ins[i])
    )
      j++;
    const label = `${node.key ?? ""} ${comp ? comp[i] : ""} ${seq ? seq[i] : i}`.trim();
    const res: FoldNode = {
      id: `${node.id}:r:${i}`,
      label,
      category: "atom_site",
      level: "residue",
      startLine: dataStart + start + i,
      endLine: dataStart + start + j - 1,
      rowStart: start + i,
      rowEnd: start + j - 1,
    };
    residues.push(res);
    tree.byId.set(res.id, res);
    i = j;
  }
  node.children = residues;
  node.label = `chain ${node.key} · ${fmt(residues.length)} residues · ${fmt(m)} atoms`;
}

type Handler = (span: LoopSpan, cat: MolCifCategory, mode: HierarchyMode) => FoldNode[];

/** Single-level grouping by a contiguous-run column (entity_poly_seq, struct_conf, ...). */
function groupBy(auth: string, label: string, prefix: string): Handler {
  return (span, cat, mode) => {
    const f = pick(cat, mode, auth, label);
    const n = span.dataLineCount;
    if (!f || n === 0) return [genericNode(span, cat.rowCount)];
    const arr = f.toStringArray({ start: 0, end: n });
    const nodes: FoldNode[] = [];
    let i = 0;
    while (i < n) {
      let j = i + 1;
      while (j < n && arr[j] === arr[i]) j++;
      nodes.push({
        id: `grp:${span.block}:${span.category}:${arr[i]}:${i}`,
        label: `${prefix} ${arr[i]} · ${fmt(j - i)} rows`,
        category: span.category,
        level: "group",
        startLine: span.dataStart + i,
        endLine: span.dataStart + j - 1,
        rowStart: i,
        rowEnd: j - 1,
      });
      i = j;
    }
    return nodes;
  };
}

const HANDLERS: Record<string, Handler> = {
  atom_site: atomSiteNodes,
  entity_poly_seq: groupBy("entity_id", "entity_id", "entity"),
  struct_conf: groupBy("beg_auth_asym_id", "beg_label_asym_id", "chain"),
  struct_sheet_range: groupBy("beg_auth_asym_id", "beg_label_asym_id", "chain"),
};

export function buildFoldTree(
  doc: CifDocument,
  file: MolCifFile,
  mode: HierarchyMode,
): FoldTree {
  const roots: FoldNode[] = [];
  for (const span of doc.spans) {
    if (span.kind !== "loop" || span.dataStart < 0 || span.dataLineCount === 0) continue;
    const cat = file.blocks[span.block]?.categories[span.category];
    const rowCount = cat?.rowCount ?? span.dataLineCount;
    const oneLinePerRow = !!cat && span.dataLineCount === rowCount;
    const handler = HANDLERS[span.category];
    if (handler && oneLinePerRow && cat) {
      roots.push(...handler(span, cat, mode));
    } else {
      roots.push(genericNode(span, rowCount));
    }
  }
  const byId = new Map<string, FoldNode>();
  for (const r of roots) byId.set(r.id, r);
  return { mode, roots, byId, ctx: { doc, file, mode } };
}
