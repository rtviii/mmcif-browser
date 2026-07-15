"use client";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { buildLineToRow, buildLoopTable } from "@/lib/cif-source/table";
import type { CifDocument, LoopSpan } from "@/lib/cif-source/segment";
import { tokenizeLine } from "@/lib/cif-source/tokenize";
import type { MolCifFile } from "@/lib/cif-source/types";
import { cellPx, TOKEN_CLASS_MUTED } from "@/components/cif/source-style";
import { DataCell, PopoverLayer, usePopover } from "@/components/cif/DataCell";

// The mmCIF source panel for the proposal figures. It renders loops with the SAME fixed-pixel
// column model as the Inspector (components/cif/source-style.ts), so cells actually line up, and
// it owns its own scroll container so it can be bounded to the height of the viewer beside it and
// snapped to a line on demand.
//
// It knows nothing about heterogeneity. It highlights LINES; the parent (StageFigure) owns the
// network semantics and passes down marks. That boundary is what keeps the interaction testable:
// a chip click becomes "mark these lines, reveal that one".

const HEADER_H = 34; // the sticky per-loop header (category name + column names)

/** A persistent mark on a source line. `row` = this line is part of the active selection;
 *  `rail` = it merely belongs to a marked network (its atom rows, or an idle het row). */
export interface LineMark {
  color: string;
  tier: "rail" | "row";
}

export interface CifPanelHandle {
  /** Scroll so the first RENDERED line among `lines` (preferring `anchor`) sits under the sticky
   *  header. A method, not state, so re-selecting the same target re-fires. */
  reveal: (lines: readonly number[], anchor?: number) => void;
}

export interface CifPanelProps {
  cif: string;
  doc: CifDocument | null;
  molFile: MolCifFile | null;
  title?: string;
  /** Hide everything from the first line containing this marker ("the file as it is today"). */
  truncateBefore?: string;
  marks?: ReadonlyMap<number, LineMark> | null;
  hoverLines?: ReadonlySet<number> | null;
  /** Post-snap flash. Pass a fresh Set each time so re-clicking the same chip restarts it. */
  flashLines?: ReadonlySet<number> | null;
  onHoverLine?: (idx: number | null) => void;
  onActivateLine?: (idx: number) => void;
  className?: string;
}

