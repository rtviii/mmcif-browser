"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ParsedCif } from "@/lib/cif";
import { flattenVisible } from "@/lib/cif-source/flatten";
import {
  buildFoldTree,
  ensureChildren,
  type FoldNode,
  type HierarchyMode,
  isPreamble,
} from "@/lib/cif-source/fold-tree";
import { segmentDocument } from "@/lib/cif-source/segment";
import { buildLoopTable, type LoopTable } from "@/lib/cif-source/table";
import { asMolCifFile } from "@/lib/cif-source/types";
import type { MolstarViewer } from "@/lib/molstar/viewer";
import { buildAtomQuery, buildChainQuery, buildResidueQuery, executeQuery } from "@/lib/molstar/queries";
import { Definition, type HoverTarget } from "./Definition";
import SourceView, { type ViewOptions } from "./SourceView";

interface LoadedFile {
  data: string | Uint8Array;
  binary: boolean;
  name: string;
}

// Orchestrates the verbatim source view: segment -> fold tree -> flatten, owning the
// collapse/mode/hover/view-option state. Also drives the 3D viewer: hovering an atom_site
// row/residue/chain highlights it in Mol*, clicking focuses it.
export default function SourceInspector({
  file,
  parsed,
  viewer,
}: {
  file: LoadedFile | null;
  parsed: ParsedCif | null;
  viewer: MolstarViewer | null;
}) {
  const [mode, setMode] = useState<HierarchyMode>("auth");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<HoverTarget>(null);
  const [hideNoise, setHideNoise] = useState(false);
  const [collapsePreamble, setCollapsePreamble] = useState(false);
  const [tableMode, setTableMode] = useState(false);

  const isText = !!file && !file.binary;

  const doc = useMemo(
    () => (isText && file ? segmentDocument(file.data as string) : null),
    [file, isText],
  );

  const tree = useMemo(() => {
    if (!doc || !parsed) return null;
    return buildFoldTree(doc, asMolCifFile(parsed.raw), mode);
  }, [doc, parsed, mode]);

  // Default view when a tree is (re)built: atom_site chains collapsed, plus preamble
  // categories if that option is on.
  useEffect(() => {
    const s = new Set<string>();
    if (tree) {
      for (const root of tree.roots) {
        if (root.children) for (const c of root.children) if (c.level === "chain") s.add(c.id);
        if (collapsePreamble && isPreamble(root.category)) s.add(root.id);
      }
    }
    setCollapsed(s);
    // collapsePreamble intentionally excluded: its toggle updates `collapsed` directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree]);

  // Per-loop table model (cells sourced from Mol*'s parsed fields, row<->line mapping,
  // column widths). Only built in table mode.
  const tableModel = useMemo(() => {
    const m = new Map<number, LoopTable>();
    if (!doc || !parsed || !tableMode) return m;
    const file = asMolCifFile(parsed.raw);
    doc.spans.forEach((span, si) => {
      if (span.kind !== "loop") return;
      const t = buildLoopTable(doc, span, file);
      if (t) m.set(si, t);
    });
    return m;
  }, [doc, parsed, tableMode]);

  const hiddenLines = useMemo(() => {
    if ((!hideNoise && !tableMode) || !doc) return undefined;
    const set = new Set<number>();
    if (hideNoise) {
      for (const l of doc.lines) {
        if (l.inText) continue;
        const t = l.text.trimStart();
        if (t === "" || t.startsWith("#")) set.add(l.index);
      }
    }
    for (let si = 0; si < doc.spans.length; si++) {
      const s = doc.spans[si];
      if (s.kind !== "loop") continue;
      // hide loop_ unless table mode is using it as the column-header row
      if (hideNoise && !tableMode) set.add(s.loopKeywordLine);
      if (tableMode) {
        for (const d of s.declLines) set.add(d); // decls -> column headers
        const t = tableModel.get(si);
        if (t) for (const ln of t.contLines) set.add(ln); // wrapped-row continuation lines
      }
    }
    return set.size ? set : undefined;
  }, [doc, hideNoise, tableMode, tableModel]);

  const visible = useMemo(
    () => (doc && tree ? flattenVisible(doc, tree, collapsed, { hiddenLines }) : []),
    [doc, tree, collapsed, hiddenLines],
  );

  // Number of fold-rail slots: category (1), + chain (2), + residue (3) where present.
  const maxDepth = useMemo(() => {
    let d = 1;
    if (tree) {
      for (const r of tree.roots) {
        if (r.children?.length) {
          d = Math.max(d, 2);
          for (const c of r.children) if (c.lazy || c.children?.length) d = 3;
        }
        if (d === 3) break;
      }
    }
    return d;
  }, [tree]);

  const onToggle = useCallback(
    (id: string) => {
      if (!tree) return;
      const node = tree.byId.get(id);
      const expanding = collapsed.has(id);
      if (expanding && node?.lazy) ensureChildren(tree, node);
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
          if (node?.children) for (const c of node.children) next.add(c.id); // residues start collapsed
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [tree, collapsed],
  );

  const onCollapseChains = useCallback(() => {
    const s = new Set<string>();
    if (tree) {
      for (const root of tree.roots) {
        if (root.children) for (const c of root.children) if (c.level === "chain") s.add(c.id);
        if (collapsePreamble && isPreamble(root.category)) s.add(root.id);
      }
    }
    setCollapsed(s);
  }, [tree, collapsePreamble]);

  const onExpandAll = useCallback(() => setCollapsed(new Set()), []);

  const onTogglePreamble = useCallback(() => {
    const next = !collapsePreamble;
    setCollapsePreamble(next);
    setCollapsed((prev) => {
      const s = new Set(prev);
      if (tree) for (const n of tree.roots) if (isPreamble(n.category)) (next ? s.add(n.id) : s.delete(n.id));
      return s;
    });
  }, [collapsePreamble, tree]);

  // --- 3D linkage (hover -> highlight, click -> focus) -----------------------------
  const rafRef = useRef<number | null>(null);
  const throttle = (fn: () => void) => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      fn();
    });
  };

  // auth_asym_id / auth_seq_id for a given atom_site row (read directly, so highlighting
  // works whether the fold hierarchy is grouped by auth_* or label_*).
  const authFor = (block: number, row: number): { chain: string; seq: number } | null => {
    if (!parsed) return null;
    const cat = asMolCifFile(parsed.raw).blocks[block]?.categories["atom_site"];
    const asym = cat?.getField("auth_asym_id");
    if (!asym) return null;
    const seq = cat?.getField("auth_seq_id");
    return { chain: asym.str(row), seq: seq ? seq.int(row) : 0 };
  };

  // Full atom identity for an atom_site row, for atom-granularity highlight/focus.
  const atomFor = (
    block: number,
    row: number,
  ): { chain: string; seq: number; atom: string; alt: string } | null => {
    if (!parsed) return null;
    const cat = asMolCifFile(parsed.raw).blocks[block]?.categories["atom_site"];
    const asym = cat?.getField("auth_asym_id");
    if (!asym) return null;
    const seq = cat?.getField("auth_seq_id");
    const atom = cat?.getField("label_atom_id");
    const alt = cat?.getField("label_alt_id");
    return {
      chain: asym.str(row),
      seq: seq ? seq.int(row) : 0,
      atom: atom ? atom.str(row) : "",
      alt: alt ? alt.str(row) : "",
    };
  };

  // atom_site is one physical line per row, so line -> row is a direct offset.
  const atomForLine = (lineIndex: number) => {
    if (!doc) return null;
    const span = doc.spans[doc.lineToSpan[lineIndex]];
    if (!span || span.kind !== "loop" || span.category !== "atom_site" || span.dataStart < 0) return null;
    const row = lineIndex - span.dataStart;
    if (row < 0 || row >= span.dataLineCount) return null;
    return atomFor(span.block, row);
  };

  const residueForLine = (lineIndex: number): { chain: string; seq: number } | null => {
    if (!doc) return null;
    const span = doc.spans[doc.lineToSpan[lineIndex]];
    if (!span || span.kind !== "loop" || span.category !== "atom_site" || span.dataStart < 0) return null;
    const row = lineIndex - span.dataStart;
    if (row < 0 || row >= span.dataLineCount) return null;
    return authFor(span.block, row);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const show = (query: any | null, focus: boolean) => {
    if (!viewer) return;
    const structure = viewer.getCurrentStructure();
    if (!structure || !query) {
      if (!focus) viewer.highlightLoci(null);
      return;
    }
    const loci = executeQuery(query, structure);
    if (focus) {
      if (loci) viewer.focusLoci(loci);
    } else {
      viewer.highlightLoci(loci);
    }
  };

  const onRowEnter = (lineIndex: number) =>
    throttle(() => {
      const a = atomForLine(lineIndex);
      if (a && a.atom) {
        show(buildAtomQuery(a.chain, a.seq, a.atom, a.alt || undefined), false);
        return;
      }
      const r = residueForLine(lineIndex);
      show(r ? buildResidueQuery(r.chain, r.seq) : null, false);
    });

  const onNodeEnter = (node: FoldNode) =>
    throttle(() => {
      if (node.category !== "atom_site" || (node.level !== "chain" && node.level !== "residue")) {
        viewer?.highlightLoci(null);
        return;
      }
      const a = authFor(node.block ?? 0, node.rowStart);
      if (!a) {
        viewer?.highlightLoci(null);
        return;
      }
      show(node.level === "chain" ? buildChainQuery(a.chain) : buildResidueQuery(a.chain, a.seq), false);
    });

  const onStructLeave = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    viewer?.highlightLoci(null);
  };

  const onRowClick = (lineIndex: number) => {
    const a = atomForLine(lineIndex);
    if (a && a.atom) {
      show(buildAtomQuery(a.chain, a.seq, a.atom, a.alt || undefined), true);
      return;
    }
    const r = residueForLine(lineIndex);
    if (r) show(buildResidueQuery(r.chain, r.seq), true);
  };

  const viewOptions: ViewOptions = { hideNoise, collapsePreamble, tableMode };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {isText && doc && tree ? (
        <SourceView
          doc={doc}
          visible={visible}
          mode={mode}
          viewOptions={viewOptions}
          maxDepth={maxDepth}
          tableModel={tableModel}
          onModeChange={setMode}
          onToggleNoise={() => setHideNoise((v) => !v)}
          onToggleTable={() => setTableMode((v) => !v)}
          onTogglePreamble={onTogglePreamble}
          onToggle={onToggle}
          onCollapseChains={onCollapseChains}
          onExpandAll={onExpandAll}
          onHoverItem={(cat, field) => setHover({ kind: "item", cat, field })}
          onClearHover={() => setHover(null)}
          onRowEnter={onRowEnter}
          onNodeEnter={onNodeEnter}
          onStructLeave={onStructLeave}
          onRowClick={onRowClick}
        />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-[11px] text-neutral-600">
          {file?.binary
            ? "Source view needs text mmCIF. This is BinaryCIF — open the .cif to inspect the source. The 3D view still works."
            : "Parsing…"}
        </div>
      )}
      <Definition hover={hover} />
    </div>
  );
}
