// Flatten the fold tree into the linear list the OUTLINE pane virtualizer renders.
//
// Unlike flatten.ts (which flattens the SOURCE against category-level collapse and emits
// verbatim line rows), this walks the SAME FoldNode tree against the outline's OWN expand
// state and emits one row per node — a document outline: every category, with atom_site (and
// the grouped categories) expandable into chains -> residues. It never reads the source
// `visible` array, so scrolling or folding the source never recomputes the outline.

import type { FoldNode, FoldTree } from "./fold-tree";

export type OutlineState = ReadonlySet<string>; // ids of EXPANDED outline nodes

export interface OutlineRow {
  node: FoldNode;
  depth: number; // 0 category, 1 chain/group, 2 residue
  expandable: boolean; // has children, or can lazily get them (atom_site chains)
  expanded: boolean; // currently expanded in the outline
}

/** Depth-first walk of the category roots, descending only into expanded nodes. */
export function flattenOutline(tree: FoldTree, expanded: OutlineState): OutlineRow[] {
  const out: OutlineRow[] = [];
  const walk = (nodes: FoldNode[], depth: number) => {
    for (const node of nodes) {
      const expandable = !!node.lazy || !!(node.children && node.children.length);
      const isExpanded = expanded.has(node.id);
      out.push({ node, depth, expandable, expanded: isExpanded });
      if (isExpanded && node.children && node.children.length) walk(node.children, depth + 1);
    }
  };
  walk(tree.roots, 0);
  return out;
}

/**
 * The deepest node containing source `line` that is currently VISIBLE in the outline — i.e.
 * we descend from the category into a child only while the parent is expanded in the outline.
 * Used for source-scroll -> outline-selection: the result always maps to a real OutlineRow.
 */
export function deepestVisibleNodeAt(category: FoldNode, line: number, expanded: OutlineState): FoldNode {
  let node = category;
  while (expanded.has(node.id) && node.children && node.children.length) {
    const hit = node.children.find((c) => line >= c.startLine && line <= c.endLine);
    if (!hit) break;
    node = hit;
  }
  return node;
}
