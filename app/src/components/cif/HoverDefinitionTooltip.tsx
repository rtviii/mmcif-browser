"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/lib/store";
import { type HoverTarget, lookupDefinition } from "./dict-lookup";

const SHOW_DELAY_MS = 1000; // hover dwell before the tooltip appears
const W = 360;
const H_MAX = 280;
const PAD = 8;

// Floating dictionary-definition tooltip. Replaces the old fixed bottom panel: the same
// content appears ~1s after hovering a category name / item / field, anchored near the
// pointer, and dismisses on mouse-leave (hover -> null). Portaled to <body> so the source
// view's overflow ancestors don't clip it; pointer-events-none so it never steals the hover.
export function HoverDefinitionTooltip({
  hover,
  anchor,
}: {
  hover: HoverTarget;
  anchor: { x: number; y: number } | null;
}) {
  const dict = useStore((s) => s.dict);
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

  return createPortal(
    <div
      className="no-scrollbar pointer-events-none fixed z-50 overflow-auto rounded-md border border-slate-200 bg-white p-2.5 shadow-lg"
      style={{ left, top, width: W, maxHeight: H_MAX }}
    >
      <div className="font-mono text-[12px] text-slate-800">{content.title}</div>
      <div className="mt-1 flex flex-wrap gap-2 font-mono text-[10px] text-slate-400">
        {content.type && <span>type: {content.type}</span>}
        {content.mandatory && <span>mandatory: {content.mandatory}</span>}
        {content.units && <span>units: {content.units}</span>}
        {content.group && <span>groups: {content.group}</span>}
      </div>
      {content.note && <div className="mt-1 text-[11px] text-amber-700">{content.note}</div>}
      {content.body && (
        <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-600">{content.body}</p>
      )}
      {content.enums && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {content.enums.map(([v]) => (
            <span key={v} className="rounded bg-indigo-50 px-1 font-mono text-[10px] text-indigo-700">
              {v}
            </span>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
