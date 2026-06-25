"use client";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";
import type { CifDocument } from "@/lib/cif-source/segment";
import type { HierarchyMode } from "@/lib/cif-source/fold-tree";
import type { VisibleRow } from "@/lib/cif-source/flatten";
import { type Token, tokenizeLine } from "@/lib/cif-source/tokenize";

const ROW_H = 18;
const CH_PX = 6.62; // approx monospace advance at 11px
const GUTTER_PX = 88; // line number + fold column

const TOKEN_CLASS: Record<Token["type"], string> = {
  keyword: "text-sky-400",
  comment: "text-neutral-600 italic",
  item: "text-emerald-300",
  string: "text-amber-300",
  number: "text-orange-300",
  text: "text-neutral-300",
};

export interface SourceViewProps {
  doc: CifDocument;
  visible: VisibleRow[];
  mode: HierarchyMode;
  onModeChange: (m: HierarchyMode) => void;
  onToggle: (id: string) => void;
  onCollapseChains: () => void;
  onExpandAll: () => void;
  onHoverItem: (cat: string, field: string) => void;
  onClearHover: () => void;
}

export default function SourceView({
  doc,
  visible,
  mode,
  onModeChange,
  onToggle,
  onCollapseChains,
  onExpandAll,
  onHoverItem,
  onClearHover,
}: SourceViewProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 30,
  });

  // Width of the horizontally-scrollable content (longest line). O(lines), memoized per file.
  const contentWidth = useMemo(() => {
    let max = 0;
    for (const l of doc.lines) if (l.text.length > max) max = l.text.length;
    return GUTTER_PX + Math.ceil(max * CH_PX) + 24;
  }, [doc]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-neutral-800 px-2 text-[11px]">
        <div className="flex overflow-hidden rounded border border-neutral-700">
          {(["auth", "label"] as const).map((m) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              className={`px-2 py-0.5 font-mono ${
                mode === m ? "bg-sky-600 text-white" : "bg-neutral-900 text-neutral-400 hover:bg-neutral-800"
              }`}
            >
              {m}_*
            </button>
          ))}
        </div>
        <button
          onClick={onCollapseChains}
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-neutral-300 hover:bg-neutral-800"
        >
          Collapse chains
        </button>
        <button
          onClick={onExpandAll}
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
            return (
              <div
                key={vi.key}
                className="absolute left-0 flex items-center"
                style={{ top: 0, height: ROW_H, transform: `translateY(${vi.start}px)`, width: contentWidth }}
              >
                {row.kind === "line" ? (
                  <LineRow doc={doc} row={row} onToggle={onToggle} onHoverItem={onHoverItem} onClearHover={onClearHover} />
                ) : (
                  <PlaceholderRow row={row} onToggle={onToggle} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Chevron({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-3.5 shrink-0 text-center text-[9px] text-neutral-500 hover:text-neutral-200"
    >
      {open ? "▼" : "▶"}
    </button>
  );
}

function Gutter({ num, children }: { num?: number; children?: React.ReactNode }) {
  return (
    <span
      className="sticky left-0 z-10 flex h-full items-center bg-neutral-950"
      style={{ width: GUTTER_PX }}
    >
      <span className="w-[52px] shrink-0 select-none pr-2 text-right text-[10px] text-neutral-700">
        {num != null ? num : ""}
      </span>
      <span className="flex w-9 shrink-0 items-center">{children}</span>
    </span>
  );
}

function LineRow({
  doc,
  row,
  onToggle,
  onHoverItem,
  onClearHover,
}: {
  doc: CifDocument;
  row: Extract<VisibleRow, { kind: "line" }>;
  onToggle: (id: string) => void;
  onHoverItem: (cat: string, field: string) => void;
  onClearHover: () => void;
}) {
  const line = doc.lines[row.lineIndex];
  const tokens = tokenizeLine(line.text, { inTextBlock: line.inText });
  return (
    <>
      <Gutter num={row.lineIndex + 1}>
        {row.starts.map((n) => (
          <Chevron key={n.id} open onClick={() => onToggle(n.id)} />
        ))}
      </Gutter>
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
    </>
  );
}

function PlaceholderRow({
  row,
  onToggle,
}: {
  row: Extract<VisibleRow, { kind: "placeholder" }>;
  onToggle: (id: string) => void;
}) {
  const indent = row.node.level === "residue" ? 12 : 0;
  return (
    <>
      <Gutter>
        {row.ancestorStarts.map((n) => (
          <Chevron key={n.id} open onClick={() => onToggle(n.id)} />
        ))}
        <Chevron open={false} onClick={() => onToggle(row.node.id)} />
      </Gutter>
      <button
        onClick={() => onToggle(row.node.id)}
        className="flex items-center gap-2 pr-4 text-left hover:bg-neutral-900/60"
        style={{ paddingLeft: indent }}
      >
        <span className="text-neutral-400">{row.node.label}</span>
        <span className="text-[10px] text-neutral-600">… {row.hiddenCount.toLocaleString()} lines</span>
      </button>
    </>
  );
}
