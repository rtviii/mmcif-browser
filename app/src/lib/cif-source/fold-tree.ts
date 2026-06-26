// Build the fold-region tree from the segmented document + Mol*'s parsed fields.
//
// Every category (loop or key-value) becomes a collapsible "category" node spanning all its
// lines, so any category can collapse to a one-line summary. atom_site gets chain > residue
// children (residues lazily on expand); a few categories get one grouping level. Fold node
// line ranges are the source lines hidden when the node collapses; row indices are kept for
// the 3D linkage.

import type { CifDocument, LoopSpan } from "./segment";
import { type MolCifCategory, type MolCifFile } from "./types";

export type HierarchyMode = "auth" | "label";
export type FoldLevel = "category" | "chain" | "residue" | "group";

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
  spanKind?: "loop" | "kv"; // category nodes only: which span shape produced this
  summary?: string; // category nodes only: short count, e.g. "13 rows" / "8 items"
}

export interface FoldCtx {
  doc: CifDocument;
  file: MolCifFile;
  mode: HierarchyMode;
}

export interface FoldTree {
  mode: HierarchyMode;
  roots: FoldNode[]; // category nodes, in source order
  byId: Map<string, FoldNode>;
  ctx: FoldCtx;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/** Resolve a grouping field to the auth_/label_ variant for the active mode. */
function pick(cat: MolCifCategory, mode: HierarchyMode, auth: string, label: string) {
  const primary = mode === "auth" ? auth : label;
  return cat.getField(primary) ?? cat.getField(label) ?? cat.getField(auth);
}

/** atom_site: contiguous runs of the chain id -> chain nodes (residues filled lazily). */
function atomSiteNodes(span: LoopSpan, cat: MolCifCategory, mode: HierarchyMode): FoldNode[] {
  const asymF = pick(cat, mode, "auth_asym_id", "label_asym_id");
  const n = span.dataLineCount;
  if (!asymF || n === 0) return [];
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
    while (j < m && (!seq || seq[j] === seq[i]) && (!ins || ins[j] === ins[i])) j++;
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
    if (!f || n === 0) return [];
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

// Bookkeeping categories that don't concern the structure itself. Prefix match:
// a category matches if it equals an entry or starts with "<entry>_". Heuristic; tune freely.
const PREAMBLE_PREFIXES = [
  "audit", "citation", "software", "computing", "database", "pdbx_database",
  "pdbx_audit", "pdbx_version", "struct_keywords", "diffrn", "exptl", "reflns",
  "refine", "pdbx_refine", "pdbx_nmr", "phasing", "pdbx_validate", "em",
  "pdbx_initial", "pdbx_data_processing", "pdbx_serial",
];

export function isPreamble(category: string): boolean {
  return PREAMBLE_PREFIXES.some((p) => category === p || category.startsWith(p + "_"));
}

function categoryNode(span: CifDocument["spans"][number], file: MolCifFile, mode: HierarchyMode): FoldNode {
  if (span.kind === "kv") {
    const items = Object.keys(span.itemLines).length;
    return {
      id: `cat:${span.block}:${span.category}`,
      label: `${span.category} · ${items} item${items === 1 ? "" : "s"}`,
      category: span.category,
      level: "category",
      startLine: span.start,
      endLine: span.end,
      rowStart: 0,
      rowEnd: 0,
      spanKind: "kv",
      summary: `${items} item${items === 1 ? "" : "s"}`,
    };
  }
  const cat = file.blocks[span.block]?.categories[span.category];
  const rowCount = cat?.rowCount ?? span.dataLineCount;
  const lastDecl = span.declLines.length ? span.declLines[span.declLines.length - 1] : span.loopKeywordLine;
  const node: FoldNode = {
    id: `cat:${span.block}:${span.category}`,
    label: `${span.category} · ${fmt(rowCount)} row${rowCount === 1 ? "" : "s"}`,
    category: span.category,
    level: "category",
    startLine: span.loopKeywordLine,
    endLine: span.dataEnd >= 0 ? span.dataEnd : lastDecl,
    rowStart: 0,
    rowEnd: Math.max(0, rowCount - 1),
    block: span.block,
    spanKind: "loop",
    summary: `${fmt(rowCount)} row${rowCount === 1 ? "" : "s"}`,
  };
  const oneLinePerRow = !!cat && span.dataStart >= 0 && span.dataLineCount === rowCount;
  const handler = HANDLERS[span.category];
  if (handler && oneLinePerRow && cat) {
    const children = handler(span, cat, mode);
    if (children.length) node.children = children;
  }
  return node;
}

export function buildFoldTree(doc: CifDocument, file: MolCifFile, mode: HierarchyMode): FoldTree {
  const roots: FoldNode[] = [];
  for (const span of doc.spans) roots.push(categoryNode(span, file, mode));
  const byId = new Map<string, FoldNode>();
  const add = (n: FoldNode) => {
    byId.set(n.id, n);
    if (n.children) for (const c of n.children) add(c);
  };
  for (const r of roots) add(r);
  return { mode, roots, byId, ctx: { doc, file, mode } };
}
