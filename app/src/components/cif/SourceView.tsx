"use client";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";
import type { CifDocument } from "@/lib/cif-source/segment";
import type { FoldNode, HierarchyMode } from "@/lib/cif-source/fold-tree";
import type { VisibleRow } from "@/lib/cif-source/flatten";
import { splitValues, type Token, tokenizeLine } from "@/lib/cif-source/tokenize";

const NUMERIC = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

const ROW_H = 18;
const CH_PX = 6.62; // approx monospace advance at 11px
const LINE_NUM_W = 50;
const RAIL_W = 13;

const TOKEN_CLASS: Record<Token["type"], string> = {
  keyword: "text-sky-400",
  comment: "text-neutral-600 italic",
  item: "text-emerald-300",
  string: "text-amber-300",
  number: "text-orange-300",
  text: "text-neutral-300",
};

export interface ViewOptions {
  hideNoise: boolean;
  collapsePreamble: boolean;
  tableMode: boolean;
}

export interface SourceViewProps {
  doc: CifDocument;
  visible: VisibleRow[];
  mode: HierarchyMode;
  viewOptions: ViewOptions;
  maxDepth: number;
  colWidths: Map<number, number[]>;
  onModeChange: (m: HierarchyMode) => void;
  onToggleNoise: () => void;
  onToggleTable: () => void;
  onTogglePreamble: () => void;
  onToggle: (id: string) => void;
  onCollapseChains: () => void;
  onExpandAll: () => void;
  onHoverItem: (cat: string, field: string) => void;
  onClearHover: () => void;
  // 3D linkage
  onRowEnter: (lineIndex: number) => void;
  onNodeEnter: (node: FoldNode) => void;
  onStructLeave: () => void;
  onRowClick: (lineIndex: number) => void;
}

export default function SourceView(props: SourceViewProps) {
  const { doc, visible, mode, viewOptions, maxDepth, colWidths } = props;
  const parentRef = useRef<HTMLDivElement>(null);
  const gutterPx = LINE_NUM_W + maxDepth * RAIL_W;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleCell = (key: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 30,
  });

  const contentWidth = useMemo(() => {
    let max = 0;
    for (const l of doc.lines) if (l.text.length > max) max = l.text.length;
    return gutterPx + Math.ceil(max * CH_PX) + 24;
  }, [doc, gutterPx]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-neutral-800 px-2 text-[11px]">
        <div className="flex overflow-hidden rounded border border-neutral-700">
          {(["auth", "label"] as const).map((m) => (
            <button
              key={m}
              onClick={() => props.onModeChange(m)}
              className={`px-2 py-0.5 font-mono ${
                mode === m ? "bg-sky-600 text-white" : "bg-neutral-900 text-neutral-400 hover:bg-neutral-800"
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
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-neutral-300 hover:bg-neutral-800"
        >
          Collapse chains
        </button>
        <button
          onClick={props.onExpandAll}
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-neutral-300 hover:bg-neutral-800"
        >
          Expand all
        </button>
        <span className="ml-auto font-mono text-neutral-600">{visible.length.toLocaleString()} rows</span>
      </div>

      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto bg-neutral-950 font-mono text-[11px]">
        <div style={{ height: virtualizer.getTotalSize(), width: contentWidth, position: "relative" }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const row = visible[vi.index];
            const enter = () =>
              row.kind === "line" ? props.onRowEnter(row.lineIndex) : props.onNodeEnter(row.node);
            return (
              <div
                key={vi.key}
                className="absolute left-0 flex items-center hover:bg-neutral-900/40"
                style={{ top: 0, height: ROW_H, transform: `translateY(${vi.start}px)`, width: contentWidth }}
                onMouseEnter={enter}
                onMouseLeave={props.onStructLeave}
                onClick={row.kind === "line" ? () => props.onRowClick(row.lineIndex) : undefined}
              >
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
                    colWidths={colWidths}
                    expanded={expanded}
                    toggleCell={toggleCell}
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded border px-2 py-0.5 ${
        on
          ? "border-sky-600 bg-sky-600/20 text-sky-300"
          : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:bg-neutral-800"
      }`}
    >
      {children}
    </button>
  );
}

// Line number + nested fold rails. Each rail belongs to an enclosing fold node; clicking
// it collapses that node (so a chain or residue can be folded from any of its lines). For a
// placeholder row, the collapsed node's own ▶ sits at the next rail slot.
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
      const atStart = lineIndex != null && a.startLine === lineIndex;
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
    <span className="sticky left-0 z-10 flex h-full items-center bg-neutral-950" style={{ width: gutterPx }}>
      <span className="shrink-0 select-none pr-2 text-right text-[10px] text-neutral-700" style={{ width: LINE_NUM_W }}>
        {lineIndex != null ? lineIndex + 1 : ""}
      </span>
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
      className="group flex h-full shrink-0 items-center justify-center text-[9px] text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-100"
      style={{ width: RAIL_W }}
      title={`fold ${node.label}`}
    >
      {children || <span className="h-full w-px bg-neutral-700 group-hover:bg-sky-500" />}
    </button>
  );
}

