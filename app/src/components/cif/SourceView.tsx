"use client";
import { useVirtualizer } from "@tanstack/react-virtual";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { CategorySpan, CifDocument } from "@/lib/cif-source/segment";
import type { FoldNode } from "@/lib/cif-source/fold-tree";
import type { VisibleRow } from "@/lib/cif-source/flatten";
import type { KeyValueTable, LoopTable } from "@/lib/cif-source/table";
import { type Token, tokenizeLine } from "@/lib/cif-source/tokenize";

const NUMERIC = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

const ROW_H = 18;
const HEADER_H = 30; // category header rows are taller, doubling as inter-block spacing
const CH_PX = 6.62; // approx monospace advance at 11px
const GUTTER_PAD = 8; // small left pad before the gutter / header chevron
const RAIL_W = 14; // width of the category fold-chevron column (data aligns under the header name)
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
  stickyHeader: boolean;
}

// A persistent popover anchored to a clicked cell / multiline value, dismissed by
// clicking away or Escape.
interface Popover {
  x: number;
  y: number;
  field?: string;
  value: string;
}

export interface SourceViewHandle {
  scrollToIndex: (index: number, align?: "start" | "center" | "end" | "auto") => void;
}

export interface SourceViewProps {
  doc: CifDocument;
  visible: VisibleRow[];
  viewOptions: ViewOptions;
  tableModel: Map<number, LoopTable>;
  kvTableModel: Map<number, KeyValueTable>;
  onToggle: (id: string) => void; // category fold chevron in the header rows
  onHoverItem: (cat: string, field: string, e: React.MouseEvent) => void;
  onHoverCategory: (cat: string, e: React.MouseEvent) => void;
  onClearHover: () => void;
  // 3D linkage
  onRowEnter: (lineIndex: number) => void;
  onNodeEnter: (node: FoldNode) => void;
  onStructLeave: () => void;
  onRowClick: (lineIndex: number) => void;
  onHeaderClick?: (node: FoldNode) => void;
  // Right-click -> open the references panel for the row / category (instead of the browser menu).
  onRowContextMenu?: (lineIndex: number) => void;
  onHeaderContextMenu?: (node: FoldNode) => void;
  // The full parsed-field line span for a line, so hover highlight covers the whole multiline value.
  fieldRange?: (lineIndex: number) => { start: number; end: number };
  // Outline sync: report the top visible source line on scroll; flash a line range on click-to.
  onTopLineChange?: (lineIndex: number) => void;
  highlightRange?: { start: number; end: number } | null;
  // Persistent pin: highlight the pinned line range / category header (the chip lives in the toolbar).
  pinnedRange?: { start: number; end: number } | null;
  pinnedHeaderId?: string | null;
}

