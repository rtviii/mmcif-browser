"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ParsedCif } from "@/lib/cif";
import {
  computeInstanceJoins,
  type ReverseGroup,
  type StructuralPick,
  type StructuralRef,
} from "@/lib/cif-source/joins";
import { asMolCifFile, getCategory, type MolCifFile } from "@/lib/cif-source/types";
import { type RefTarget, useStore } from "@/lib/store";
import { lookupDefinition } from "./dict-lookup";
import { MmcifChip } from "./MmcifChip";

// The "dig deeper" reference panel. A compact, click-pinned ~420px window. Two modes:
// - SCHEMA (hover/click a category header or column): the foreign-key neighbourhood from the
//   dictionary graph — what this category REFERENCES / is REFERENCED BY. Each neighbour is an
//   MmcifChip (same definition tooltip); clicking it navigates the SOURCE to that category and the
//   right-aligned key jumps to the FK item's declaration.
// - INSTANCE / RECORD (pin a concrete row, then "references"): the ACTUAL rows in this file that
//   the record references (forward) / that reference it (reverse, grouped by category with counts).
//   Hovering a reference portals a preview of that row; clicking it jumps the source there.
// A checkbox (on by default) hides everything not present in the loaded file; when off, present
// entries sort to the top and absent ones are greyed. Pure schema browsing lives on "full graph".

const PREVIEW_W = 300;
const PREVIEW_MAX_FIELDS = 18;

const isPlaceholder = (v: string) => v === "" || v === "." || v === "?";

function parseItemName(name: string): { cat: string; field: string } {
  const n = name.startsWith("_") ? name.slice(1) : name;
  const dot = n.indexOf(".");
  return dot < 0 ? { cat: n, field: "" } : { cat: n.slice(0, dot), field: n.slice(dot + 1) };
}

// The non-placeholder field:value pairs of one row — used for both the pinned-record header and the
// hover preview portal.
function rowFields(file: MolCifFile, block: number, cat: string, row: number): { name: string; value: string }[] {
  const c = getCategory(file, block, cat);
  if (!c || row < 0) return [];
  const out: { name: string; value: string }[] = [];
  for (const n of c.fieldNames) {
    const f = c.getField(n);
    const v = f ? f.str(row) : "";
    if (!isPlaceholder(v)) out.push({ name: n, value: v });
  }
  return out;
}

