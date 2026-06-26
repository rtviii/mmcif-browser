"use client";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CifDocument } from "@/lib/cif-source/segment";
import type { FoldNode, HierarchyMode } from "@/lib/cif-source/fold-tree";
import type { VisibleRow } from "@/lib/cif-source/flatten";
import type { KeyValueTable, LoopTable } from "@/lib/cif-source/table";
import { type Token, tokenizeLine } from "@/lib/cif-source/tokenize";
import {
  ALL_LENSES,
  buildLensGroups,
  LENS_META,
  nonDepositionCategories,
  structuralCategories,
} from "@/lib/cif-source/classify";
import { useStore } from "@/lib/store";
import { CategoryFilter, type FilterEntry } from "./CategoryFilter";

const NUMERIC = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

const ROW_H = 18;
const HEADER_H = 30; // category header rows are taller, doubling as inter-block spacing
const CH_PX = 6.62; // approx monospace advance at 11px
const GUTTER_PAD = 8; // small left pad before the fold rails (line numbers dropped)
const RAIL_W = 14;
const EXPAND_SLACK = 12; // chars a value may exceed its column width before it becomes click-to-expand

const TOKEN_CLASS: Record<Token["type"], string> = {
  keyword: "text-indigo-600",
  comment: "text-slate-400 italic",
  item: "text-teal-700",
  string: "text-amber-700",
  number: "text-rose-700",
  text: "text-slate-700",
};

export interface ViewOptions {
  hideNoise: boolean;
  collapsePreamble: boolean;
  tableMode: boolean;
}

// A persistent popover anchored to a clicked cell / multiline value, dismissed by
// clicking away or Escape.
interface Popover {
  x: number;
  y: number;
  field?: string;
  value: string;
}

export interface SourceViewProps {
  doc: CifDocument;
  visible: VisibleRow[];
  mode: HierarchyMode;
  viewOptions: ViewOptions;
  maxDepth: number;
  tableModel: Map<number, LoopTable>;
  kvTableModel: Map<number, KeyValueTable>;
  onModeChange: (m: HierarchyMode) => void;
  onToggleNoise: () => void;
  onToggleTable: () => void;
  onTogglePreamble: () => void;
  onToggle: (id: string) => void;
  onCollapseChains: () => void;
  allExpanded: boolean;
  onToggleExpandAll: () => void;
  filter: FilterEntry[];
  onFilterChange: (f: FilterEntry[]) => void;
  onHoverItem: (cat: string, field: string, e: React.MouseEvent) => void;
  onHoverCategory: (cat: string, e: React.MouseEvent) => void;
  onClearHover: () => void;
  // 3D linkage
  onRowEnter: (lineIndex: number) => void;
  onNodeEnter: (node: FoldNode) => void;
  onStructLeave: () => void;
  onRowClick: (lineIndex: number) => void;
}

