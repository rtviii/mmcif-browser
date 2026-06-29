// Table-mode model for a loop: maps the verbatim source lines of a loop onto its parsed
// rows so the renderer can show column-aligned cells whose VALUES come from Mol*'s parsed
// fields (handling quoting, ;-multiline text, and rows that wrap across physical lines),
// not from re-splitting the source line.
//
// A loop row may occupy several physical lines (e.g. entity_poly with a long sequence in a
// ;...; block). We group physical data lines until a full row's worth of values has been
// seen; the first line of each row is a "row start" the renderer turns into a table row,
// the rest are continuation lines hidden in table mode.

import type { CifDocument, KeyValueSpan, LoopSpan } from "./segment";
import type { MolCifField, MolCifFile } from "./types";
import { splitValues } from "./tokenize";

export interface LoopTable {
  fields: (MolCifField | undefined)[]; // one per declared field, column order
  rowCount: number;
  lineToRow: Map<number, number>; // data row-start line index -> parsed row index
  contLines: number[]; // data lines that are NOT row starts (hidden in table mode)
  widths: number[]; // per-column display width, in characters
}

export interface KeyValueItem {
  attr: string;
  lineIndex: number; // the `_cat.attr` declaration line
  value: string; // parsed value (row 0), handles quoting / ;-multiline
}

export interface KeyValueTable {
  items: KeyValueItem[]; // in source order
  byLine: Map<number, KeyValueItem>; // declaration line -> item, for O(1) render lookup
  itemWidth: number; // item-name column width, in characters
  valueWidth: number; // value column width, in characters
}

const MAX_W = 28;
const SAMPLE_ROWS = 60;

// Two-column (item | value) model for a key-value category. Values come from Mol*'s parsed
// fields (single-row category, row 0) so quoting and ;-multiline text resolve the same way
// loop cells do. The category name itself is rendered separately as the block header.
export function buildKeyValueTable(doc: CifDocument, span: KeyValueSpan, file: MolCifFile): KeyValueTable | null {
  const cat = file.blocks[span.block]?.categories[span.category];
  const items: KeyValueItem[] = [];
  let itemW = 0;
  let valW = 0;
  for (const [attr, lineIndex] of Object.entries(span.itemLines)) {
    const fld = cat?.getField(attr);
    const value = fld ? fld.str(0) : "";
    items.push({ attr, lineIndex, value });
    if (attr.length > itemW) itemW = attr.length;
    const firstLineLen = value.includes("\n") ? value.indexOf("\n") : value.length;
    if (firstLineLen > valW) valW = Math.min(MAX_W, firstLineLen);
  }
  if (!items.length) return null;
  items.sort((a, b) => a.lineIndex - b.lineIndex);
  const byLine = new Map<number, KeyValueItem>(items.map((it) => [it.lineIndex, it]));
  return { items, byLine, itemWidth: Math.min(itemW, MAX_W), valueWidth: valW };
}

export function buildLoopTable(doc: CifDocument, span: LoopSpan, file: MolCifFile): LoopTable | null {
  if (span.dataStart < 0) return null;
  const cat = file.blocks[span.block]?.categories[span.category];
  if (!cat) return null;

  const fields = span.fieldNames.map((f) => cat.getField(f));
  const rowCount = cat.rowCount;

  const lineToRow = buildLineToRow(doc, span, rowCount);

  const contLines: number[] = [];
  for (let ln = span.dataStart; ln <= span.dataEnd; ln++) {
    if (!lineToRow.has(ln)) contLines.push(ln);
  }

  const widths = span.fieldNames.map((f) => Math.min(f.length, MAX_W));
  const sample = Math.min(rowCount, SAMPLE_ROWS);
  for (let c = 0; c < fields.length; c++) {
    const fld = fields[c];
    if (!fld) continue;
    let w = widths[c];
    for (let r = 0; r < sample && w < MAX_W; r++) {
      const len = fld.str(r).length;
      if (len > w) w = Math.min(MAX_W, len);
    }
    widths[c] = w;
  }

  return { fields, rowCount, lineToRow, contLines, widths };
}

// Map each data row-start physical line to its parsed row index. Continuation lines of a
// wrapped row are absent from the map (they become contLines, hidden in table mode).
export function buildLineToRow(doc: CifDocument, span: LoopSpan, rowCount: number): Map<number, number> {
  const lineToRow = new Map<number, number>();
  if (span.dataStart < 0) return lineToRow;
  rowStarts(doc, span, rowCount).forEach((ln, ri) => lineToRow.set(ln, ri));
  return lineToRow;
}

// Map EVERY data line — row-start AND continuation lines of a wrapped / ;-multiline row — to its
// owning parsed row. Unlike buildLineToRow (row-starts only, for rendering), this lets a click on
// any physical line of a multiline value resolve to the record it belongs to instead of falling
// back to the category. Reused by the 3D interaction + reference-panel resolvers.
export function buildLineToRowFull(doc: CifDocument, span: LoopSpan, rowCount: number): Map<number, number> {
  const lineToRow = new Map<number, number>();
  if (span.dataStart < 0) return lineToRow;
  const starts = rowStarts(doc, span, rowCount);
  for (let ri = 0; ri < starts.length; ri++) {
    const to = ri + 1 < starts.length ? starts[ri + 1] - 1 : span.dataEnd;
    for (let ln = starts[ri]; ln <= to; ln++) lineToRow.set(ln, ri);
  }
  return lineToRow;
}

// First physical line of each data row. Fast path when the loop is one line per row;
// otherwise accumulate values (a ;...; block counts as one value) until a full row is seen.
function rowStarts(doc: CifDocument, span: LoopSpan, rowCount: number): number[] {
  if (rowCount > 0 && span.dataLineCount === rowCount) {
    const out = new Array<number>(rowCount);
    for (let r = 0; r < rowCount; r++) out[r] = span.dataStart + r;
    return out;
  }
  const ncol = span.fieldNames.length;
  const starts: number[] = [];
  let count = 0;
  let ln = span.dataStart;
  while (ln <= span.dataEnd) {
    if (count === 0) starts.push(ln);
    const text = doc.lines[ln].text;
    if (text.charCodeAt(0) === 59 /* ; */) {
      count += 1; // a ;...; multiline block is a single value
      ln++;
      while (ln <= span.dataEnd && doc.lines[ln].text.charCodeAt(0) !== 59) ln++;
      ln++; // consume the closing ; line
    } else {
      count += splitValues(text).length;
      ln++;
    }
    if (ncol > 0 && count >= ncol) count = 0;
  }
  return starts;
}
