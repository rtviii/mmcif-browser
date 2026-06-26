"use client";
import { useVirtualizer } from "@tanstack/react-virtual";
import { forwardRef, useImperativeHandle, useRef } from "react";
import type { FoldNode } from "@/lib/cif-source/fold-tree";
import type { OutlineRow } from "@/lib/cif-source/outline";

const OUTLINE_ROW_H = 20;
const INDENT_PX = 12;
const CHEVRON_W = 12;

export interface OutlinePaneHandle {
  scrollToIndex: (index: number) => void;
}

interface OutlinePaneProps {
  rows: OutlineRow[];
  activeId: string | null;
  onToggle: (id: string) => void;
  onNodeEnter: (node: FoldNode) => void;
  onNodeLeave: () => void;
  onNodeClick: (node: FoldNode) => void;
}

// A persistent document-outline tree: every category, with atom_site (and the grouped
// categories) expandable into chains -> residues. Hovering a node highlights it in 3D;
// clicking scrolls the (pristine) source view to it. Virtualized — a chain can hold
// thousands of residues. Selection (`activeId`) is styling-only, driven by source scroll.
export const OutlinePane = forwardRef<OutlinePaneHandle, OutlinePaneProps>(function OutlinePane(
  { rows, activeId, onToggle, onNodeEnter, onNodeLeave, onNodeClick },
  ref,
) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => OUTLINE_ROW_H,
    overscan: 20,
  });

  useImperativeHandle(
    ref,
    () => ({ scrollToIndex: (index: number) => virtualizer.scrollToIndex(index, { align: "auto" }) }),
    [virtualizer],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center border-b border-slate-200 px-3 text-[11px] font-semibold tracking-tight text-slate-500">
        Outline
      </div>
      <div ref={parentRef} className="no-scrollbar min-h-0 flex-1 overflow-auto bg-white text-[11px]">
        <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const row = rows[vi.index];
            const node = row.node;
            const active = node.id === activeId;
            const tone =
              node.level === "category"
                ? "font-medium text-slate-700"
                : node.level === "residue"
                  ? "text-slate-500"
                  : "text-slate-600";
            return (
              <div
                key={vi.key}
                className={`absolute left-0 right-0 flex items-center pr-2 ${
                  active ? "bg-indigo-50" : "hover:bg-slate-50"
                }`}
                style={{
                  top: 0,
                  height: vi.size,
                  transform: `translateY(${vi.start}px)`,
                  paddingLeft: 4 + row.depth * INDENT_PX,
                }}
                onMouseEnter={() => onNodeEnter(node)}
                onMouseLeave={onNodeLeave}
                onClick={() => onNodeClick(node)}
              >
                {row.expandable ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle(node.id);
                    }}
                    className="flex h-full shrink-0 items-center justify-center text-[8px] text-slate-400 hover:text-slate-700"
                    style={{ width: CHEVRON_W }}
                    title={row.expanded ? "collapse" : "expand"}
                  >
                    {row.expanded ? "▼" : "▶"}
                  </button>
                ) : (
                  <span className="shrink-0" style={{ width: CHEVRON_W }} />
                )}
                <span
                  className={`min-w-0 flex-1 truncate font-mono ${active ? "text-indigo-700" : tone}`}
                  title={node.label}
                >
                  {node.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