const BLANK_TAIL = /^\s*(#|loop_)?\s*$/;

export const CifPanel = forwardRef<CifPanelHandle, CifPanelProps>(function CifPanel(
  {
    cif,
    doc,
    molFile,
    title,
    truncateBefore,
    marks,
    hoverLines,
    flashLines,
    onHoverLine,
    onActivateLine,
    className = "",
  },
  ref,
) {
  // All three default ON: aligned columns are the point, and the preamble comments in these files
  // are prose the reader wants.
  const [table, setTable] = useState(true);
  const [wrap, setWrap] = useState(true);
  const [hideNoise, setHideNoise] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [pop, openPopover, closePopover] = usePopover();

  // Everything at/after `truncateBefore` is dropped, along with the blank/# tail before it. The
  // marker must START the line: these files discuss the categories in their header comments, and a
  // substring match would cut at the prose instead of at the declaration.
  const cutoff = useMemo(() => {
    if (!doc || !truncateBefore) return Infinity;
    const hit = doc.lines.findIndex((l) => l.text.trimStart().startsWith(truncateBefore));
    if (hit < 0) return Infinity;
    let end = hit;
    while (end > 0 && BLANK_TAIL.test(doc.lines[end - 1].text)) end--;
    return end; // exclusive
  }, [doc, truncateBefore]);

  useImperativeHandle(
    ref,
    () => ({
      reveal(lines, anchor) {
        const host = scrollRef.current;
        if (!host) return;
        // Ask the DOM, not an index: whether a line is rendered already accounts for hideNoise,
        // the truncation cutoff, and table mode folding away declaration lines.
        const pick = (ln: number) => host.querySelector<HTMLElement>(`[data-line="${ln}"]`);
        let el = anchor != null && anchor >= 0 ? pick(anchor) : null;
        if (!el) {
          for (const ln of [...lines].sort((a, b) => a - b)) {
            el = pick(ln);
            if (el) break;
          }
        }
        if (!el) return;
        const top =
          el.getBoundingClientRect().top -
          host.getBoundingClientRect().top +
          host.scrollTop -
          HEADER_H -
          6;
        const reduce =
          typeof window !== "undefined" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        // scrollTo on the panel, NOT scrollIntoView — the latter walks up and scrolls the article
        // too, yanking the whole figure off screen.
        host.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
      },
    }),
    [],
  );

  const shared = { marks, hoverLines, flashLines, onHoverLine, onActivateLine };

  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded border border-slate-200 bg-white ${className}`}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-3 py-1.5">
        {title && (
          <span className="truncate text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            {title}
          </span>
        )}
        <SettingsGear
          table={table}
          wrap={wrap}
          hideNoise={hideNoise}
          onTable={() => setTable((v) => !v)}
          onWrap={() => setWrap((v) => !v)}
          onHideNoise={() => setHideNoise((v) => !v)}
        />
      </div>

      {/* the one and only scroll container — both axes. A nested overflow here would become the
          containing block for the sticky loop headers and silently break them. */}
      <div ref={scrollRef} className="no-scrollbar min-h-0 flex-1 overflow-auto">
        {!doc || !cif ? (
          <div className="px-3 py-2 font-mono text-[11px] text-slate-300">loading…</div>
        ) : table && molFile ? (
          <TableView doc={doc} molFile={molFile} cutoff={cutoff} hideNoise={hideNoise} openPopover={openPopover} {...shared} />
        ) : (
          <RawView doc={doc} cutoff={cutoff} hideNoise={hideNoise} wrap={wrap} {...shared} />
        )}
      </div>
      <PopoverLayer pop={pop} onClose={closePopover} />
    </div>
  );
});

/* ------------------------------------------------------------------ line marking */

interface MarkProps {
  marks?: ReadonlyMap<number, LineMark> | null;
  hoverLines?: ReadonlySet<number> | null;
  flashLines?: ReadonlySet<number> | null;
  onHoverLine?: (idx: number | null) => void;
  onActivateLine?: (idx: number) => void;
}

// Background precedence, mirroring the Inspector's rowBg chain: a post-snap flash beats the active
// selection, which beats a transient hover. The colour rail is independent — it is drawn whenever
// the line carries a mark at all, at full strength for the selection and half for its atom rows.
function rowBg(mark: LineMark | undefined, hovered: boolean, flashed: boolean): string {
  if (flashed) return "bg-amber-100";
  if (mark?.tier === "row") return "bg-slate-100";
  if (hovered) return "bg-slate-50";
  return "hover:bg-slate-50";
}

function railStyle(mark: LineMark | undefined): React.CSSProperties | undefined {
  if (!mark) return undefined;
  const alpha = mark.tier === "row" ? "" : "80"; // 8-digit hex: half-strength for atom rows
  return { boxShadow: `inset 3px 0 0 0 ${mark.color}${alpha}` };
}

/* ------------------------------------------------------------------ raw view */

function isLoopDataLine(doc: CifDocument, idx: number): LoopSpan | null {
  const si = doc.lineToSpan[idx];
  if (si < 0) return null;
  const span = doc.spans[si];
  if (span.kind !== "loop" || span.dataStart < 0) return null;
  return idx >= span.dataStart && idx <= span.dataEnd ? span : null;
}

function RawView({
  doc,
  cutoff,
  hideNoise,
  wrap,
  marks,
  hoverLines,
  flashLines,
  onHoverLine,
  onActivateLine,
}: { doc: CifDocument; cutoff: number; hideNoise: boolean; wrap: boolean } & MarkProps) {
  return (
    <div
      className={`py-2 font-mono text-[11px] leading-[1.55] ${wrap ? "" : "min-w-max"}`}
      onMouseLeave={() => onHoverLine?.(null)}
    >
      {doc.lines.map((line) => {
        if (line.index >= cutoff) return null;
        const trimmed = line.text.trim();
        if (hideNoise && (trimmed === "" || trimmed.startsWith("#"))) return null;
        const data = isLoopDataLine(doc, line.index);
        const toks = tokenizeLine(line.text, { inTextBlock: line.inText });
        const mark = marks?.get(line.index);
        return (
          <div
            key={line.index}
            data-line={line.index}
            className={`px-3 ${wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"} ${
              data ? `cursor-pointer ${rowBg(mark, !!hoverLines?.has(line.index), !!flashLines?.has(line.index))}` : ""
            }`}
            style={railStyle(mark)}
            onMouseEnter={data ? () => onHoverLine?.(line.index) : undefined}
            onClick={data ? () => onActivateLine?.(line.index) : undefined}
          >
            {toks.length === 0
              ? " "
              : toks.map((t, i) => (
                  <span key={i} className={TOKEN_CLASS_MUTED[t.type]}>
                    {line.text.slice(t.start, t.end)}
                  </span>
                ))}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- table view */

function TableView({
  doc,
  molFile,
  cutoff,
  hideNoise,
  openPopover,
  ...mark
}: {
  doc: CifDocument;
  molFile: MolCifFile;
  cutoff: number;
  hideNoise: boolean;
  openPopover: (anchor: HTMLElement, value: string, field?: string) => void;
} & MarkProps) {
  const blocks: React.ReactNode[] = [];
  let i = 0;
  while (i < doc.lines.length && i < cutoff) {
    const si = doc.lineToSpan[i];
    const span = si >= 0 ? doc.spans[si] : null;
    if (span?.kind === "loop" && i === span.loopKeywordLine) {
      blocks.push(
        <LoopBlock
          key={`loop-${i}`}
          doc={doc}
          span={span}
          molFile={molFile}
          openPopover={openPopover}
          {...mark}
        />,
      );
      const last = span.dataEnd >= 0 ? span.dataEnd : span.declLines[span.declLines.length - 1] ?? i;
      i = last + 1;
      continue;
    }
    const trimmed = doc.lines[i].text.trim();
    if (!(hideNoise && trimmed.startsWith("#")) && trimmed !== "") {
      const idx = i;
      const toks = tokenizeLine(doc.lines[idx].text, { inTextBlock: doc.lines[idx].inText });
      blocks.push(
        <div
          key={`raw-${idx}`}
          data-line={idx}
          className="whitespace-pre-wrap break-words px-3 font-mono text-[11px] leading-[1.55]"
        >
          {toks.map((t, k) => (
            <span key={k} className={TOKEN_CLASS_MUTED[t.type]}>
              {doc.lines[idx].text.slice(t.start, t.end)}
            </span>
          ))}
        </div>,
      );
    }
    i++;
  }
  return (
    <div className="pb-3 pt-2" onMouseLeave={() => mark.onHoverLine?.(null)}>
      {blocks}
    </div>
  );
}

function LoopBlock({
  doc,
  span,
  molFile,
  openPopover,
  marks,
  hoverLines,
  flashLines,
  onHoverLine,
  onActivateLine,
}: {
  doc: CifDocument;
  span: LoopSpan;
  molFile: MolCifFile;
  openPopover: (anchor: HTMLElement, value: string, field?: string) => void;
} & MarkProps) {
  const model = useMemo(() => buildLoopTable(doc, span, molFile), [doc, span, molFile]);
  const rowToLine = useMemo(() => {
    const m = new Map<number, number>();
    if (!model) return m;
    buildLineToRow(doc, span, model.rowCount).forEach((row, line) => m.set(row, line));
    return m;
  }, [doc, span, model]);
  if (!model) return null;

  return (
    // min-w-max so the sticky header can never be narrower than the widest data row; each loop is
    // its own sticky containing block, so scrolling loop N up pushes loop N-1's header off. The
    // header is a normal in-flow child, so it scrolls horizontally WITH the data — no counter-
    // transform needed (that is a virtualization artifact of the Inspector's SourceView).
    <section className="min-w-max">
      <div className="sticky top-0 z-10 bg-white">
        <div className="flex items-baseline gap-2 border-t border-slate-100 px-3 pb-0.5 pt-2">
          <span className="font-mono text-[11px] font-semibold text-slate-600">_{span.category}</span>
          <span className="text-[10px] text-slate-400">{model.rowCount} rows</span>
        </div>
        <div className="flex border-b border-slate-200 px-3 pb-1">
          {span.fieldNames.map((f, c) => (
            <span
              key={f}
              className="mr-1 inline-block shrink-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] text-slate-400"
              style={{ width: cellPx(model.widths[c]) }}
              title={f}
            >
              {f}
            </span>
          ))}
        </div>
      </div>
      {Array.from({ length: model.rowCount }, (_, r) => {
        const line = rowToLine.get(r);
        if (line == null) return null;
        const mark = marks?.get(line);
        return (
          <div
            key={r}
            data-line={line}
            className={`flex cursor-pointer px-3 font-mono text-[11px] leading-[1.55] ${rowBg(
              mark,
              !!hoverLines?.has(line),
              !!flashLines?.has(line),
            )}`}
            style={railStyle(mark)}
            onMouseEnter={() => onHoverLine?.(line)}
            onClick={() => onActivateLine?.(line)}
          >
            {span.fieldNames.map((f, c) => (
              <DataCell
                key={f}
                value={model.fields[c]?.str(r) ?? "."}
                field={f}
                w={model.widths[c]}
                openPopover={openPopover}
                muted
              />
            ))}
          </div>
        );
      })}
    </section>
  );
}

/* ------------------------------------------------------------- settings gear */

function SettingsGear({
  table,
  wrap,
  hideNoise,
  onTable,
  onWrap,
  onHideNoise,
}: {
  table: boolean;
  wrap: boolean;
  hideNoise: boolean;
  onTable: () => void;
  onWrap: () => void;
  onHideNoise: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative ml-auto shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        title="view settings"
        className={`flex h-5 w-5 items-center justify-center rounded text-[13px] leading-none ${
          open ? "bg-slate-100 text-slate-600" : "text-slate-300 hover:bg-slate-100 hover:text-slate-600"
        }`}
      >
        ⚙
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-md border border-slate-200 bg-white p-2.5 text-[11px] text-slate-700 shadow-lg">
          <GearToggle on={table} onToggle={onTable} label="Table" hint="loops as aligned columns" />
          <div className="my-2 border-t border-slate-100" />
          <GearToggle on={wrap} onToggle={onWrap} label="Wrap lines" hint="wrap instead of scroll (raw view)" />
          <div className="my-2 border-t border-slate-100" />
          <GearToggle on={hideNoise} onToggle={onHideNoise} label="Hide comments" hint="drop # and blank lines" />
        </div>
      )}
    </div>
  );
}

function GearToggle({
  on,
  onToggle,
  label,
  hint,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button onClick={onToggle} className="flex w-full items-start gap-2 text-left">
      <span
        className={`relative mt-0.5 h-3.5 w-6 shrink-0 rounded-full transition-colors ${
          on ? "bg-slate-500" : "bg-slate-200"
        }`}
      >
        <span
          className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${on ? "left-3" : "left-0.5"}`}
        />
      </span>
      <span>
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="ml-1 text-slate-400">— {hint}</span>
      </span>
    </button>
  );
}
