// Flatten the fold tree + collapse state into the linear list the virtualizer renders.
//
// Fully expanded, the output is the verbatim source lines in order. A collapsed node
// becomes a single placeholder row that hides its line range. Fold chevrons ride real
// source lines (the first line of an expanded region) rather than synthetic header rows,
// so the expanded view stays byte-faithful.
//
// Coincident starts: a chain and its first residue begin on the same physical line. The
// chevrons for expanded ancestors that start on a given line are carried on whichever row
// is emitted there first (a line row, or the placeholder of a collapsed inner node), via
// `starts` / `ancestorStarts`, so no level becomes unreachable.

import type { CifDocument } from "./segment";
import type { FoldNode, FoldTree } from "./fold-tree";

export type FoldState = ReadonlySet<string>; // ids of COLLAPSED nodes

export type VisibleRow =
  | { kind: "line"; lineIndex: number; starts: FoldNode[] }
  | { kind: "placeholder"; node: FoldNode; hiddenCount: number; ancestorStarts: FoldNode[] };

export function flattenVisible(
  doc: CifDocument,
  tree: FoldTree,
  collapsed: FoldState,
): VisibleRow[] {
  const out: VisibleRow[] = [];
  const total = doc.lines.length;

  // Walk [from, to] honoring the given child nodes (sorted by startLine, contiguous-ish).
  // `pending` are chevrons for expanded ancestors that begin exactly at `from`; they attach
  // to the first row emitted at `from`.
  function walk(nodes: FoldNode[] | undefined, from: number, to: number, pending: FoldNode[]) {
    let line = from;
    let ni = 0;
    const list = nodes ?? [];
    while (line <= to) {
      const node = ni < list.length ? list[ni] : null;
      const attach = line === from ? pending : EMPTY;
      if (node && node.startLine === line) {
        ni++;
        if (collapsed.has(node.id)) {
          out.push({
            kind: "placeholder",
            node,
            hiddenCount: node.endLine - node.startLine + 1,
            ancestorStarts: attach,
          });
        } else if (node.children && node.children.length) {
          walk(node.children, node.startLine, node.endLine, [...attach, node]);
        } else {
          emitLines(node.startLine, node.endLine, [...attach, node]);
        }
        line = node.endLine + 1;
      } else {
        out.push({ kind: "line", lineIndex: line, starts: attach });
        line++;
      }
    }
  }

  function emitLines(from: number, to: number, startsForFirst: FoldNode[]) {
    for (let l = from; l <= to; l++) {
      out.push({ kind: "line", lineIndex: l, starts: l === from ? startsForFirst : EMPTY });
    }
  }

  walk(tree.roots, 0, total - 1, EMPTY);
  return out;
}

const EMPTY: FoldNode[] = [];
