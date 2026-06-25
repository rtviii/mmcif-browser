// Segment verbatim CIF text into a document model: the physical lines, the category /
// loop "spans" they form, and a line -> span index map. Pure, synchronous, no Mol*.
//
// This is a structural scan only (where does each loop's data start/end, which lines are
// item declarations). The actual cell VALUES used to build the fold hierarchy come from
// Mol*'s parsed fields in fold-tree.ts; we never re-parse values here.
//
// mmCIF text shape this handles: data_ block headers, `#` separator/comment lines, `loop_`
// headers followed by `_cat.attr` declarations then data rows, bare `_cat.attr value`
// key-value lines, and `;`-delimited multiline text values (which may span many physical
// lines and must not be mistaken for structural tokens).

export interface SourceLine {
  index: number;
  /** Verbatim line text with the trailing newline (and any \r) stripped. */
  text: string;
  /** True if this line is inside a ;...; multiline value (delimiter lines included). */
  inText: boolean;
}

export interface LoopSpan {
  kind: "loop";
  block: number;
  category: string;
  loopKeywordLine: number;
  declLines: number[];
  fieldNames: string[];
  dataStart: number; // first data line index, -1 if the loop has no data
  dataEnd: number; // last data line index (inclusive), -1 if no data
  dataLineCount: number;
}

export interface KeyValueSpan {
  kind: "kv";
  block: number;
  category: string;
  start: number; // first line index
  end: number; // last line index (inclusive)
  itemLines: Record<string, number>; // attribute -> declaration line index
}

export type CategorySpan = LoopSpan | KeyValueSpan;

export interface CifDocument {
  lines: SourceLine[];
  spans: CategorySpan[];
  /** line index -> span index, or -1 for headers / separators / blanks. */
  lineToSpan: Int32Array;
}

type State = "TOP" | "LOOP_HEADER" | "LOOP_DATA" | "KV";

function firstToken(text: string): string {
  const t = text.trimStart();
  const sp = t.search(/\s/);
  return sp === -1 ? t : t.slice(0, sp);
}

/** `_cat.attr` (must contain a dot) — distinguishes a declaration from a bare data value. */
function isItemDecl(head: string): boolean {
  return head.charCodeAt(0) === 95 /* _ */ && head.indexOf(".") > 1;
}

function parseItem(head: string): { cat: string; attr: string } {
  const dot = head.indexOf(".");
  return { cat: head.slice(1, dot), attr: head.slice(dot + 1) };
}

export function segmentDocument(text: string): CifDocument {
  const rawLines = text.split("\n");
  // A trailing newline yields a final empty element; keep it so line indices match the
  // file exactly, but it renders as a blank line.
  const lines: SourceLine[] = new Array(rawLines.length);
  const lineToSpan = new Int32Array(rawLines.length).fill(-1);
  const spans: CategorySpan[] = [];

  let inText = false;
  let block = -1;
  let state: State = "TOP";
  let cur: CategorySpan | null = null;
  let curIndex = -1;

  function close() {
    if (cur && cur.kind === "loop") {
      cur.dataLineCount = cur.dataStart < 0 ? 0 : cur.dataEnd - cur.dataStart + 1;
    }
    cur = null;
    curIndex = -1;
    state = "TOP";
  }

  for (let idx = 0; idx < rawLines.length; idx++) {
    let t = rawLines[idx];
    if (t.charCodeAt(t.length - 1) === 13 /* \r */) t = t.slice(0, -1);

    // ;-multiline tracking. A line belongs to a text value if we were already inside one
    // or if it opens one (leading ;). The leading-; line itself toggles the state.
    const opensOrInside = inText || t.charCodeAt(0) === 59 /* ; */;
    lines[idx] = { index: idx, text: t, inText: opensOrInside };
    if (t.charCodeAt(0) === 59) inText = !inText;

    if (opensOrInside) {
      // Multiline value content / delimiter: assign to the open span, no structure.
      if (cur) {
        lineToSpan[idx] = curIndex;
        if (cur.kind === "loop" && state === "LOOP_DATA") cur.dataEnd = idx;
        else if (cur.kind === "kv") cur.end = idx;
      }
      continue;
    }

    const head = firstToken(t);

    // Terminators / headers.
    if (head === "") {
      close();
      continue;
    }
    if (head.charCodeAt(0) === 35 /* # */) {
      close();
      continue;
    }
    if (head.startsWith("data_")) {
      block++;
      close();
      continue;
    }
    if (head.startsWith("save_") || head === "global_" || head === "stop_") {
      close();
      continue;
    }

    if (head === "loop_") {
      close();
      const span: LoopSpan = {
        kind: "loop",
        block,
        category: "",
        loopKeywordLine: idx,
        declLines: [],
        fieldNames: [],
        dataStart: -1,
        dataEnd: -1,
        dataLineCount: 0,
      };
      spans.push(span);
      cur = span;
      curIndex = spans.length - 1;
      state = "LOOP_HEADER";
      lineToSpan[idx] = curIndex;
      continue;
    }

    if (isItemDecl(head)) {
      const { cat, attr } = parseItem(head);
      if (state === "LOOP_HEADER" && cur && cur.kind === "loop") {
        cur.declLines.push(idx);
        cur.fieldNames.push(attr);
        if (!cur.category) cur.category = cat;
        lineToSpan[idx] = curIndex;
        continue;
      }
      // Key-value item: extend the current kv span if same category, else start one.
      if (!(state === "KV" && cur && cur.kind === "kv" && cur.category === cat)) {
        close();
        const span: KeyValueSpan = {
          kind: "kv",
          block,
          category: cat,
          start: idx,
          end: idx,
          itemLines: {},
        };
        spans.push(span);
        cur = span;
        curIndex = spans.length - 1;
        state = "KV";
      }
      (cur as KeyValueSpan).itemLines[attr] = idx;
      (cur as KeyValueSpan).end = idx;
      lineToSpan[idx] = curIndex;
      continue;
    }

    // A bare value token.
    if (state === "LOOP_HEADER" && cur && cur.kind === "loop") {
      cur.dataStart = idx;
      cur.dataEnd = idx;
      state = "LOOP_DATA";
      lineToSpan[idx] = curIndex;
      continue;
    }
    if (state === "LOOP_DATA" && cur && cur.kind === "loop") {
      cur.dataEnd = idx;
      lineToSpan[idx] = curIndex;
      continue;
    }
    if (state === "KV" && cur && cur.kind === "kv") {
      // A continuation value line for the last key-value item.
      cur.end = idx;
      lineToSpan[idx] = curIndex;
      continue;
    }
    // Stray value outside any span; leave unassigned.
    close();
  }

  close();
  return { lines, spans, lineToSpan };
}