const SourceView = forwardRef<SourceViewHandle, SourceViewProps>(function SourceView(props, ref) {
  const { doc, visible, viewOptions, tableModel, kvTableModel } = props;
  const parentRef = useRef<HTMLDivElement>(null);
  const gutterPx = GUTTER_PAD + RAIL_W;

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

  // Scroll-to handle for the outline pane (click an outline node -> scroll the source to it).
  useImperativeHandle(
    ref,
    () => ({ scrollToIndex: (index, align = "start") => virtualizer.scrollToIndex(index, { align }) }),
    [virtualizer],
  );

  // Sticky category header: the category whose rows are at the top of the viewport, plus the live
  // horizontal scroll offset so the pinned column headers stay aligned with the data columns.
  const [sticky, setSticky] = useState<{ si: number; category: string; isLoop: boolean } | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);

  // Hover highlight covering the whole parsed field (all lines of a multiline value), not just the
  // line under the cursor. A short grace-clear avoids a flicker when moving between a field's lines.
  const [hoverRange, setHoverRange] = useState<{ start: number; end: number } | null>(null);
  const hoverClearRef = useRef<number | null>(null);
  const cancelHoverClear = () => {
    if (hoverClearRef.current) {
      clearTimeout(hoverClearRef.current);
      hoverClearRef.current = null;
    }
  };
  const handleEnter = (row: VisibleRow) => {
    cancelHoverClear();
    if (row.kind === "line") {
      setHoverRange(props.fieldRange ? props.fieldRange(row.lineIndex) : { start: row.lineIndex, end: row.lineIndex });
      props.onRowEnter(row.lineIndex);
    } else {
      setHoverRange(null);
      props.onNodeEnter(row.node);
    }
  };
  const handleLeave = () => {
    cancelHoverClear();
    hoverClearRef.current = window.setTimeout(() => setHoverRange(null), 40);
    props.onStructLeave();
  };

  // Resolve the topmost visible row to its category. Returns null at a real header row (the header
  // is already on screen, so no duplicate sticky is needed).
  const computeSticky = useCallback(() => {
    const el = parentRef.current;
    if (!el) return null;
    const items = virtualizer.getVirtualItems();
    const it = items.find((v) => v.start + v.size > el.scrollTop) ?? items[0];
    const row = it ? visible[it.index] : undefined;
    if (!row || row.kind === "header") return null;
    const si = doc.lineToSpan[row.lineIndex];
    if (si < 0) return null;
    const span = doc.spans[si];
    return { si, category: span.category, isLoop: span.kind === "loop" };
  }, [virtualizer, visible, doc]);

  // rAF-throttled scroll handling: top-line reporting for source-scroll -> outline-selection, plus
  // the sticky-header category + horizontal offset.
  const scrollRaf = useRef<number | null>(null);
  const onScroll = () => {
    if (scrollRaf.current != null) return;
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = null;
      const el = parentRef.current;
      if (!el) return;
      setScrollLeft(el.scrollLeft);
      setSticky(computeSticky());
      if (props.onTopLineChange) {
        const items = virtualizer.getVirtualItems();
        const it = items.find((v) => v.start + v.size > el.scrollTop) ?? items[0];
        const row = it ? visible[it.index] : undefined;
        if (row) props.onTopLineChange(row.kind === "line" ? row.lineIndex : row.node.startLine);
      }
    });
  };

  // Recompute the sticky category when the visible rows change (expand/collapse, mode, filter) or on
  // first render; scroll-driven updates are handled in onScroll.
  useEffect(() => {
    setSticky(computeSticky());
  }, [computeSticky]);

  const contentWidth = useMemo(() => {
    let max = 0;
    for (const l of doc.lines) if (l.text.length > max) max = l.text.length;
    return gutterPx + Math.ceil(max * CH_PX) + 24;
  }, [doc, gutterPx]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
        {viewOptions.stickyHeader && sticky && (
          <StickyHeader
            span={doc.spans[sticky.si]}
            table={sticky.isLoop && viewOptions.tableMode ? tableModel.get(sticky.si) : undefined}
            gutterPx={gutterPx}
            scrollLeft={scrollLeft}
          />
        )}
        <div
          ref={parentRef}
          onScroll={onScroll}
          className="no-scrollbar min-h-0 flex-1 overflow-auto bg-white font-mono text-[11px]"
        >
        <div style={{ height: virtualizer.getTotalSize(), width: contentWidth, position: "relative" }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const row = visible[vi.index];
            const highlighted =
              row.kind === "line" &&
              props.highlightRange != null &&
              row.lineIndex >= props.highlightRange.start &&
              row.lineIndex <= props.highlightRange.end;
            const pinned =
              row.kind === "line"
                ? props.pinnedRange != null &&
                  row.lineIndex >= props.pinnedRange.start &&
                  row.lineIndex <= props.pinnedRange.end
                : props.pinnedHeaderId != null && row.node.id === props.pinnedHeaderId;
            const hovered =
              row.kind === "line" &&
              hoverRange != null &&
              row.lineIndex >= hoverRange.start &&
              row.lineIndex <= hoverRange.end;
            const rowBg = highlighted
              ? "bg-amber-100"
              : pinned
                ? "bg-indigo-50 shadow-[inset_3px_0_0_0_#6366f1]"
                : hovered
                  ? "bg-slate-100"
                  : "hover:bg-slate-50";
            return (
              <div
                key={vi.key}
                className={`absolute left-0 flex items-center ${rowBg}`}
                style={{ top: 0, height: vi.size, transform: `translateY(${vi.start}px)`, width: contentWidth }}
                onMouseEnter={() => handleEnter(row)}
                onMouseLeave={handleLeave}
                onClick={
                  row.kind === "line" ? () => props.onRowClick(row.lineIndex) : () => props.onHeaderClick?.(row.node)
                }
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (row.kind === "line") props.onRowContextMenu?.(row.lineIndex);
                  else props.onHeaderContextMenu?.(row.node);
                }}
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
                    <Gutter gutterPx={gutterPx} />
                    {viewOptions.tableMode ? (
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
});

export default SourceView;

// A fixed-width sticky spacer so the data content aligns under the category header name (the
// category's fold chevron lives in the header row). Chain/residue navigation is in the outline.
function Gutter({ gutterPx }: { gutterPx: number }) {
  return <span className="sticky left-0 z-10 h-full shrink-0 bg-white" style={{ width: gutterPx }} />;
}

// The sticky category header: the current category's name pinned to the top of the scroll viewport,
// plus (for loops in table mode) its column-header row kept horizontally aligned with the data via
// the live scrollLeft offset. Informational only (pointer-events-none) so it never intercepts the
// row clicks beneath it. The gutter spacer stays opaque and above the cells so columns scrolling
// under it are clipped, matching the real rows' sticky gutter.
function StickyHeader({
  span,
  table,
  gutterPx,
  scrollLeft,
}: {
  span: CategorySpan;
  table: LoopTable | undefined;
  gutterPx: number;
  scrollLeft: number;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 border-b border-slate-200 bg-white/95 font-mono shadow-sm backdrop-blur-sm">
      <div className="flex items-center" style={{ height: ROW_H }}>
        <span className="shrink-0" style={{ width: gutterPx }} />
        <span className="pl-1 text-[11px] font-semibold tracking-tight text-slate-700">{span.category}</span>
        {span.kind === "kv" && <span className="ml-0.5 text-indigo-400">∗</span>}
        {table && (
          <span className="ml-2 shrink-0 text-[10px] text-slate-400">{table.rowCount.toLocaleString()} rows</span>
        )}
      </div>
      {table && span.kind === "loop" && (
        <div className="flex items-center overflow-hidden" style={{ height: ROW_H }}>
          <span className="relative z-10 h-full shrink-0 bg-white" style={{ width: gutterPx }} />
          <span className="flex pl-1 pr-4" style={{ transform: `translateX(${-scrollLeft}px)` }}>
            {span.fieldNames.map((f, c) => (
              <span
                key={c}
                className="mr-1 inline-block shrink-0 overflow-hidden text-ellipsis whitespace-nowrap border-b border-slate-200 text-[10px] text-teal-700"
                style={{ width: cellPx(table.widths[c]) }}
              >
                {f}
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
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
              className="mr-1 inline-block shrink-0 cursor-help overflow-hidden text-ellipsis whitespace-nowrap border-b border-slate-200 text-[10px] text-teal-700 hover:text-teal-900"
              style={{ width: cellPx(table.widths[c]) }}
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
