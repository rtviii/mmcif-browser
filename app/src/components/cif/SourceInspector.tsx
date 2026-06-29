"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ParsedCif } from "@/lib/cif";
import { flattenVisible } from "@/lib/cif-source/flatten";
import {
  buildFoldTree,
  ensureChildren,
  type FoldNode,
  type HierarchyMode,
  isPreamble,
} from "@/lib/cif-source/fold-tree";
import { deepestVisibleNodeAt, flattenOutline } from "@/lib/cif-source/outline";
import { segmentDocument } from "@/lib/cif-source/segment";
import {
  buildKeyValueTable,
  buildLineToRowFull,
  buildLoopTable,
  type KeyValueTable,
  type LoopTable,
} from "@/lib/cif-source/table";
import { asMolCifFile, type MolCifCategory } from "@/lib/cif-source/types";
import type { MolstarViewer } from "@/lib/molstar/viewer";
import {
  buildAtomQuery,
  buildBondQuery,
  buildChainQuery,
  buildComponentQuery,
  buildEntityQuery,
  buildResidueQuery,
  executeQuery,
} from "@/lib/molstar/queries";
import { useStore } from "@/lib/store";
import { Color } from "molstar/lib/mol-util/color";
import { type FilterEntry } from "./CategoryFilter";
import { InspectorToolbar } from "./InspectorToolbar";
import { OutlinePane, type OutlinePaneHandle } from "./OutlinePane";
import { ReferencePanel } from "./ReferencePanel";
import SourceView, { type SourceViewHandle, type ViewOptions } from "./SourceView";

// 3D label / overlay accents: indigo for the persistent pin, sky for transient hover.
const PIN_COLOR = Color(0x6366f1);
const HOVER_COLOR = Color(0x0ea5e9);

// A pinned source target: a line (atom / structural / metadata row) or a category header. Drives
// the persistent text highlight, the 3D selection + label (when it resolves to a loci), and the
// jump-back chip. `query` is null for rows/categories with no 3D counterpart (e.g. metadata).
interface PinnedTarget {
  id: string; // `line:${n}` or `header:${nodeId}` — re-clicking the same id unpins
  anchorLine: number; // line to scroll back to
  range: { start: number; end: number } | null; // line highlight (line pins)
  headerId: string | null; // header node id to highlight (category pins)
  outlineId: string | null; // outline node to mark
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any | null;
}