export default function SourceView(props: SourceViewProps) {
  const { doc, visible, mode, viewOptions, maxDepth, tableModel, kvTableModel } = props;
  const parentRef = useRef<HTMLDivElement>(null);
  const gutterPx = GUTTER_PAD + maxDepth * RAIL_W;

  const [pop, setPop] = useState<Popover | null>(null);
  const openPopover = (anchor: HTMLElement, value: string, field?: string) => {
    const r = anchor.getBoundingClientRect();
    setPop({ x: r.left, y: r.bottom + 4, value, field });
  };
  useEffect(() => {
    if (!pop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPop(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pop]);

  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => parentRef.current,
    // Exact per-row sizes (no measurement): header rows are taller to separate blocks.
    estimateSize: (i) => (visible[i]?.kind === "header" ? HEADER_H : ROW_H),
    overscan: 30,
  });

  const contentWidth = useMemo(() => {
    let max = 0;
    for (const l of doc.lines) if (l.text.length > max) max = l.text.length;
    return gutterPx + Math.ceil(max * CH_PX) + 24;
  }, [doc, gutterPx]);

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

  // Lens presets for the filter: classify the in-file categories (dictionary groups +
  // overrides) into structural / context lenses, plus the two cross-cutting selections.
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-slate-200 px-2 text-[11px]">
        <div className="flex overflow-hidden rounded border border-slate-300">
          {(["auth", "label"] as const).map((m) => (
            <button
              key={m}
              onClick={() => props.onModeChange(m)}
              className={`px-2 py-0.5 font-mono ${
                mode === m ? "bg-indigo-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              {m}_*
            </button>
          ))}
        </div>
        <Toggle on={viewOptions.collapsePreamble} onClick={props.onTogglePreamble}>
          Hide preamble
        </Toggle>
        <Toggle on={viewOptions.hideNoise} onClick={props.onToggleNoise}>
          Hide noise
        </Toggle>
        <Toggle on={viewOptions.tableMode} onClick={props.onToggleTable}>
          Table
        </Toggle>
        <button
          onClick={props.onCollapseChains}
          className="rounded border border-slate-300 bg-white px-2 py-0.5 text-slate-700 hover:bg-slate-50"
        >
          Collapse chains
        </button>
        <button
          onClick={props.onToggleExpandAll}
          className="rounded border border-slate-300 bg-white px-2 py-0.5 text-slate-700 hover:bg-slate-50"
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
        <span className="ml-auto font-mono text-slate-400">{visible.length.toLocaleString()} rows</span>
      </div>

      <div ref={parentRef} className="no-scrollbar min-h-0 flex-1 overflow-auto bg-white font-mono text-[11px]">
        <div style={{ height: virtualizer.getTotalSize(), width: contentWidth, position: "relative" }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const row = visible[vi.index];
            const enter = () =>
              row.kind === "line" ? props.onRowEnter(row.lineIndex) : props.onNodeEnter(row.node);
            return (
              <div
                key={vi.key}
                className="absolute left-0 flex items-center hover:bg-slate-50"
                style={{ top: 0, height: vi.size, transform: `translateY(${vi.start}px)`, width: contentWidth }}
                onMouseEnter={enter}
                onMouseLeave={props.onStructLeave}
                onClick={row.kind === "line" ? () => props.onRowClick(row.lineIndex) : undefined}
              >
                {row.kind === "header" ? (
                  <HeaderRow
                    row={row}
                    gutterPx={gutterPx}
                    onToggle={props.onToggle}
                    onHoverCategory={props.onHoverCategory}
                    onClearHover={props.onClearHover}
                  />
                ) : (
                  <>
                    <Gutter
                      maxDepth={maxDepth}
                      gutterPx={gutterPx}
                      lineIndex={row.kind === "line" ? row.lineIndex : undefined}
                      ancestors={row.ancestors}
                      self={row.kind === "placeholder" ? row.node : undefined}
                      onToggle={props.onToggle}
                      onNodeEnter={props.onNodeEnter}
                    />
                    {row.kind === "placeholder" ? (
                      <PlaceholderRow row={row} onToggle={props.onToggle} />
                    ) : viewOptions.tableMode ? (
                      <TableLine
                        doc={doc}
                        lineIndex={row.lineIndex}
                        tableModel={tableModel}
                        kvTableModel={kvTableModel}
                        openPopover={openPopover}
                        onHoverItem={props.onHoverItem}
                        onClearHover={props.onClearHover}
                      />
                    ) : (
                      <LineRow
                        doc={doc}
                        row={row}
                        onHoverItem={props.onHoverItem}
                        onClearHover={props.onClearHover}
                      />
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {pop && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPop(null)} />
          <div
            className="no-scrollbar fixed z-50 max-h-[50vh] max-w-[480px] overflow-auto rounded border border-slate-200 bg-white p-2 shadow-lg"
            style={{ left: Math.max(8, Math.min(pop.x, window.innerWidth - 496)), top: pop.y }}
          >
            {pop.field && <div className="mb-1 font-mono text-[10px] text-teal-700">{pop.field}</div>}
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-slate-700">{pop.value}</pre>
          </div>
        </>
      )}
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded border px-2 py-0.5 ${
        on
          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
          : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

// Nested fold rails (line numbers dropped). Each rail belongs to an enclosing fold node;
// clicking it collapses that node (so a chain or residue can be folded from any of its lines).
// For a placeholder row, the collapsed node's own ▶ sits at the next rail slot.
function Gutter({
  maxDepth,
  gutterPx,
  lineIndex,
  ancestors,
  self,
  onToggle,
  onNodeEnter,
}: {
  maxDepth: number;
  gutterPx: number;
  lineIndex?: number;
  ancestors: FoldNode[];
  self?: FoldNode;
  onToggle: (id: string) => void;
  onNodeEnter: (node: FoldNode) => void;
}) {
  const slots = [];
  for (let k = 0; k < maxDepth; k++) {
    const a = ancestors[k];
    if (a) {
      // The category level owns a single chevron in its header row, so suppress the redundant
      // gutter chevron there; deeper levels (chain / residue) keep theirs.
      const atStart = lineIndex != null && a.startLine === lineIndex && a.level !== "category";
      slots.push(
        <Rail key={k} node={a} onToggle={onToggle} onNodeEnter={onNodeEnter}>
          {atStart ? "▼" : ""}
        </Rail>,
      );
    } else if (self && k === ancestors.length) {
      slots.push(
        <Rail key={k} node={self} onToggle={onToggle} onNodeEnter={onNodeEnter} chevron>
          ▶
        </Rail>,
      );
    } else {
      slots.push(<span key={k} style={{ width: RAIL_W }} className="shrink-0" />);
    }
  }
  return (
    <span className="sticky left-0 z-10 flex h-full items-center bg-white" style={{ width: gutterPx }}>
      <span className="shrink-0" style={{ width: GUTTER_PAD }} />
      {slots}
    </span>
  );
}

function Rail({
  node,
  onToggle,
  onNodeEnter,
  chevron,
  children,
}: {
  node: FoldNode;
  onToggle: (id: string) => void;
  onNodeEnter: (node: FoldNode) => void;
  chevron?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle(node.id);
      }}
      onMouseEnter={() => onNodeEnter(node)}
      className="group flex h-full shrink-0 items-center justify-center text-[9px] text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      style={{ width: RAIL_W }}
      title={`fold ${node.label}`}
    >
      {children || <span className="h-full w-px bg-slate-300 group-hover:bg-indigo-400" />}
    </button>
  );
}

function VerbatimContent({
  line,
  onHoverItem,
  onClearHover,
}: {
  line: CifDocument["lines"][number];
  onHoverItem: (cat: string, field: string, e: React.MouseEvent) => void;
  onClearHover: () => void;
}) {
  const tokens = tokenizeLine(line.text, { inTextBlock: line.inText });
  return (
    <span className="whitespace-pre pl-1 pr-4">
      {tokens.map((t, i) => {
        const text = line.text.slice(t.start, t.end);
        if (t.type === "item") {
          return (
            <span
              key={i}
              className={`${TOKEN_CLASS.item} cursor-help hover:underline`}
              onMouseEnter={(e) => onHoverItem(t.cat!, t.field!, e)}
              onMouseLeave={onClearHover}
            >
              {text}
            </span>
          );
        }
        return (
          <span key={i} className={TOKEN_CLASS[t.type]}>
            {text}
          </span>
        );
      })}
    </span>
  );
}

function LineRow({
  doc,
  row,
  onHoverItem,
  onClearHover,
}: {
  doc: CifDocument;
  row: Extract<VisibleRow, { kind: "line" }>;
  onHoverItem: (cat: string, field: string, e: React.MouseEvent) => void;
  onClearHover: () => void;
}) {
  return <VerbatimContent line={doc.lines[row.lineIndex]} onHoverItem={onHoverItem} onClearHover={onClearHover} />;
}

const cellPx = (w: number) => Math.round((w + 1) * CH_PX);

// Render a category's source line as table cells. A loop_ line becomes a column-header row and
// each data row-start line becomes aligned value cells; a key-value declaration line becomes an
// item | value row. Values come from the parsed fields (so wrapped / quoted / ;-multiline rows
// table correctly). The category name itself is rendered separately as the block header row.
// Everything else falls back to verbatim.
function TableLine({
  doc,
  lineIndex,
  tableModel,
  kvTableModel,
  openPopover,
  onHoverItem,
  onClearHover,
}: {
  doc: CifDocument;
  lineIndex: number;
  tableModel: Map<number, LoopTable>;
  kvTableModel: Map<number, KeyValueTable>;
  openPopover: (anchor: HTMLElement, value: string, field?: string) => void;
  onHoverItem: (cat: string, field: string, e: React.MouseEvent) => void;
  onClearHover: () => void;
}) {
  const si = doc.lineToSpan[lineIndex];
  const span = si >= 0 ? doc.spans[si] : null;
  const line = doc.lines[lineIndex];
  const table = si >= 0 ? tableModel.get(si) : undefined;

  if (span && span.kind === "loop" && table) {
    // Column-header row (the loop_ keyword line): the field names, aligned to the data columns.
    if (lineIndex === span.loopKeywordLine) {
      return (
        <span className="flex items-center pl-1 pr-4">
          {span.fieldNames.map((f, c) => (
            <span
              key={c}
              className="mr-1 inline-block shrink-0 overflow-hidden text-ellipsis whitespace-nowrap border-b border-slate-200 text-[10px] text-teal-700 hover:text-teal-900"
              style={{ width: cellPx(table.widths[c]) }}
              title={f}
              onMouseEnter={(e) => onHoverItem(span.category, f, e)}
              onMouseLeave={onClearHover}
            >
              {f}
            </span>
          ))}
        </span>
      );
    }
    // Data row-start line -> cells from parsed fields.
    const rowIndex = table.lineToRow.get(lineIndex);
    if (rowIndex !== undefined) {
      return (
        <span className="flex items-center pl-1 pr-4">
          {table.fields.map((fld, c) => (
            <DataCell
              key={c}
              value={fld ? fld.str(rowIndex) : ""}
              field={span.fieldNames[c]}
              w={table.widths[c]}
              openPopover={openPopover}
            />
          ))}
        </span>
      );
    }
  }

  // Key-value category: render the declaration line as an aligned item | value row.
  if (span && span.kind === "kv") {
    const kvt = kvTableModel.get(si);
    const item = kvt?.byLine.get(lineIndex);
    if (kvt && item) {
      return (
        <span className="flex items-center pl-1 pr-4">
          <span
            className="mr-2 inline-block shrink-0 cursor-help overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-slate-500 hover:text-slate-800"
            style={{ width: cellPx(kvt.itemWidth) }}
            title={item.attr}
            onMouseEnter={(e) => onHoverItem(span.category, item.attr, e)}
            onMouseLeave={onClearHover}
          >
            {item.attr}
          </span>
          <DataCell value={item.value} field={item.attr} w={kvt.valueWidth} openPopover={openPopover} />
        </span>
      );
    }
  }

  return <VerbatimContent line={line} onHoverItem={onHoverItem} onClearHover={onClearHover} />;
}

function DataCell({
  value,
  field,
  w,
  openPopover,
}: {
  value: string;
  field: string;
  w: number;
  openPopover: (anchor: HTMLElement, value: string, field?: string) => void;
}) {
  const placeholder = value === "?" || value === "." || value === "";
  const cls = placeholder
    ? "text-slate-400"
    : NUMERIC.test(value)
      ? "text-rose-700"
      : "text-slate-700";

  // Every cell keeps the SAME fixed width so columns never shift. Only genuinely long values
  // (multiline, or well past the column width) become click-to-expand — and even then the cell
  // stays fixed-width, signalled by a dotted underline rather than a layout-breaking box.
  const base = `mr-1 inline-block shrink-0 overflow-hidden text-ellipsis whitespace-nowrap ${cls}`;
  const expandable = value.includes("\n") || value.length > w + EXPAND_SLACK;
  if (!expandable) {
    return (
      <span className={base} style={{ width: cellPx(w) }}>
        {value === "" ? "·" : value}
      </span>
    );
  }
  return (
    <button
      className={`${base} cursor-pointer text-left underline decoration-slate-300 decoration-dotted underline-offset-2 hover:text-indigo-700 hover:decoration-indigo-400`}
      style={{ width: cellPx(w) }}
      title="click for full value"
      onClick={(e) => {
        e.stopPropagation();
        openPopover(e.currentTarget, value, field);
      }}
    >
      {value}
    </button>
  );
}

// A collapsed chain / residue / group summary. Rendered as a left-anchored navigation label
// (NOT aligned to the data columns) so these "chain A · 238 residues" rows read as an outline
// attached to the gutter rails, never mistaken for actual data values.
function PlaceholderRow({
  row,
  onToggle,
}: {
  row: Extract<VisibleRow, { kind: "placeholder" }>;
  onToggle: (id: string) => void;
}) {
  const click = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(row.node.id);
  };
  return (
    <button onClick={click} className="flex items-center gap-1.5 pl-1 pr-4 text-left text-slate-500 hover:bg-slate-100">
      <span className="select-none text-[9px] text-slate-400">▸</span>
      <span className="truncate">{row.node.label}</span>
      <span className="shrink-0 text-[10px] text-slate-400">… {row.hiddenCount.toLocaleString()} lines</span>
    </button>
  );
}

// A category block divider: the category name (+ row/item count) on a taller row whose top
// border separates it from the block above. Owns its own gutter (a fold chevron aligned to the
// category's rail slot) so the category can be collapsed/expanded from its header. Key-value
// categories carry an asterisk distinguishing them from loop_ categories.
function HeaderRow({
  row,
  gutterPx,
  onToggle,
  onHoverCategory,
  onClearHover,
}: {
  row: Extract<VisibleRow, { kind: "header" }>;
  gutterPx: number;
  onToggle: (id: string) => void;
  onHoverCategory: (cat: string, e: React.MouseEvent) => void;
  onClearHover: () => void;
}) {
  const { node, collapsed, summary } = row;
  const isKv = node.spanKind === "kv";
  const hiddenCount = node.endLine - node.startLine + 1;
  return (
    <span className="flex h-full w-full items-center border-t border-slate-200">
      <span className="sticky left-0 z-10 flex h-full shrink-0 items-center bg-white" style={{ width: gutterPx }}>
        <span className="shrink-0" style={{ width: GUTTER_PAD }} />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.id);
          }}
          className="flex h-full items-center justify-center text-[9px] text-slate-500 hover:text-slate-800"
          style={{ width: RAIL_W }}
          title={collapsed ? "expand" : "collapse"}
        >
          {collapsed ? "▶" : "▼"}
        </button>
      </span>
      <span className="flex min-w-0 items-baseline pl-1 pr-4">
        <span
          className="cursor-help text-[11px] font-semibold tracking-tight text-slate-700 hover:text-indigo-700"
          onMouseEnter={(e) => onHoverCategory(node.category, e)}
          onMouseLeave={onClearHover}
        >
          {node.category}
        </span>
        {isKv && (
          <span className="ml-0.5 select-none text-indigo-400" title="Key-value category">
            ∗
          </span>
        )}
        <span className="ml-2 shrink-0 text-[10px] text-slate-400">
          {collapsed ? `… ${hiddenCount.toLocaleString()} lines` : summary}
        </span>
      </span>
    </span>
  );
}
