"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ParsedCif } from "@/lib/cif";
import { computeInstanceJoins, type ReverseGroup } from "@/lib/cif-source/joins";
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
// preview portal — not the dictionary definition.
function CatPill({ cat }: { cat: string }) {
  return <span className="shrink-0 rounded bg-indigo-50 px-1 font-mono text-[10px] text-indigo-700">{cat}</span>;
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

type PreviewEnter = (blockIndex: number, category: string, rowIndex: number, e: React.MouseEvent) => void;

// One forward instance reference (a single parent row). Hover previews it; click jumps to it.
function InstanceHitRow({
  category,
  blockIndex,
  rowIndex,
  via,
  summary,
  onJump,
  onPreviewEnter,
  onPreviewLeave,
}: {
  category: string;
  blockIndex: number;
  rowIndex: number;
  via: string;
  summary: string;
  onJump?: (blockIndex: number, category: string, rowIndex: number) => void;
  onPreviewEnter: PreviewEnter;
  onPreviewLeave: () => void;
}) {
  const present = rowIndex >= 0;
  return (
    <div
      className={`flex items-center gap-1.5 rounded px-1 ${present ? "cursor-pointer hover:bg-slate-50" : "opacity-40"}`}
      onMouseEnter={present ? (e) => onPreviewEnter(blockIndex, category, rowIndex, e) : undefined}
      onMouseLeave={present ? onPreviewLeave : undefined}
      onClick={present ? () => onJump?.(blockIndex, category, rowIndex) : undefined}
    >
      <CatPill cat={category} />
      <span className="min-w-0 flex-1 truncate text-[11px] text-slate-600" title={summary}>
        {summary}
      </span>
      {via && <ViaKey field={via} />}
    </div>
  );
}

// One reverse group ("atom_site · 147 via label_asym_id"). Hover previews the sample row; click
// jumps to it.
function InstanceGroupRow({
  group,
  blockIndex,
  onJump,
  onPreviewEnter,
  onPreviewLeave,
}: {
  group: ReverseGroup;
  blockIndex: number;
  onJump?: (blockIndex: number, category: string, rowIndex: number) => void;
  onPreviewEnter: PreviewEnter;
  onPreviewLeave: () => void;
}) {
  return (
    <div
      className="flex cursor-pointer items-center gap-1.5 rounded px-1 hover:bg-slate-50"
      onMouseEnter={(e) => onPreviewEnter(blockIndex, group.category, group.sampleRowIndex, e)}
      onMouseLeave={onPreviewLeave}
      onClick={() => onJump?.(blockIndex, group.category, group.sampleRowIndex)}
    >
      <CatPill cat={group.category} />
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
}: {
  parsed: ParsedCif | null;
  presentCategories: Set<string>;
  onJumpToInstance?: (blockIndex: number, category: string, rowIndex: number) => void;
  onJumpToCategory: (category: string, blockIndex?: number) => void;
  onJumpToItem: (category: string, field: string, blockIndex?: number) => void;
}) {
  const refPanel = useStore((s) => s.refPanel);
  const dict = useStore((s) => s.dict);
  const adj = useStore((s) => s.adj);
  const itemChildren = useStore((s) => s.itemChildren);
  const closeRefPanel = useStore((s) => s.closeRefPanel);
  const focus = useStore((s) => s.focus);
  const expand = useStore((s) => s.expand);
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  const [onlyPresent, setOnlyPresent] = useState(true);
  const [preview, setPreview] = useState<{ block: number; cat: string; row: number; left: number; top: number } | null>(
    null,
  );

  const file = useMemo<MolCifFile | null>(() => (parsed ? asMolCifFile(parsed.raw) : null), [parsed]);

  // Instance joins: the actual rows this record references / is referenced by in the loaded file.
  const instance = refPanel?.instance ?? null;
  const joins = useMemo(() => {
    if (!instance || !file || !dict) return null;
    return computeInstanceJoins(file, dict, itemChildren, instance);
  }, [instance, file, dict, itemChildren]);

  // Field/value list for the hovered reference row (the preview portal contents).
  const previewFields = useMemo(() => {
    if (!preview || !file) return [];
    const c = getCategory(file, preview.block, preview.cat);
    if (!c) return [];
    const out: { name: string; value: string }[] = [];
    for (const n of c.fieldNames) {
      const f = c.getField(n);
      const v = f ? f.str(preview.row) : "";
      if (!isPlaceholder(v)) out.push({ name: n, value: v });
    }
    return out;
  }, [preview, file]);

  // Esc closes; click-outside closes.
  useEffect(() => {
    if (!refPanel) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRefPanel();
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) closeRefPanel();
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

  const onPreviewEnter: PreviewEnter = (blockIndex, category, rowIndex, e) => {
    if (rowIndex < 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    setPreview({ block: blockIndex, cat: category, row: rowIndex, left: r.left, top: r.top });
  };
  const onPreviewLeave = () => setPreview(null);

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
  const revGroups = joins?.reverse ?? [];

  const linkCount = instance ? fwdHits.length + revGroups.length : fwd.length + rev.length;

  const openInGraph = () => {
    focus(target.cat); // both category and item targets carry `.cat`
    expand(target.cat);
    router.push("/");
  };

  return (
    <>
      <div
        ref={panelRef}
        className="fixed right-6 top-[72px] z-[60] flex max-h-[72vh] w-[420px] flex-col rounded-lg border border-slate-200 bg-white shadow-2xl"
      >
        {/* header */}
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 p-2.5">
          <div className="min-w-0">
            {instance ? (
              <>
                <span className="text-[10px] uppercase tracking-wide text-slate-400">record</span>
                <div className="truncate font-mono text-[12px] font-semibold text-slate-700">
                  {instance.label ?? `${target.cat} #${instance.rowIndex + 1}`}
                </div>
                <div className="mt-0.5">
                  <MmcifChip target={target} variant="chip" full />
                </div>
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
              <Section title="this record references →" count={fwdHits.length}>
                {fwdHits.map((h, i) => (
                  <InstanceHitRow
                    key={`if${i}`}
                    category={h.category}
                    blockIndex={instance.blockIndex}
                    rowIndex={h.rowIndex}
                    via={h.via}
                    summary={h.summary}
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
        <div className="flex shrink-0 items-center justify-between border-t border-slate-100 px-2.5 py-1.5">
          <span className="font-mono text-[10px] text-slate-400">
            {linkCount} {instance ? "ref" : "link"}
            {linkCount === 1 ? "" : "s"}
          </span>
          <button
            onClick={openInGraph}
            className="rounded px-1.5 py-0.5 text-[11px] text-indigo-600 hover:bg-indigo-50"
            title="open this category in the full dictionary graph"
          >
            Open in full graph →
          </button>
        </div>
      </div>

      {/* hover preview portal: a peek at the referenced row's contents */}
      {preview &&
        previewFields.length > 0 &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[65] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
            style={{
              width: PREVIEW_W,
              left: Math.max(8, preview.left - PREVIEW_W - 12),
              top: Math.max(8, Math.min(preview.top, (typeof window !== "undefined" ? window.innerHeight : 800) - 300)),
            }}
          >
            <div className="border-b border-slate-100 bg-slate-50 px-2 py-1 font-mono text-[10px] font-semibold text-slate-600">
              {preview.cat}
            </div>
            <div className="max-h-[260px] overflow-auto p-1.5">
              <table className="w-full border-collapse text-[10px]">
                <tbody>
                  {previewFields.slice(0, PREVIEW_MAX_FIELDS).map((f) => (
                    <tr key={f.name} className="align-top">
                      <td className="whitespace-nowrap py-0.5 pr-2 font-mono text-slate-400">{f.name}</td>
                      <td className="break-all py-0.5 font-mono text-slate-700">{f.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {previewFields.length > PREVIEW_MAX_FIELDS && (
                <div className="px-1 pt-1 text-[10px] text-slate-400">
                  +{previewFields.length - PREVIEW_MAX_FIELDS} more fields
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
