"use client";
import { useEffect, useState } from "react";
import { cellClass, cellPx, EXPAND_SLACK } from "./source-style";

// One fixed-width cell of a loop row, shared by the Inspector's SourceView and the proposal's
// CifPanel. The fixed width is what keeps columns aligned; a value too long for its column does
// NOT widen the cell (that would break the alignment of every row below it) but becomes
// click-to-expand, signalled by a dotted underline. buildLoopTable caps columns at 28 chars, so
// without this the longest strings in a file — e.g. an occupancy constraint's `details` — would
// be silently truncated with no way to read them.

export interface Popover {
  x: number;
  y: number;
  field?: string;
  value: string;
}

export type OpenPopover = (anchor: HTMLElement, value: string, field?: string) => void;

export function usePopover(): [Popover | null, OpenPopover, () => void] {
  const [pop, setPop] = useState<Popover | null>(null);
  const open: OpenPopover = (anchor, value, field) => {
    const r = anchor.getBoundingClientRect();
    setPop({ x: r.left, y: r.bottom + 4, value, field });
  };
  useEffect(() => {
    if (!pop) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPop(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pop]);
  return [pop, open, () => setPop(null)];
}

export function PopoverLayer({ pop, onClose }: { pop: Popover | null; onClose: () => void }) {
  if (!pop) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="no-scrollbar fixed z-50 max-h-[50vh] max-w-[480px] overflow-auto rounded border border-slate-200 bg-white p-2 shadow-lg"
        style={{ left: Math.max(8, Math.min(pop.x, window.innerWidth - 496)), top: pop.y }}
      >
        {pop.field && <div className="mb-1 font-mono text-[10px] text-teal-700">{pop.field}</div>}
        <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-slate-700">{pop.value}</pre>
      </div>
    </>
  );
}

export function DataCell({
  value,
  field,
  w,
  openPopover,
  muted = false,
}: {
  value: string;
  field: string;
  w: number;
  openPopover: OpenPopover;
  muted?: boolean;
}) {
  const base = `mr-1 inline-block shrink-0 overflow-hidden text-ellipsis whitespace-nowrap ${cellClass(value, muted)}`;
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
      className={`${base} cursor-pointer text-left underline decoration-slate-300 decoration-dotted underline-offset-2 hover:text-slate-900 hover:decoration-slate-500`}
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
