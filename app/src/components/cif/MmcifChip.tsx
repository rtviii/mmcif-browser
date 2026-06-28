"use client";
import type { MouseEvent, ReactNode } from "react";
import { useStore } from "@/lib/store";
import type { HoverTarget } from "./dict-lookup";

// The one reusable mmCIF category / item element. Whatever the variant, hovering it raises the
// shared dictionary-definition tooltip (via the store), so category/item context looks and
// behaves the same everywhere it appears: the View menu, the filter panel, and (later) the
// reference-graph window. `onToggle` makes it a selectable filter row/chip; `onDigDeeper` is the
// Phase-5 reference-graph entry point (rendered only when wired).

export type MmcifTarget = NonNullable<HoverTarget>;

const labelOf = (t: MmcifTarget) => (t.kind === "category" ? t.cat : `_${t.cat}.${t.field}`);

export function MmcifChip({
  target,
  variant = "chip",
  selected = false,
  onToggle,
  onRemove,
  onDigDeeper,
  children,
}: {
  target: MmcifTarget;
  variant?: "chip" | "row" | "inline";
  selected?: boolean;
  onToggle?: () => void;
  onRemove?: () => void;
  onDigDeeper?: () => void;
  children?: ReactNode;
}) {
  const setHoverDef = useStore((s) => s.setHoverDef);
  const scheduleClearHoverDef = useStore((s) => s.scheduleClearHoverDef);
  const isCat = target.kind === "category";
  const text = children ?? labelOf(target);

  const onEnter = (e: MouseEvent) => setHoverDef(target, { x: e.clientX, y: e.clientY });
  const onLeave = () => scheduleClearHoverDef();

  // Item labels read better split into the muted `_cat.` prefix and the teal attribute.
  const labelNode =
    children ?? (isCat ? text : <ItemLabel cat={target.cat} field={target.field} />);

  if (variant === "inline") {
    return (
      <span
        className={`cursor-help font-mono ${isCat ? "text-slate-700 hover:text-indigo-700" : "text-teal-700 hover:underline"}`}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      >
        {labelNode}
      </span>
    );
  }

  if (variant === "row") {
    return (
      <div
        className={`group flex w-full items-center gap-2 rounded px-1.5 py-0.5 ${
          selected ? "bg-indigo-50" : "hover:bg-slate-50"
        }`}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      >
        {onToggle && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border text-[9px] leading-none ${
              selected
                ? "border-indigo-500 bg-indigo-500 text-white"
                : "border-slate-300 bg-white text-transparent hover:border-indigo-400"
            }`}
            title={selected ? "remove from filter" : "add to filter"}
          >
            ✓
          </button>
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{labelNode}</span>
        {onDigDeeper && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDigDeeper();
            }}
            className="shrink-0 text-[11px] text-slate-300 opacity-0 group-hover:opacity-100 hover:text-indigo-600"
            title="references — what links here / what this links to"
          >
            ⧉
          </button>
        )}
      </div>
    );
  }

  // chip
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded px-1 font-mono text-[10px] ${
        isCat ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-600"
      } ${onToggle ? "cursor-pointer hover:brightness-95" : "cursor-help"}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onToggle}
    >
      <span className="max-w-[160px] truncate">{labelNode}</span>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 text-slate-400 hover:text-slate-700"
          title="remove"
        >
          ×
        </button>
      )}
    </span>
  );
}

function ItemLabel({ cat, field }: { cat: string; field: string }) {
  return (
    <>
      <span className="text-slate-400">_{cat}.</span>
      <span className="text-teal-700">{field}</span>
    </>
  );
}
