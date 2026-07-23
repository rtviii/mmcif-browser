// Shared presentation primitives for the two mmCIF source renderers: the Inspector's SourceView
// and the proposal page's CifPanel. The column-width model is the only thing that makes loop rows
// line up (every cell is a fixed pixel width derived from LoopTable.widths, so a column never
// shifts as you scroll into rows with longer values), and it was previously private to SourceView
// while CifPanel used a content-sized <table> — which is why the proposal figures did not align.

import type { TokenType } from "@/lib/cif-source/tokenize";

export const NUMERIC = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export const CH_PX = 6.62; // IBM Plex Mono advance at 11px
export const EXPAND_SLACK = 12; // chars a value may exceed its column before it becomes click-to-expand

/** Pixel width of a column that is `w` characters wide. Both renderers must use this. */
export const cellPx = (w: number) => Math.round((w + 1) * CH_PX);

/** The Inspector: syntax-coloured source. */
export const TOKEN_CLASS: Record<TokenType, string> = {
  keyword: "text-indigo-600",
  comment: "text-slate-400 italic",
  item: "text-teal-700",
  string: "text-amber-700",
  number: "text-rose-700",
  text: "text-slate-700",
};

/** The proposal figures: monochrome. The only colour in that panel is the network rail, so a
 *  colour in the source means exactly what the same colour means in the viewer beside it. */
export const TOKEN_CLASS_MUTED: Record<TokenType, string> = {
  keyword: "text-slate-400",
  comment: "text-slate-400 italic",
  item: "text-slate-500",
  string: "text-slate-600",
  number: "text-slate-600 tabular-nums",
  text: "text-slate-700",
};

/** Cell text colour by value kind. `muted` drops the syntax hue for the proposal figures. */
export function cellClass(value: string, muted = false): string {
  if (value === "?" || value === "." || value === "") return "text-slate-400";
  if (NUMERIC.test(value)) return muted ? "text-slate-600 tabular-nums" : "text-rose-700";
  return "text-slate-700";
}
