// Flatten the fold tree + collapse state into the linear list the SOURCE virtualizer renders.
//
// Only top-level CATEGORY nodes fold here: expanded, a category emits a header row followed by
// its verbatim source lines; collapsed, it emits just the header row (a one-line summary).
// Chain/residue navigation lives in the outline pane (outline.ts), so the source data rows are
// never interleaved with navigation. `ancestors` carries the enclosing category on line rows.
//
// `hiddenLines` (view option) drops noise lines (loop_/#/blank) and, in table mode, the lines
// folded into table cells.

import type { CifDocument } from "./segment";
import type { FoldNode, FoldTree } from "./fold-tree";

export type FoldState = ReadonlySet<string>; // ids of COLLAPSED nodes

export type VisibleRow =
  | { kind: "line"; lineIndex: number; ancestors: FoldNode[] }
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
        // Every root is a top-level category. Its header row is a block divider carrying the
        // category name + count; expanded, the verbatim lines follow. Chain/residue nodes are
        // never descended here — that hierarchy is navigated from the outline pane.
        const isCollapsed = collapsed.has(node.id);
        out.push({ kind: "header", node, collapsed: isCollapsed, summary: node.summary ?? "", ancestors });
        if (!isCollapsed) {
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