// A record value that never truncates: short values render inline; long / multiline ones clamp to
// two lines and expand in place on click (so a long sequence can't blow up the panel height, but is
// always one click away in full).
function ExpandableValue({ value, highlight }: { value: string; highlight?: boolean }) {
  const [open, setOpen] = useState(false);
  const color = highlight ? "font-semibold text-amber-800" : "text-slate-700";
  const long = value.length > 90 || value.includes("\n");
  if (!long) return <span className={`break-all font-mono ${color}`}>{value}</span>;
  if (open) {
    // Expanded: a bounded, scrollable box so a long sequence can't blow up the panel height.
    return (
      <div className="font-mono">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-indigo-500 hover:text-indigo-700"
        >
          collapse
        </button>
        <div
          className={`max-h-[240px] overflow-auto whitespace-pre-wrap break-all rounded border border-slate-200 bg-white p-1 leading-relaxed ${color}`}
        >
          {value}
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      title="show full value"
      className={`line-clamp-2 w-full cursor-pointer break-all text-left font-mono hover:text-indigo-700 ${color}`}
    >
      {value}
    </button>
  );
}

// A field:value table; `highlight` boxes the linking field (the FK that brought you here).
function FieldTable({
  fields,
  highlight,
  max,
}: {
  fields: { name: string; value: string }[];
  highlight?: string;
  max?: number;
}) {
  const shown = max ? fields.slice(0, max) : fields;
  return (
    <>
      <table className="w-full border-collapse text-[10px]">
        <tbody>
          {shown.map((f) => {
            const hl = f.name === highlight;
            return (
              <tr key={f.name} className={`align-top ${hl ? "bg-amber-100" : ""}`}>
                <td className={`whitespace-nowrap py-0.5 pr-2 font-mono ${hl ? "font-semibold text-amber-700" : "text-slate-400"}`}>
                  {f.name}
                </td>
                <td className="py-0.5">
                  <ExpandableValue value={f.value} highlight={hl} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {max && fields.length > max && (
        <div className="px-1 pt-1 text-[10px] text-slate-400">+{fields.length - max} more fields</div>
      )}
    </>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {title} <span className="text-slate-300">({count})</span>
      </div>
      {count === 0 ? (
        <div className="px-1 text-[11px] text-slate-300">none</div>
      ) : (
        <div className="flex flex-col gap-0.5">{children}</div>
      )}
    </div>
  );
}

// A plain (non-tooltip) category pill for instance rows, where the hover affordance is the row
// preview portal — not the dictionary definition. `colWidth` gives every pill in a section the same
// width (widest category name) so the summary/value columns line up regardless of pill length.
function CatPill({ cat, colWidth }: { cat: string; colWidth?: string }) {
  return (
    <span
      style={colWidth ? { minWidth: colWidth } : undefined}
      className="shrink-0 truncate rounded bg-indigo-50 px-1 font-mono text-[10px] text-indigo-700"
    >
      {cat}
    </span>
  );
}

// Shared pill width for a section: the longest category name in `cats`, in mono `ch` units (+ padding).
function pillColWidth(cats: string[]): string | undefined {
  if (cats.length === 0) return undefined;
  const max = Math.max(...cats.map((c) => c.length));
  return `${max + 1}ch`;
}

// The linking key, right-aligned: "via" sits outside the key's own bounding box.
function ViaKey({ field, onClick, title }: { field: string; onClick?: () => void; title?: string }) {
  return (
    <>
      <span className="shrink-0 text-[10px] text-slate-400">via</span>
      {onClick ? (
        <button
          onClick={onClick}
          title={title}
          className="shrink-0 rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-500 hover:bg-indigo-100 hover:text-indigo-700"
        >
          {field}
        </button>
      ) : (
        <span className="shrink-0 rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-400">{field}</span>
      )}
    </>
  );
}

// A schema neighbour: chip on the left, the linking key right-aligned. Present categories jump on
// click; absent ones are greyed (still hoverable for the definition).
type NeighbourEntry = { target: RefTarget; viaCat?: string; viaField?: string };

function NeighbourRow({
  entry,
  present,
  viaPresent,
  onJumpCategory,
  onJumpItem,
}: {
  entry: NeighbourEntry;
  present: boolean;
  viaPresent: boolean;
  onJumpCategory: (cat: string) => void;
  onJumpItem: (cat: string, field: string) => void;
}) {
  const { target, viaCat, viaField } = entry;
  const jump = () =>
    target.kind === "item" ? onJumpItem(target.cat, target.field) : onJumpCategory(target.cat);
  return (
    <div className={`flex items-center gap-1.5 px-1 ${present ? "" : "opacity-40"}`}>
      <MmcifChip target={target} variant="chip" onToggle={present ? jump : undefined} />
      <span className="min-w-0 flex-1" />
      {viaField && (
        <ViaKey
          field={viaField}
          onClick={present && viaPresent && viaCat ? () => onJumpItem(viaCat, viaField) : undefined}
          title={viaCat ? `scroll to _${viaCat}.${viaField} in the source` : undefined}
        />
      )}
    </div>
  );
}

type PreviewEnter = (
  blockIndex: number,
  category: string,
  rowIndex: number,
  highlight: string | undefined,
  e: React.MouseEvent,
) => void;

// One forward instance reference (a single parent row). Hover previews it (highlighting the parent
// field that holds the linking value); click jumps to it.
function InstanceHitRow({
  category,
  blockIndex,
  rowIndex,
  via,
  targetField,
  summary,
  count,
  colWidth,
  onJump,
  onPreviewEnter,
  onPreviewLeave,
}: {
  category: string;
  blockIndex: number;
  rowIndex: number;
  via: string;
  targetField: string;
  summary: string;
  count?: number;
  colWidth?: string;
  onJump?: (blockIndex: number, category: string, rowIndex: number) => void;
  onPreviewEnter: PreviewEnter;
  onPreviewLeave: () => void;
}) {
  const present = rowIndex >= 0;
  return (
    <div
      className={`flex items-center gap-1.5 rounded px-1 ${present ? "cursor-pointer hover:bg-slate-50" : "opacity-40"}`}
      onMouseEnter={present ? (e) => onPreviewEnter(blockIndex, category, rowIndex, targetField, e) : undefined}
      onMouseLeave={present ? onPreviewLeave : undefined}
      onClick={present ? () => onJump?.(blockIndex, category, rowIndex) : undefined}
    >
      <CatPill cat={category} colWidth={colWidth} />
      <span className="min-w-0 flex-1 truncate text-[11px] text-slate-600" title={summary}>
        {summary}
      </span>
      {count && count > 1 && (
        <span className="shrink-0 rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-500">{count}</span>
      )}
      {via && <ViaKey field={via} />}
    </div>
  );
}

// A resolved composite reference into atom_site, shown as a navigable hierarchy breadcrumb
// (chain › residue › atom). Each segment highlights that granularity in 3D + scrolls the source; hover
// previews the representative atom_site row.
function StructuralRefRow({
  sref,
  blockIndex,
  colWidth,
  onPickStructure,
  onPreviewEnter,
  onPreviewLeave,
}: {
  sref: StructuralRef;
  blockIndex: number;
  colWidth?: string;
  onPickStructure?: (pick: StructuralPick) => void;
  onPreviewEnter: PreviewEnter;
  onPreviewLeave: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded px-1 hover:bg-slate-50">
      <CatPill cat={sref.targetCategory} colWidth={colWidth} />
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-0.5 gap-y-0.5 text-[11px]">
        {sref.levels.map((lv, i) => (
          <Fragment key={i}>
            {i > 0 && <span className="text-slate-300">›</span>}
            <button
              onMouseEnter={(e) => onPreviewEnter(blockIndex, sref.targetCategory, lv.sampleRowIndex, undefined, e)}
              onMouseLeave={onPreviewLeave}
              onClick={() => onPickStructure?.({ ...lv, blockIndex, rowIndex: lv.sampleRowIndex })}
              title={`highlight ${lv.label} in 3D and scroll to it in the source`}
              className="rounded px-1 text-slate-600 hover:bg-indigo-100 hover:text-indigo-700"
            >
              {lv.label}
            </button>
          </Fragment>
        ))}
      </span>
      {sref.count > 1 && (
        <span className="shrink-0 rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-500" title={`${sref.count} atoms`}>
          {sref.count}
        </span>
      )}
      {sref.via && (
        <span className="max-w-[130px] shrink-0 truncate font-mono text-[9px] text-slate-400" title={`via ${sref.via}`}>
          via {sref.via}
        </span>
      )}
    </div>
  );
}

// One reverse group ("atom_site · 147 via label_asym_id"). Hover previews the sample row; click
// jumps to it.
function InstanceGroupRow({
  group,
  blockIndex,
  colWidth,
  onJump,
  onPreviewEnter,
  onPreviewLeave,
}: {
  group: ReverseGroup;
  blockIndex: number;
  colWidth?: string;
  onJump?: (blockIndex: number, category: string, rowIndex: number) => void;
  onPreviewEnter: PreviewEnter;
  onPreviewLeave: () => void;
}) {
  return (
    <div
      className="flex cursor-pointer items-center gap-1.5 rounded px-1 hover:bg-slate-50"
      onMouseEnter={(e) => onPreviewEnter(blockIndex, group.category, group.sampleRowIndex, group.via, e)}
      onMouseLeave={onPreviewLeave}
      onClick={() => onJump?.(blockIndex, group.category, group.sampleRowIndex)}
    >
      <CatPill cat={group.category} colWidth={colWidth} />
      <span className="shrink-0 rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-500">
        {group.count}
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500" title={group.sampleSummary}>
        {group.count === 1 ? group.sampleSummary : `e.g. ${group.sampleSummary}`}
      </span>
      {group.via && <ViaKey field={group.via} />}
    </div>
  );
}

export function ReferencePanel({
  parsed,
  presentCategories,
  onJumpToInstance,
  onJumpToCategory,
  onJumpToItem,
  onPickStructure,
}: {
  parsed: ParsedCif | null;
  presentCategories: Set<string>;
  onJumpToInstance?: (blockIndex: number, category: string, rowIndex: number) => void;
  onJumpToCategory: (category: string, blockIndex?: number) => void;
  onJumpToItem: (category: string, field: string, blockIndex?: number) => void;
  onPickStructure?: (pick: StructuralPick) => void; // click a resolved chain/residue/atom breadcrumb level
}) {
  const refPanel = useStore((s) => s.refPanel);
  const dict = useStore((s) => s.dict);
  const adj = useStore((s) => s.adj);
  const itemChildren = useStore((s) => s.itemChildren);
  const closeRefPanel = useStore((s) => s.closeRefPanel);
  const panelRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const [onlyPresent, setOnlyPresent] = useState(true);
  const [preview, setPreview] = useState<{
    block: number;
    cat: string;
    row: number;
    left: number;
    top: number;
    highlight?: string;
  } | null>(null);
  const previewHideTimer = useRef<number | null>(null);

  const file = useMemo<MolCifFile | null>(() => (parsed ? asMolCifFile(parsed.raw) : null), [parsed]);

  // Instance joins: the actual rows this record references / is referenced by in the loaded file.
  const instance = refPanel?.instance ?? null;
  const joins = useMemo(() => {
    if (!instance || !file || !dict) return null;
    return computeInstanceJoins(file, dict, itemChildren, instance);
  }, [instance, file, dict, itemChildren]);

  // The actual field:value pairs of the pinned record (shown in the header) and of the hovered
  // reference (shown in the preview portal).
  const recordFields = useMemo(
    () => (instance && file ? rowFields(file, instance.blockIndex, instance.category, instance.rowIndex) : []),
    [instance, file],
  );
  const previewFields = useMemo(
    () => (preview && file ? rowFields(file, preview.block, preview.cat, preview.row) : []),
    [preview, file],
  );

  // Esc closes; click-outside closes.
  useEffect(() => {
    if (!refPanel) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRefPanel();
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // ignore right/middle clicks: right-click on a row re-targets the panel
      const t = e.target as Node;
      if (previewRef.current?.contains(t)) return; // clicks inside the hover preview portal
      if (panelRef.current && !panelRef.current.contains(t)) closeRefPanel();
    };
    window.addEventListener("keydown", onKey);
    // defer so the opening click doesn't immediately close it
    const id = setTimeout(() => window.addEventListener("mousedown", onDown), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      clearTimeout(id);
    };
  }, [refPanel, closeRefPanel]);

  if (!refPanel || !dict) return null;
  const { target } = refPanel;
  const isCat = target.kind === "category";
  const def = lookupDefinition(dict, target);

  const cancelPreviewHide = () => {
    if (previewHideTimer.current) {
      clearTimeout(previewHideTimer.current);
      previewHideTimer.current = null;
    }
  };
  const onPreviewEnter: PreviewEnter = (blockIndex, category, rowIndex, highlight, e) => {
    if (rowIndex < 0) return;
    cancelPreviewHide();
    const r = e.currentTarget.getBoundingClientRect();
    setPreview({ block: blockIndex, cat: category, row: rowIndex, left: r.left, top: r.top, highlight });
  };
  // Grace period so the mouse can travel from the row into the (now hoverable) portal.
  const onPreviewLeave = () => {
    cancelPreviewHide();
    previewHideTimer.current = window.setTimeout(() => setPreview(null), 160);
  };

  // --- schema neighbours (only built/shown when NOT in instance mode) ---
  const forward: NeighbourEntry[] = [];
  const reverse: NeighbourEntry[] = [];
  if (!instance) {
    if (isCat) {
      const cat = target.cat;
      for (const e of adj.out.get(cat) ?? []) {
        const child = e.links[0] ? parseItemName(e.links[0].child) : undefined;
        forward.push({ target: { kind: "category", cat: e.target }, viaCat: child?.cat, viaField: child?.field });
      }
      for (const e of adj.in.get(cat) ?? []) {
        const child = e.links[0] ? parseItemName(e.links[0].child) : undefined;
        reverse.push({ target: { kind: "category", cat: e.source }, viaCat: child?.cat, viaField: child?.field });
      }
    } else {
      const fullName = `_${target.cat}.${target.field}`;
      for (const p of dict.items[fullName]?.parents ?? []) {
        const { cat, field } = parseItemName(p);
        forward.push({ target: { kind: "item", cat, field } });
      }
      for (const c of itemChildren.get(fullName) ?? []) {
        const { cat, field } = parseItemName(c);
        reverse.push({ target: { kind: "item", cat, field } });
      }
    }
  }

  // Present-first ordering + (when the checkbox is on) drop absent neighbours.
  const prep = (arr: NeighbourEntry[]) => {
    const mapped = arr.map((entry) => ({ entry, present: presentCategories.has(entry.target.cat) }));
    const filtered = onlyPresent ? mapped.filter((m) => m.present) : mapped;
    return filtered.sort((a, b) => Number(b.present) - Number(a.present));
  };
  const fwd = prep(forward);
  const rev = prep(reverse);

  // Instance forward hits: hide schema-only (rowIndex < 0) parents when "only present" is on; else
  // present rows first, schema-only greyed at the bottom.
  const fwdHits = joins
    ? joins.forward
        .filter((h) => !onlyPresent || h.rowIndex >= 0)
        .sort((a, b) => Number(b.rowIndex >= 0) - Number(a.rowIndex >= 0))
    : [];
  const structural = joins?.forwardStructural ?? [];
  const revGroups = joins?.reverse ?? [];

  // Shared category-pill widths so the summary/value columns line up within each section.
  const fwdColWidth = pillColWidth([...structural.map((s) => s.targetCategory), ...fwdHits.map((h) => h.category)]);
  const revColWidth = pillColWidth(revGroups.map((g) => g.category));

  const linkCount = instance ? structural.length + fwdHits.length + revGroups.length : fwd.length + rev.length;

  return (
    <>
      <div
        ref={panelRef}
        className="fixed right-6 top-[72px] z-[60] flex max-h-[85vh] w-[520px] flex-col rounded-lg border border-slate-200 bg-white shadow-2xl"
      >
        {/* header */}
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 p-2.5">
          <div className="min-w-0 flex-1">
            {instance ? (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">record</span>
                  <MmcifChip target={target} variant="chip" full />
                  {onJumpToInstance && (
                    <button
                      onClick={() => onJumpToInstance(instance.blockIndex, instance.category, instance.rowIndex)}
                      title="scroll back to this record in the source"
                      className="shrink-0 rounded px-1 text-[10px] text-indigo-500 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      jump to →
                    </button>
                  )}
                </div>
                {recordFields.length > 0 && (
                  <div className="mt-1 rounded bg-slate-50 p-1">
                    <FieldTable fields={recordFields} />
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">
                    {isCat ? "category" : "item"}
                  </span>
                  <MmcifChip target={target} variant="chip" full />
                </div>
                {def?.body && (
                  <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-500">{def.body}</p>
                )}
              </>
            )}
          </div>
          <button
            onClick={closeRefPanel}
            className="shrink-0 rounded px-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="close (Esc)"
          >
            ×
          </button>
        </div>

        {/* present-only filter */}
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 border-b border-slate-100 px-2.5 py-1 text-[10px] text-slate-500">
          <input
            type="checkbox"
            checked={onlyPresent}
            onChange={(e) => setOnlyPresent(e.target.checked)}
            className="h-3 w-3 accent-indigo-500"
          />
          Only what&apos;s in this file
        </label>

        {/* body */}
        <div className="no-scrollbar flex-1 overflow-auto p-1.5">
          {instance && joins ? (
            <>
              <Section title="this record references →" count={structural.length + fwdHits.length}>
                {structural.map((s, i) => (
                  <StructuralRefRow
                    key={`is${i}`}
                    sref={s}
                    blockIndex={instance.blockIndex}
                    colWidth={fwdColWidth}
                    onPickStructure={onPickStructure}
                    onPreviewEnter={onPreviewEnter}
                    onPreviewLeave={onPreviewLeave}
                  />
                ))}
                {fwdHits.map((h, i) => (
                  <InstanceHitRow
                    key={`if${i}`}
                    category={h.category}
                    blockIndex={instance.blockIndex}
                    rowIndex={h.rowIndex}
                    via={h.via}
                    targetField={h.targetField}
                    summary={h.summary}
                    count={h.count}
                    colWidth={fwdColWidth}
                    onJump={onJumpToInstance}
                    onPreviewEnter={onPreviewEnter}
                    onPreviewLeave={onPreviewLeave}
                  />
                ))}
              </Section>
              <Section title="← records referencing this" count={revGroups.length}>
                {revGroups.map((g, i) => (
                  <InstanceGroupRow
                    key={`ig${i}`}
                    group={g}
                    blockIndex={instance.blockIndex}
                    colWidth={revColWidth}
                    onJump={onJumpToInstance}
                    onPreviewEnter={onPreviewEnter}
                    onPreviewLeave={onPreviewLeave}
                  />
                ))}
              </Section>
              {joins.skipped.length > 0 && (
                <div className="px-1 pt-1 text-[10px] text-amber-600">
                  skipped (too large): {joins.skipped.join(", ")}
                </div>
              )}
            </>
          ) : (
            <>
              <Section title="References →" count={fwd.length}>
                {fwd.map(({ entry, present }, i) => (
                  <NeighbourRow
                    key={`f${i}`}
                    entry={entry}
                    present={present}
                    viaPresent={!!entry.viaCat && presentCategories.has(entry.viaCat)}
                    onJumpCategory={onJumpToCategory}
                    onJumpItem={onJumpToItem}
                  />
                ))}
              </Section>
              <Section title="← Referenced by" count={rev.length}>
                {rev.map(({ entry, present }, i) => (
                  <NeighbourRow
                    key={`r${i}`}
                    entry={entry}
                    present={present}
                    viaPresent={!!entry.viaCat && presentCategories.has(entry.viaCat)}
                    onJumpCategory={onJumpToCategory}
                    onJumpItem={onJumpToItem}
                  />
                ))}
              </Section>
            </>
          )}
        </div>

        {/* footer */}
        <div className="flex shrink-0 items-center border-t border-slate-100 px-2.5 py-1.5">
          <span className="font-mono text-[10px] text-slate-400">
            {linkCount} {instance ? "ref" : "link"}
            {linkCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {/* hover preview portal: a reachable peek at the referenced row, with the linking FK
          highlighted and its own jump-to. Grace timer keeps it open while the mouse travels here;
          stopPropagation on mousedown keeps the panel's click-outside from closing. */}
      {preview &&
        previewFields.length > 0 &&
        createPortal(
          <div
            ref={previewRef}
            onMouseEnter={cancelPreviewHide}
            onMouseLeave={onPreviewLeave}
            onMouseDown={(e) => e.stopPropagation()}
            className="fixed z-[65] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
            style={{
              width: PREVIEW_W,
              left: Math.max(8, preview.left - PREVIEW_W - 12),
              top: Math.max(8, Math.min(preview.top, (typeof window !== "undefined" ? window.innerHeight : 800) - 300)),
            }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-2 py-1">
              <span className="truncate font-mono text-[10px] font-semibold text-slate-600">{preview.cat}</span>
              {onJumpToInstance && (
                <button
                  onClick={() => onJumpToInstance(preview.block, preview.cat, preview.row)}
                  title="scroll to this row in the source"
                  className="shrink-0 rounded px-1 text-[10px] text-indigo-500 hover:bg-indigo-100 hover:text-indigo-700"
                >
                  jump to →
                </button>
              )}
            </div>
            <div className="max-h-[260px] overflow-auto p-1.5">
              <FieldTable fields={previewFields} highlight={preview.highlight} max={PREVIEW_MAX_FIELDS} />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