type ScrollRequest = {
  line: number;
  catId?: string;
  flash: { start: number; end: number };
  nonce: number;
};

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
  toolbarSlot,
  active,
}: {
  file: LoadedFile | null;
  parsed: ParsedCif | null;
  viewer: MolstarViewer | null;
  toolbarSlot: HTMLElement | null; // the pane's full-width top bar; the view controls portal into it
  active: boolean; // only the active tab renders the (global) reference panel
}) {
  const setHoverDef = useStore((s) => s.setHoverDef);
  const scheduleClearHoverDef = useStore((s) => s.scheduleClearHoverDef);
  const openRefPanel = useStore((s) => s.openRefPanel);
  const [mode, setMode] = useState<HierarchyMode>("auth");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hideNoise, setHideNoise] = useState(true);
  const [collapsePreamble, setCollapsePreamble] = useState(true);
  const [tableMode, setTableMode] = useState(true);
  const [stickyHeader, setStickyHeader] = useState(true); // pin the current category header in table mode
  const [filter, setFilter] = useState<FilterEntry[]>([]);

  // Outline pane: its own expand state (separate from the source `collapsed`), the active
  // (scroll-synced) node, a pending click->scroll request, and a transient source highlight.
  const [outlineExpanded, setOutlineExpanded] = useState<Set<string>>(new Set());
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null);
  const [pendingScroll, setPendingScroll] = useState<ScrollRequest | null>(null);
  const [highlightRange, setHighlightRange] = useState<{ start: number; end: number } | null>(null);
  const [pinned, setPinned] = useState<PinnedTarget | null>(null);
  const [outlinePct, setOutlinePct] = useState(30);
  const [showOutline, setShowOutline] = useState(false); // outline pane is opt-in (hidden by default)
  const sourceRef = useRef<SourceViewHandle>(null);
  const outlineRef = useRef<OutlinePaneHandle>(null);
  const innerSplitRef = useRef<HTMLDivElement>(null);
  const suppressTopChange = useRef(false);
  const pendingNonce = useRef(0);

  const isText = !!file && !file.binary;

  const doc = useMemo(
    () => (isText && file ? segmentDocument(file.data as string) : null),
    [file, isText],
  );

  const tree = useMemo(() => {
    if (!doc || !parsed) return null;
    return buildFoldTree(doc, asMolCifFile(parsed.raw), mode);
  }, [doc, parsed, mode]);

  // Categories actually present in the loaded file (across blocks) — drives greying of
  // schema-only neighbours in the reference panel.
  const presentCategories = useMemo(() => new Set(doc?.spans.map((s) => s.category) ?? []), [doc]);

  // Default view when a tree is (re)built: the source collapses the atom_site category (so it
  // doesn't dump tens of thousands of atom lines) plus preamble categories if that option is on;
  // the outline expands every category (chains/residues stay lazy + collapsed).
  useEffect(() => {
    const collapsedSet = new Set<string>();
    const expandedSet = new Set<string>();
    if (tree) {
      for (const root of tree.roots) {
        expandedSet.add(root.id);
        if (root.category === "atom_site") collapsedSet.add(root.id);
        if (collapsePreamble && isPreamble(root.category)) collapsedSet.add(root.id);
      }
    }
    setCollapsed(collapsedSet);
    setOutlineExpanded(expandedSet);
    setActiveOutlineId(null);
    setPinned(null);
    viewer?.clearSelection();
    viewer?.removePersistentLabel("pin");
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

  // Per-key-value-category two-column (item | value) table model. Like tableModel, only built
  // in table mode so non-table mode pays nothing.
  const kvTableModel = useMemo(() => {
    const m = new Map<number, KeyValueTable>();
    if (!doc || !parsed || !tableMode) return m;
    const file = asMolCifFile(parsed.raw);
    doc.spans.forEach((span, si) => {
      if (span.kind !== "kv") return;
      const t = buildKeyValueTable(doc, span, file);
      if (t) m.set(si, t);
    });
    return m;
  }, [doc, parsed, tableMode]);

  // Per-loop line -> parsed row index, for the non-atom_site categories the 3D interaction +
  // reference-panel resolvers target (atom_site uses a direct offset and is excluded to avoid
  // 58k-entry maps). Full map (continuation lines included) so a click on any physical line of a
  // wrapped / ;-multiline row resolves to its record, not the category.
  const rowMaps = useMemo(() => {
    const m = new Map<number, Map<number, number>>();
    if (!doc || !parsed) return m;
    const file = asMolCifFile(parsed.raw);
    doc.spans.forEach((span, si) => {
      if (span.kind !== "loop" || span.category === "atom_site" || span.dataStart < 0) return;
      const cat = file.blocks[span.block]?.categories[span.category];
      if (!cat) return;
      m.set(si, buildLineToRowFull(doc, span, cat.rowCount));
    });
    return m;
  }, [doc, parsed]);

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
      if (s.kind === "kv") {
        // In table mode, kv categories render as item|value tables keyed off the declaration
        // lines; hide ;-multiline continuation lines (their content lives in the value cell).
        if (tableMode) {
          const declSet = new Set(Object.values(s.itemLines));
          for (let ln = s.start; ln <= s.end; ln++) if (!declSet.has(ln)) set.add(ln);
        }
        continue;
      }
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

  // Category/item filter: when non-empty, keep only rows belonging to the selected categories
  // (gap/preamble lines, which map to no span, drop out). An item filters to its category.
  const filterCats = useMemo(() => new Set(filter.map((f) => f.category)), [filter]);
  const visibleShown = useMemo(() => {
    if (!filterCats.size || !doc) return visible;
    return visible.filter((r) => {
      const cat = r.kind === "line" ? doc.spans[doc.lineToSpan[r.lineIndex]]?.category : r.node.category;
      return cat != null && filterCats.has(cat);
    });
  }, [visible, filterCats, doc]);

  // The preamble categories actually present in this file (method/deposition headers) — shown in
  // the View menu so "Hide preamble" lists exactly what it collapses.
  const preambleCategories = useMemo(
    () => (tree ? [...new Set(tree.roots.filter((r) => isPreamble(r.category)).map((r) => r.category))] : []),
    [tree],
  );

  // Outline rows: the full FoldNode tree flattened against the outline's OWN expand state.
  // Deps are tree + outlineExpanded only, so scrolling/folding the source never re-flattens it.
  const outlineFlat = useMemo(() => (tree ? flattenOutline(tree, outlineExpanded) : []), [tree, outlineExpanded]);
  const outlineIndexById = useMemo(() => {
    const m = new Map<string, number>();
    outlineFlat.forEach((r, i) => m.set(r.node.id, i));
    return m;
  }, [outlineFlat]);

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

  // --- Outline pane: expand/collapse, click -> scroll, scroll -> select ----------------
  const onOutlineToggle = useCallback(
    (id: string) => {
      if (!tree) return;
      const node = tree.byId.get(id);
      if (!outlineExpanded.has(id) && node?.lazy) ensureChildren(tree, node); // fill residues on first expand
      setOutlineExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [tree, outlineExpanded],
  );

  // Clicking an outline node force-expands its category in the SOURCE (so its lines exist),
  // then requests a scroll. The scroll waits for `visibleShown` to rebuild (the effect below);
  // `nonce` makes it fire even when the category was already expanded.
  const onOutlineNodeClick = useCallback(
    (node: FoldNode) => {
      if (!doc || !tree) return;
      const si = doc.lineToSpan[node.startLine];
      const catId = node.level === "category" ? node.id : si >= 0 ? tree.roots[si]?.id : undefined;
      if (catId) {
        setCollapsed((prev) => {
          if (!prev.has(catId)) return prev;
          const next = new Set(prev);
          next.delete(catId);
          return next;
        });
      }
      setActiveOutlineId(node.id); // select the clicked node (scroll-sync is suppressed briefly)
      setPendingScroll({
        line: node.startLine,
        catId,
        flash: { start: node.startLine, end: node.endLine },
        nonce: pendingNonce.current++,
      });
    },
    [doc, tree],
  );

  // Source scroll -> outline selection: resolve the top source line to the deepest outline-
  // visible node and mark it (styling-only; never expands the outline or re-flattens it).
  const onTopLineChange = useCallback(
    (line: number) => {
      if (suppressTopChange.current || !doc || !tree) return;
      const si = doc.lineToSpan[line];
      if (si < 0) return;
      const catNode = tree.roots[si];
      if (!catNode) return;
      const node = deepestVisibleNodeAt(catNode, line, outlineExpanded);
      if (node.id === activeOutlineId) return;
      setActiveOutlineId(node.id);
      const oi = outlineIndexById.get(node.id);
      if (oi !== undefined) outlineRef.current?.scrollToIndex(oi);
    },
    [doc, tree, outlineExpanded, outlineIndexById, activeOutlineId],
  );

  // Resolve a pending click -> scroll once `visibleShown` reflects the forced category expand.
  // Synchronous: the virtualizer derives the target offset from exact row sizes, so it needs no
  // layout frame. We clear pendingScroll WITHOUT an effect cleanup so the re-render that clearing
  // triggers doesn't cancel the transient suppress/highlight timers below.
  useEffect(() => {
    if (!pendingScroll) return;
    const { line, catId, flash } = pendingScroll;
    let idx = visibleShown.findIndex((r) => r.kind === "line" && r.lineIndex === line);
    if (idx < 0 && catId) idx = visibleShown.findIndex((r) => r.kind === "header" && r.node.id === catId);
    setPendingScroll(null);
    if (idx < 0) return; // filtered out / unresolvable -> skip (don't mutate the user's filter)
    suppressTopChange.current = true;
    sourceRef.current?.scrollToIndex(idx, "start");
    setHighlightRange({ start: flash.start, end: flash.end });
    setTimeout(() => {
      suppressTopChange.current = false;
    }, 250);
    setTimeout(() => setHighlightRange(null), 1200);
  }, [pendingScroll, visibleShown]);

  const startOutlineDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      const rect = innerSplitRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setOutlinePct(Math.min(55, Math.max(18, pct)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  // Single toggle: if anything is collapsed, expand everything; otherwise collapse every
  // top-level category to a one-line placeholder.
  const onToggleExpandAll = useCallback(() => {
    setCollapsed((prev) => {
      if (prev.size === 0) {
        const s = new Set<string>();
        if (tree) for (const r of tree.roots) s.add(r.id);
        return s;
      }
      return new Set();
    });
  }, [tree]);

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
  const authFor = (block: number, row: number): { chain: string; seq: number; comp: string } | null => {
    if (!parsed) return null;
    const cat = asMolCifFile(parsed.raw).blocks[block]?.categories["atom_site"];
    const asym = cat?.getField("auth_asym_id");
    if (!asym) return null;
    const seq = cat?.getField("auth_seq_id");
    const comp = cat?.getField("label_comp_id");
    return { chain: asym.str(row), seq: seq ? seq.int(row) : 0, comp: comp ? comp.str(row) : "" };
  };

  // Full atom identity for an atom_site row, for atom-granularity highlight/focus + label text.
  const atomFor = (
    block: number,
    row: number,
  ): { chain: string; seq: number; atom: string; alt: string; comp: string } | null => {
    if (!parsed) return null;
    const cat = asMolCifFile(parsed.raw).blocks[block]?.categories["atom_site"];
    const asym = cat?.getField("auth_asym_id");
    if (!asym) return null;
    const seq = cat?.getField("auth_seq_id");
    const atom = cat?.getField("label_atom_id");
    const alt = cat?.getField("label_alt_id");
    const comp = cat?.getField("label_comp_id");
    return {
      chain: asym.str(row),
      seq: seq ? seq.int(row) : 0,
      atom: atom ? atom.str(row) : "",
      alt: alt ? alt.str(row) : "",
      comp: comp ? comp.str(row) : "",
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

  const fstr = (cat: MolCifCategory, name: string, row: number): string => {
    const f = cat.getField(name);
    return f ? f.str(row) : "";
  };
  const fint = (cat: MolCifCategory, name: string, row: number): number | null => {
    const f = cat.getField(name);
    return f ? f.int(row) : null;
  };

  // Map a source line to its 3D query + a human label (for the hover/pin 3D label and the pin
  // chip). atom_site rows resolve to an atom (or its residue); entity rows to the entity;
  // struct_conf / struct_sheet_range to the secondary-structure range; struct_conn to both bond
  // partners; chem_comp to the component. Null for lines with no 3D counterpart (metadata, gaps).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolveLine = (lineIndex: number): { query: any; label: string } | null => {
    const a = atomForLine(lineIndex);
    if (a) {
      const res = `${a.comp} ${a.seq}`.trim();
      if (a.atom)
        return {
          query: buildAtomQuery(a.chain, a.seq, a.atom, a.alt || undefined),
          label: `${res} · ${a.atom} (${a.chain})`,
        };
      return { query: buildResidueQuery(a.chain, a.seq), label: `${res} (chain ${a.chain})` };
    }
    if (!doc || !parsed) return null;
    const si = doc.lineToSpan[lineIndex];
    if (si < 0) return null;
    const span = doc.spans[si];
    if (span.kind !== "loop" || span.category === "atom_site") return null;
    const row = rowMaps.get(si)?.get(lineIndex);
    if (row === undefined) return null;
    const cat = asMolCifFile(parsed.raw).blocks[span.block]?.categories[span.category];
    if (!cat) return null;

    switch (span.category) {
      case "entity": {
        const id = fstr(cat, "id", row);
        if (!id) return null;
        const desc = fstr(cat, "pdbx_description", row);
        return { query: buildEntityQuery(id), label: desc || `entity ${id}` };
      }
      case "entity_poly":
      case "entity_poly_seq":
      case "pdbx_entity_nonpoly": {
        const eid = fstr(cat, "entity_id", row);
        return eid ? { query: buildEntityQuery(eid), label: `entity ${eid}` } : null;
      }
      case "struct_conf":
      case "struct_sheet_range": {
        const chain = fstr(cat, "beg_auth_asym_id", row);
        const beg = fint(cat, "beg_auth_seq_id", row);
        const end = fint(cat, "end_auth_seq_id", row);
        if (!chain || beg == null) return null;
        const kind = span.category === "struct_conf" ? "helix" : "strand";
        return {
          query: buildResidueQuery(chain, beg, end ?? undefined),
          label: `${kind} ${chain} ${beg}${end != null ? `–${end}` : ""}`,
        };
      }
      case "struct_conn": {
        const c1 = fstr(cat, "ptnr1_auth_asym_id", row);
        const s1 = fint(cat, "ptnr1_auth_seq_id", row);
        const c2 = fstr(cat, "ptnr2_auth_asym_id", row);
        const s2 = fint(cat, "ptnr2_auth_seq_id", row);
        if (!c1 || s1 == null) return null;
        if (c2 && s2 != null)
          return { query: buildBondQuery(c1, s1, c2, s2), label: `bond ${c1} ${s1} – ${c2} ${s2}` };
        return { query: buildResidueQuery(c1, s1), label: `${c1} ${s1}` };
      }
      case "chem_comp": {
        const id = fstr(cat, "id", row);
        if (!id) return null;
        const name = fstr(cat, "name", row);
        return { query: buildComponentQuery(id), label: name ? `${id} — ${name}` : id };
      }
      default:
        return null;
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const show = (query: any | null, focus: boolean, label?: string | null) => {
    if (!viewer) return;
    const structure = viewer.getCurrentStructure();
    if (!structure || !query) {
      if (!focus) {
        viewer.highlightLoci(null);
        viewer.hideHoverLabel();
      }
      return;
    }
    const loci = executeQuery(query, structure);
    if (focus) {
      if (loci) viewer.focusLoci(loci);
    } else {
      viewer.highlightLoci(loci);
      if (loci && label) viewer.showHoverLabel(loci, label, HOVER_COLOR);
      else viewer.hideHoverLabel();
    }
  };

  const onRowEnter = (lineIndex: number) =>
    throttle(() => {
      const r = resolveLine(lineIndex);
      show(r?.query ?? null, false, r?.label);
    });

  const onNodeEnter = (node: FoldNode) =>
    throttle(() => {
      if (node.category !== "atom_site" || (node.level !== "chain" && node.level !== "residue")) {
        viewer?.highlightLoci(null);
        viewer?.hideHoverLabel();
        return;
      }
      const a = authFor(node.block ?? 0, node.rowStart);
      if (!a) {
        viewer?.highlightLoci(null);
        viewer?.hideHoverLabel();
        return;
      }
      if (node.level === "chain") show(buildChainQuery(a.chain), false, `chain ${a.chain}`);
      else show(buildResidueQuery(a.chain, a.seq), false, `${a.comp} ${a.seq} (chain ${a.chain})`.trim());
    });

  const onStructLeave = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    viewer?.highlightLoci(null);
    viewer?.hideHoverLabel();
  };

  // --- persistent single pin: click a row / category to keep it highlighted (text + 3D + label)
  // while you scroll away; click it again, click the chip's ×, or press Esc to release.
  const applyPin = (t: PinnedTarget) => {
    setPinned(t);
    if (!viewer) return;
    viewer.hideHoverLabel();
    const structure = viewer.getCurrentStructure();
    const loci = structure && t.query ? executeQuery(t.query, structure) : null;
    if (loci) {
      viewer.setSelection(loci);
      viewer.addPersistentLabel("pin", loci, t.label, PIN_COLOR);
      viewer.focusLoci(loci);
    } else {
      viewer.clearSelection();
      viewer.removePersistentLabel("pin");
    }
  };

  const clearPin = useCallback(() => {
    setPinned(null);
    viewer?.clearSelection();
    viewer?.removePersistentLabel("pin");
  }, [viewer]);

  const togglePin = (t: PinnedTarget) => {
    if (pinned?.id === t.id) clearPin();
    else applyPin(t);
  };

  // Esc releases the pin (only while something is pinned, so it doesn't swallow other Escapes).
  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && clearPin();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinned, clearPin]);

  const onRowClick = (lineIndex: number) => {
    const r = resolveLine(lineIndex);
    const cat = doc ? doc.spans[doc.lineToSpan[lineIndex]]?.category : undefined;
    togglePin({
      id: `line:${lineIndex}`,
      anchorLine: lineIndex,
      range: { start: lineIndex, end: lineIndex },
      headerId: null,
      outlineId: null,
      label: r?.label ?? cat ?? `line ${lineIndex + 1}`,
      query: r?.query ?? null,
    });
  };

  const onHeaderClick = (node: FoldNode) => {
    togglePin({
      id: `header:${node.id}`,
      anchorLine: node.startLine,
      range: null,
      headerId: node.id,
      outlineId: node.id,
      label: node.category,
      query: null,
    });
  };

  // Jump-back: scroll the source to the pinned target (re-expanding its category if needed) and
  // flash it. Reuses the same pendingScroll path as outline clicks.
  const jumpToPinned = () => {
    if (!pinned || !doc) return;
    const si = doc.lineToSpan[pinned.anchorLine];
    const catId = pinned.headerId ?? (si >= 0 ? tree?.roots[si]?.id : undefined) ?? undefined;
    if (catId) {
      setCollapsed((prev) => {
        if (!prev.has(catId)) return prev;
        const next = new Set(prev);
        next.delete(catId);
        return next;
      });
    }
    const flash = pinned.range ?? { start: pinned.anchorLine, end: pinned.anchorLine };
    setPendingScroll({ line: pinned.anchorLine, catId, flash, nonce: pendingNonce.current++ });
  };

  // --- dig-deeper reference panel: derive (block, category, row) for a source line, open the
  // panel for the pinned row, and jump the source back to a joined row the panel surfaces. ---
  const rowContextForLine = (
    lineIndex: number,
  ): { blockIndex: number; category: string; rowIndex: number } | null => {
    if (!doc) return null;
    const si = doc.lineToSpan[lineIndex];
    if (si < 0) return null;
    const span = doc.spans[si];
    if (!span) return null;
    if (span.kind === "loop") {
      if (span.category === "atom_site") {
        if (span.dataStart < 0) return null;
        const row = lineIndex - span.dataStart;
        if (row < 0 || row >= span.dataLineCount) return null;
        return { blockIndex: span.block, category: span.category, rowIndex: row };
      }
      const row = rowMaps.get(si)?.get(lineIndex);
      if (row === undefined) return null;
      return { blockIndex: span.block, category: span.category, rowIndex: row };
    }
    return { blockIndex: span.block, category: span.category, rowIndex: 0 }; // kv: single row
  };

  // Open the dig-deeper reference panel for a source line: instance mode when the line resolves to a
  // concrete row (row joins), else schema mode for its category. Shared by the pin-chip "references"
  // button and the right-click affordance.
  const openReferencesForLine = (lineIndex: number, label?: string) => {
    if (!doc) return;
    const cat = doc.spans[doc.lineToSpan[lineIndex]]?.category;
    const ctx = rowContextForLine(lineIndex);
    if (ctx) openRefPanel({ kind: "category", cat: ctx.category }, { ...ctx, label: label ?? cat });
    else if (cat) openRefPanel({ kind: "category", cat });
  };

  const pinReferences = () => {
    if (!pinned || !doc) return;
    // category-header pin -> schema mode; row pin -> instance mode (row joins).
    if (pinned.headerId) {
      const cat = doc.spans[doc.lineToSpan[pinned.anchorLine]]?.category;
      if (cat) openRefPanel({ kind: "category", cat });
      return;
    }
    openReferencesForLine(pinned.anchorLine, pinned.label);
  };

  // Right-click a row -> open its references (instance mode) instead of the browser context menu;
  // right-click a category header -> schema mode. Left-click still pins (3D highlight).
  const onRowContextMenu = (lineIndex: number) => {
    const r = resolveLine(lineIndex);
    const cat = doc ? doc.spans[doc.lineToSpan[lineIndex]]?.category : undefined;
    openReferencesForLine(lineIndex, r?.label ?? cat);
  };
  const onHeaderContextMenu = (node: FoldNode) => openRefPanel({ kind: "category", cat: node.category });

  // Force-expand a span's category and scroll/flash a single source line. Shared by the
  // category- and item-level jumps below (the reference panel's in-file navigation).
  const scrollToCategoryLine = (si: number, line: number) => {
    if (line < 0 || !tree) return;
    const catId = tree.roots[si]?.id;
    if (catId) {
      setCollapsed((prev) => {
        if (!prev.has(catId)) return prev;
        const next = new Set(prev);
        next.delete(catId);
        return next;
      });
    }
    setPendingScroll({ line, catId, flash: { start: line, end: line }, nonce: pendingNonce.current++ });
  };

  // Reference panel -> jump to a category header in the source.
  const jumpToCategory = (category: string, blockIndex = 0) => {
    if (!doc) return;
    const si = doc.spans.findIndex((s) => s.category === category && s.block === blockIndex);
    if (si < 0) return;
    const span = doc.spans[si];
    scrollToCategoryLine(si, span.kind === "loop" ? span.loopKeywordLine : span.start);
  };

  // Reference panel -> jump to a specific item's declaration. Precise in verbatim mode; in table
  // mode loop decl lines are folded into the header, so pendingScroll falls back to the category.
  const jumpToItem = (category: string, field: string, blockIndex = 0) => {
    if (!doc) return;
    const si = doc.spans.findIndex((s) => s.category === category && s.block === blockIndex);
    if (si < 0) return;
    const span = doc.spans[si];
    let line = -1;
    if (span.kind === "loop") {
      const fi = span.fieldNames.indexOf(field);
      if (fi >= 0) line = span.declLines[fi];
    } else {
      line = span.itemLines[field] ?? -1;
    }
    if (line < 0) return jumpToCategory(category, blockIndex); // unknown field -> header
    scrollToCategoryLine(si, line);
  };

  const jumpToInstance = (blockIndex: number, category: string, rowIndex: number) => {
    if (!doc || !tree) return;
    const si = doc.spans.findIndex((s) => s.category === category && s.block === blockIndex);
    if (si < 0) return;
    const span = doc.spans[si];
    let line = -1;
    if (span.kind === "loop") {
      if (category === "atom_site") {
        if (span.dataStart >= 0) line = span.dataStart + rowIndex;
      } else {
        const map = rowMaps.get(si);
        if (map) for (const [ln, r] of map) if (r === rowIndex) { line = ln; break; }
      }
    } else {
      line = span.start; // kv: single row
    }
    if (line < 0) return;
    const catId = tree.roots[si]?.id;
    if (catId) {
      setCollapsed((prev) => {
        if (!prev.has(catId)) return prev;
        const next = new Set(prev);
        next.delete(catId);
        return next;
      });
    }
    setPendingScroll({
      line,
      catId,
      flash: { start: line, end: line },
      nonce: pendingNonce.current++,
    });
  };

  const viewOptions: ViewOptions = { hideNoise, collapsePreamble, tableMode, stickyHeader };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The reference panel is driven by the global store; only the active tab renders it so hidden
          tabs don't resolve its row context against the wrong file. */}
      {active && (
        <ReferencePanel
          parsed={parsed}
          presentCategories={presentCategories}
          onJumpToInstance={jumpToInstance}
          onJumpToCategory={jumpToCategory}
          onJumpToItem={jumpToItem}
        />
      )}
      {/* The view controls live in the pane's full-width top bar (shared with the file controls);
          portal them up so they keep direct access to this inspector's view + pin state. */}
      {toolbarSlot &&
        isText &&
        doc &&
        tree &&
        createPortal(
          <InspectorToolbar
            doc={doc}
            rowCount={visibleShown.length}
            mode={mode}
            onModeChange={setMode}
            hideNoise={hideNoise}
            onToggleNoise={() => setHideNoise((v) => !v)}
            collapsePreamble={collapsePreamble}
            onTogglePreamble={onTogglePreamble}
            preambleCategories={preambleCategories}
            tableMode={tableMode}
            onToggleTable={() => setTableMode((v) => !v)}
            stickyHeader={stickyHeader}
            onToggleSticky={() => setStickyHeader((v) => !v)}
            outlineShown={showOutline}
            onToggleOutline={() => setShowOutline((v) => !v)}
            allExpanded={collapsed.size === 0}
            onToggleExpandAll={onToggleExpandAll}
            filter={filter}
            onFilterChange={setFilter}
            pinnedLabel={pinned?.label ?? null}
            onPinJump={jumpToPinned}
            onPinClear={clearPin}
            onPinReferences={pinReferences}
          />,
          toolbarSlot,
        )}
      {isText && doc && tree ? (
        <div ref={innerSplitRef} className="flex min-h-0 flex-1">
          {showOutline && (
            <>
              <div
                className="flex min-w-0 flex-col border-r border-slate-200"
                style={{ width: `${outlinePct}%` }}
              >
                <OutlinePane
                  ref={outlineRef}
                  rows={outlineFlat}
                  activeId={activeOutlineId}
                  pinnedId={pinned?.outlineId ?? null}
                  onToggle={onOutlineToggle}
                  onNodeEnter={onNodeEnter}
                  onNodeLeave={onStructLeave}
                  onNodeClick={onOutlineNodeClick}
                />
              </div>
              <div
                onMouseDown={startOutlineDrag}
                title="drag to resize"
                className="w-1 shrink-0 cursor-col-resize bg-slate-200 transition-colors hover:bg-indigo-400"
              />
            </>
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <SourceView
              ref={sourceRef}
              doc={doc}
              visible={visibleShown}
              viewOptions={viewOptions}
              tableModel={tableModel}
              kvTableModel={kvTableModel}
              onToggle={onToggle}
              onHoverItem={(cat, field, e) => setHoverDef({ kind: "item", cat, field }, { x: e.clientX, y: e.clientY })}
              onHoverCategory={(cat, e) => setHoverDef({ kind: "category", cat }, { x: e.clientX, y: e.clientY })}
              onClearHover={scheduleClearHoverDef}
              onRowEnter={onRowEnter}
              onNodeEnter={onNodeEnter}
              onStructLeave={onStructLeave}
              onRowClick={onRowClick}
              onHeaderClick={onHeaderClick}
              onRowContextMenu={onRowContextMenu}
              onHeaderContextMenu={onHeaderContextMenu}
              onTopLineChange={onTopLineChange}
              highlightRange={highlightRange}
              pinnedRange={pinned?.range ?? null}
              pinnedHeaderId={pinned?.headerId ?? null}
            />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-[11px] text-slate-400">
          {file?.binary
            ? "Source view needs text mmCIF. This is BinaryCIF — open the .cif to inspect the source. The 3D view still works."
            : "Parsing…"}
        </div>
      )}
    </div>
  );
}