function VerbatimContent({
  line,
  onHoverItem,
  onClearHover,
}: {
  line: CifDocument["lines"][number];
  onHoverItem: (cat: string, field: string) => void;
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
              onMouseEnter={() => onHoverItem(t.cat!, t.field!)}
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
  onHoverItem: (cat: string, field: string) => void;
  onClearHover: () => void;
}) {
  return <VerbatimContent line={doc.lines[row.lineIndex]} onHoverItem={onHoverItem} onClearHover={onClearHover} />;
}

const cellPx = (w: number) => Math.round((w + 1) * CH_PX);

// Render a single source line as table cells when it belongs to a loop: the loop_ line
// becomes a column-header row, data rows become aligned value cells. Everything else
// (key-value categories, block headers) falls back to verbatim.
function TableLine({
  doc,
  lineIndex,
  colWidths,
  expanded,
  toggleCell,
  onHoverItem,
  onClearHover,
}: {
  doc: CifDocument;
  lineIndex: number;
  colWidths: Map<number, number[]>;
  expanded: Set<string>;
  toggleCell: (key: string) => void;
  onHoverItem: (cat: string, field: string) => void;
  onClearHover: () => void;
}) {
  const si = doc.lineToSpan[lineIndex];
  const span = si >= 0 ? doc.spans[si] : null;
  const line = doc.lines[lineIndex];

  if (span && span.kind === "loop") {
    const widths = colWidths.get(si);
    if (widths && lineIndex === span.loopKeywordLine) {
      return (
        <span className="flex items-center pl-1 pr-4">
          <span className="mr-2 shrink-0 text-[10px] uppercase tracking-wide text-sky-400">{span.category}</span>
          {span.fieldNames.map((f, c) => (
            <span
              key={c}
              className="mr-1 inline-block shrink-0 overflow-hidden text-ellipsis whitespace-nowrap border-b border-neutral-700 text-[10px] text-emerald-300/90 hover:text-emerald-200"
              style={{ width: cellPx(widths[c]) }}
              title={f}
              onMouseEnter={() => onHoverItem(span.category, f)}
              onMouseLeave={onClearHover}
            >
              {f}
            </span>
          ))}
        </span>
      );
    }
    if (widths && span.dataStart >= 0 && lineIndex >= span.dataStart) {
      const vals = splitValues(line.text);
      if (vals.length === span.fieldNames.length) {
        return (
          <span className="flex items-center pl-1 pr-4">
            {vals.map((v, c) => (
              <DataCell
                key={c}
                value={v}
                w={widths[c]}
                cellKey={`${lineIndex}:${c}`}
                expanded={expanded}
                toggleCell={toggleCell}
              />
            ))}
          </span>
        );
      }
    }
  }
  return <VerbatimContent line={line} onHoverItem={onHoverItem} onClearHover={onClearHover} />;
}

function DataCell({
  value,
  w,
  cellKey,
  expanded,
  toggleCell,
}: {
  value: string;
  w: number;
  cellKey: string;
  expanded: Set<string>;
  toggleCell: (key: string) => void;
}) {
  const cls =
    value === "?" || value === "." || value === ""
      ? "text-neutral-600"
      : NUMERIC.test(value)
        ? "text-orange-300"
        : "text-neutral-300";
  const truncated = value.length > w;
  if (expanded.has(cellKey)) {
    return (
      <span
        className={`mr-1 inline-block shrink-0 cursor-pointer whitespace-pre-wrap break-all ${cls}`}
        style={{ maxWidth: 360 }}
        onClick={(e) => {
          e.stopPropagation();
          toggleCell(cellKey);
        }}
      >
        {value}
      </span>
    );
  }
  return (
    <span
      className={`mr-1 inline-block shrink-0 overflow-hidden text-ellipsis whitespace-nowrap ${cls} ${
        truncated ? "cursor-pointer underline decoration-dotted decoration-neutral-600" : ""
      }`}
      style={{ width: cellPx(w) }}
      title={truncated ? value : undefined}
      onClick={truncated ? (e) => { e.stopPropagation(); toggleCell(cellKey); } : undefined}
    >
      {value === "" ? "·" : value}
    </span>
  );
}

function PlaceholderRow({
  row,
  onToggle,
}: {
  row: Extract<VisibleRow, { kind: "placeholder" }>;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle(row.node.id);
      }}
      className="flex items-center gap-2 pl-1 pr-4 text-left hover:bg-neutral-900/60"
    >
      <span className="text-neutral-400">{row.node.label}</span>
      <span className="text-[10px] text-neutral-600">… {row.hiddenCount.toLocaleString()} lines</span>
    </button>
  );
}
