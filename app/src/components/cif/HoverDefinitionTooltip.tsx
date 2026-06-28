"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/lib/store";
import { type HoverTarget, lookupDefinition } from "./dict-lookup";

const SHOW_DELAY_MS = 350; // hover dwell before the tooltip appears
const W = 360;
const H_MAX = 300;
const PAD = 8;

// Floating dictionary-definition tooltip. The same content appears ~350ms after hovering a
// category name / item / field, anchored near the pointer. Unlike before, it is reachable: it
// accepts pointer events and, together with the store's grace-period clear, the pointer can
// travel into it without dismissing it. A "References" action opens the dig-deeper panel.
// Portaled to <body> so the source view's overflow ancestors don't clip it.
export function HoverDefinitionTooltip({
  hover,
  anchor,
}: {
  hover: HoverTarget;
  anchor: { x: number; y: number } | null;
}) {
  const dict = useStore((s) => s.dict);
  const cancelClear = useStore((s) => s.cancelClearHoverDef);
  const scheduleClear = useStore((s) => s.scheduleClearHoverDef);
  const clearHover = useStore((s) => s.clearHoverDef);
  const openRefPanel = useStore((s) => s.openRefPanel);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!hover) {
      setShown(false);
      return;
    }
    const id = setTimeout(() => setShown(true), SHOW_DELAY_MS);
    return () => clearTimeout(id);
  }, [hover]);

  const content = useMemo(() => lookupDefinition(dict, hover), [dict, hover]);

  if (!shown || !content || !anchor || typeof document === "undefined") return null;

  const left = Math.max(PAD, Math.min(anchor.x + 12, window.innerWidth - W - PAD));
  const top =
    anchor.y + 18 + H_MAX > window.innerHeight
      ? Math.max(PAD, anchor.y - H_MAX - 8) // flip above if it would overflow the bottom
      : anchor.y + 18;

  const openRefs = () => {
    if (!hover) return;
    openRefPanel(hover);
    clearHover();
  };

  return createPortal(
    <div
      className="no-scrollbar pointer-events-auto fixed z-[70] flex flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg"
      style={{ left, top, width: W, maxHeight: H_MAX }}
      onMouseEnter={cancelClear}
      onMouseLeave={scheduleClear}
    >
      <div className="no-scrollbar flex-1 overflow-auto p-2.5">
        <div className="font-mono text-[12px] text-slate-800">{content.title}</div>
        <div className="mt-1 flex flex-wrap gap-2 font-mono text-[10px] text-slate-400">
          {content.type && <span>type: {content.type}</span>}
          {content.mandatory && <span>mandatory: {content.mandatory}</span>}
          {content.units && <span>units: {content.units}</span>}
          {content.group && <span>groups: {content.group}</span>}
        </div>
        {content.note && <div className="mt-1 text-[11px] text-amber-700">{content.note}</div>}
        {content.body && (
          <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-600">
            {content.body}
          </p>
        )}
        {content.enums && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {content.enums.map(([v]) => (
              <span
                key={v}
                className="rounded bg-indigo-50 px-1 font-mono text-[10px] text-indigo-700"
              >
                {v}
              </span>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={openRefs}
        className="flex shrink-0 items-center gap-1 border-t border-slate-100 px-2.5 py-1.5 text-left text-[11px] text-slate-500 hover:bg-indigo-50 hover:text-indigo-700"
        title="references — what links here / what this links to"
      >
        <span className="font-mono">⧉</span> References
      </button>
    </div>,
    document.body,
  );
}
