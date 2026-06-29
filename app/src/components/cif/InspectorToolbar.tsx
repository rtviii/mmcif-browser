"use client";
import { useMemo } from "react";
import {
  ALL_LENSES,
  buildLensGroups,
  LENS_META,
  nonDepositionCategories,
  structuralCategories,
} from "@/lib/cif-source/classify";
import type { HierarchyMode } from "@/lib/cif-source/fold-tree";
import type { CifDocument } from "@/lib/cif-source/segment";
import { useStore } from "@/lib/store";
import { CategoryFilter, type FilterEntry } from "./CategoryFilter";
import { ViewMenu } from "./ViewMenu";

// The view-control half of the consolidated inspector toolbar: the View menu / Outline / Table /
// Expand all / Filter, the pin chip (the dissolved PINNED row — label + jump-back + references +
// unpin), and the row count. Rendered by SourceInspector and portalled into the pane's full-width
// top bar (which also holds the file controls), so it owns the view + pin state while sharing one
// bar with the file controls. Returns a fragment of flex items; the portal target is the flex row.
export interface InspectorToolbarProps {
  doc: CifDocument;
  rowCount: number;
  mode: HierarchyMode;
  onModeChange: (m: HierarchyMode) => void;
  hideNoise: boolean;
  onToggleNoise: () => void;
  collapsePreamble: boolean;
  onTogglePreamble: () => void;
  preambleCategories: string[];
  tableMode: boolean;
  onToggleTable: () => void;
  stickyHeader: boolean;
  onToggleSticky: () => void;
  outlineShown: boolean;
  onToggleOutline: () => void;
  allExpanded: boolean;
  onToggleExpandAll: () => void;
  filter: FilterEntry[];
  onFilterChange: (f: FilterEntry[]) => void;
  // Pin chip (the dissolved PINNED row); absent when nothing is pinned.
  pinnedLabel?: string | null;
  onPinJump?: () => void;
  onPinClear?: () => void;
  onPinReferences?: () => void;
}

export function InspectorToolbar(props: InspectorToolbarProps) {
  const { doc } = props;

  // Category + item options for the filter box: every category in the file, and every item
  // (`_cat.attr`) it declares. Selecting any narrows the source view to those categories.
  const filterOptions = useMemo(() => {
    const cats: string[] = [];
    const seenCat = new Set<string>();
    const items: { label: string; category: string }[] = [];
    const seenItem = new Set<string>();
    for (const s of doc.spans) {
      if (s.category && !seenCat.has(s.category)) (seenCat.add(s.category), cats.push(s.category));
      const attrs = s.kind === "loop" ? s.fieldNames : Object.keys(s.itemLines);
      for (const a of attrs) {
        const label = `_${s.category}.${a}`;
        if (!seenItem.has(label)) (seenItem.add(label), items.push({ label, category: s.category }));
      }
    }
    cats.sort();
    items.sort((x, y) => x.label.localeCompare(y.label));
    return { cats, items };
  }, [doc]);

  // Lens presets for the filter: classify the in-file categories (dictionary groups + overrides)
  // into structural / context lenses, plus the two cross-cutting selections.
  const dict = useStore((s) => s.dict);
  const presets = useMemo(() => {
    const cats = filterOptions.cats;
    const groups = buildLensGroups(cats, dict);
    const lenses = ALL_LENSES.map((id) => ({ ...LENS_META[id], categories: groups[id] })).filter(
      (l) => l.categories.length > 0,
    );
    return {
      lenses,
      structuralOnly: structuralCategories(cats, dict),
      hideDeposition: nonDepositionCategories(cats, dict),
    };
  }, [filterOptions.cats, dict]);

  return (
    <>
      <ViewMenu
        mode={props.mode}
        onModeChange={props.onModeChange}
        collapsePreamble={props.collapsePreamble}
        onTogglePreamble={props.onTogglePreamble}
        hideNoise={props.hideNoise}
        onToggleNoise={props.onToggleNoise}
        stickyHeader={props.stickyHeader}
        onToggleSticky={props.onToggleSticky}
        preambleCategories={props.preambleCategories}
      />
      <Toggle on={props.outlineShown} onClick={props.onToggleOutline}>
        Outline
      </Toggle>
      <Toggle on={props.tableMode} onClick={props.onToggleTable}>
        Table
      </Toggle>
      <button
        onClick={props.onToggleExpandAll}
        className="shrink-0 whitespace-nowrap rounded border border-slate-300 bg-white px-2 py-0.5 text-slate-700 hover:bg-slate-50"
      >
        {props.allExpanded ? "Collapse all" : "Expand all"}
      </button>
      <CategoryFilter
        categories={filterOptions.cats}
        items={filterOptions.items}
        selected={props.filter}
        onChange={props.onFilterChange}
        presets={presets}
      />
      {props.pinnedLabel && (
        <span className="flex min-w-0 shrink items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-indigo-700">
          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-indigo-400">pin</span>
          <button
            onClick={props.onPinJump}
            title="scroll to the pinned row"
            className="max-w-[150px] truncate font-mono text-indigo-700 hover:underline"
          >
            {props.pinnedLabel}
          </button>
          {props.onPinReferences && (
            <button
              onClick={props.onPinReferences}
              title="references — what this row links to / what links to it"
              className="shrink-0 rounded px-1 font-mono text-indigo-500 hover:bg-indigo-100 hover:text-indigo-700"
            >
              ⧉
            </button>
          )}
          <button
            onClick={props.onPinClear}
            title="unpin (Esc)"
            className="shrink-0 rounded px-1 text-indigo-500 hover:bg-indigo-100 hover:text-indigo-700"
          >
            ×
          </button>
        </span>
      )}
      <span className="ml-auto shrink-0 font-mono text-slate-400">{props.rowCount.toLocaleString()} rows</span>
    </>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded border px-2 py-0.5 ${
        on
          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
          : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}
