// Flatten the fold tree + collapse state into the linear list the virtualizer renders.
//
// Fully expanded, the output is the verbatim source lines in order. A collapsed node
// becomes a single placeholder row that hides its line range. Every row carries its
// `ancestors` — the stack of enclosing EXPANDED fold nodes, outer -> inner — so the
// renderer can draw a nested fold rail in the gutter and let any level be collapsed from
// any line.
//
// `hiddenLines` (view option) drops noise lines (loop_/#/blank); the fold rails stay
// reachable on the node's other lines, so nothing becomes uncollapsible.

import type { CifDocument } from "./segment";
import type { FoldNode, FoldTree } from "./fold-tree";

export type FoldState = ReadonlySet<string>; // ids of COLLAPSED nodes

export type VisibleRow =
  | { kind: "line"; lineIndex: number; ancestors: FoldNode[] }
  | { kind: "placeholder"; node: FoldNode; hiddenCount: number; ancestors: FoldNode[] }
  | { kind: "header"; node: FoldNode; collapsed: boolean; summary: string; ancestors: FoldNode[] };

export interface FlattenOpts {
  hiddenLines?: ReadonlySet<number>;
}

export function flattenVisible(
  doc: CifDocument,
  tree: FoldTree,
  collapsed: FoldState,
  opts?: FlattenOpts,
): VisibleRow[] {
  const out: VisibleRow[] = [];
  const total = doc.lines.length;
  const hidden = opts?.hiddenLines;
  const shown = (l: number) => !hidden || !hidden.has(l);

  function walk(nodes: FoldNode[] | undefined, from: number, to: number, ancestors: FoldNode[]) {
    let line = from;
    let ni = 0;
    const list = nodes ?? [];
    while (line <= to) {
      const node = ni < list.length ? list[ni] : null;
      if (node && node.startLine === line) {
        ni++;
        // Top-level category nodes get a header row: a block divider carrying the category
        // name + count. Expanded -> the header is additive (content lines still follow it);
        // collapsed -> the header REPLACES the usual placeholder (one clean collapsed header).
        const isTopCat = ancestors.length === 0 && node.level === "category";
        const isCollapsed = collapsed.has(node.id);
        if (isTopCat) {
          out.push({ kind: "header", node, collapsed: isCollapsed, summary: node.summary ?? "", ancestors });
        }
        if (isCollapsed) {
          if (!isTopCat) {
            out.push({ kind: "placeholder", node, hiddenCount: node.endLine - node.startLine + 1, ancestors });
          }
        } else if (node.children && node.children.length) {
          walk(node.children, node.startLine, node.endLine, ancestors.concat(node));
        } else {
          const anc = ancestors.concat(node);
          for (let l = node.startLine; l <= node.endLine; l++) {
            if (shown(l)) out.push({ kind: "line", lineIndex: l, ancestors: anc });
          }
        }
        line = node.endLine + 1;
      } else {
        if (shown(line)) out.push({ kind: "line", lineIndex: line, ancestors });
        line++;
      }
    }
  }

  walk(tree.roots, 0, total - 1, []);
  return out;
}
