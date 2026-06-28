"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { MmcifChip } from "./MmcifChip";

// The filter / lenses control. A button opens a real panel (not a cramped input): the eight
// interpretation "lenses" as collapsible clusters you can expand to inspect and toggle the exact
// categories they hold (each row is the shared MmcifChip, so hovering shows the dictionary
// definition). Searching switches to a flat category/item result list. Selection narrows the
// source view to the chosen categories (an item resolves to its category).

export type FilterEntry = { kind: "category" | "item"; category: string; label: string };

export interface LensPreset {
  id: string;
  short: string;
  label: string;
  tier: "structural" | "context";
  blurb: string;
  categories: string[]; // in-file categories carrying this lens
}
export interface FilterPresets {
  lenses: LensPreset[];
  structuralOnly: string[];
  hideDeposition: string[];
}

const key = (e: { kind: string; label: string }) => `${e.kind}:${e.label}`;
const catEntry = (c: string): FilterEntry => ({ kind: "category", category: c, label: c });
const itemEntry = (label: string, category: string): FilterEntry => ({ kind: "item", category, label });
const MAX_OPTS = 60;

export function CategoryFilter({
  categories,
  items,
  selected,
  onChange,
  presets,
}: {
  categories: string[];
  items: { label: string; category: string }[];
  selected: FilterEntry[];
  onChange: (next: FilterEntry[]) => void;
  presets?: FilterPresets;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open]);

  const selectedKeys = useMemo(() => new Set(selected.map(key)), [selected]);
  const selectedCats = useMemo(
    () => new Set(selected.filter((s) => s.kind === "category").map((s) => s.label)),
    [selected],
  );

  const q = query.trim().toLowerCase();
  const catOpts = categories
    .filter((c) => c.toLowerCase().includes(q))
    .slice(0, MAX_OPTS);
  const itemOpts = items.filter((it) => it.label.toLowerCase().includes(q)).slice(0, MAX_OPTS);

  const toggleEntry = (e: FilterEntry) =>
    onChange(selectedKeys.has(key(e)) ? selected.filter((s) => key(s) !== key(e)) : [...selected, e]);
  const remove = (k: string) => onChange(selected.filter((s) => key(s) !== k));

  // Lenses are mutually-exclusive radios: clicking one REPLACES the selection with exactly its
  // categories; clicking the active lens again clears the filter. `exactLens` = the selection is
  // precisely this lens's category set (so only one lens ever reads as active).
  const setCats = (cats: string[]) => onChange(cats.map(catEntry));
  const exactLens = (cats: string[]) =>
    cats.length > 0 && cats.length === selectedCats.size && cats.every((c) => selectedCats.has(c));
  const pickLens = (cats: string[]) => (exactLens(cats) ? onChange([]) : setCats(cats));

  const structural = presets?.lenses.filter((l) => l.tier === "structural") ?? [];
  const context = presets?.lenses.filter((l) => l.tier === "context") ?? [];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 ${
          open || selected.length
            ? "border-indigo-500 bg-indigo-50 text-indigo-700"
            : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
        }`}
      >
        Filter / lenses
        {selected.length > 0 && (
          <span className="rounded-full bg-indigo-600 px-1 text-[9px] leading-tight text-white">
            {selected.length}
          </span>
        )}
        <span className="text-[8px] text-slate-400">▼</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 flex max-h-[70vh] w-[min(520px,80vw)] flex-col overflow-hidden rounded border border-slate-200 bg-white text-[11px] shadow-lg">
          {/* search + clear */}
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search categories / items…"
              className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-slate-700 placeholder-slate-400 outline-none focus:border-indigo-500"
            />
            {selected.length > 0 && (
              <button onClick={() => onChange([])} className="shrink-0 text-slate-500 hover:text-slate-800">
                Clear
              </button>
            )}
          </div>

          {/* selected tray */}
          {selected.length > 0 && (
            <div className="flex shrink-0 flex-wrap gap-1 border-b border-slate-100 bg-slate-50/60 p-2">
              {selected.map((s) => (
                <MmcifChip
                  key={key(s)}
                  target={s.kind === "category" ? { kind: "category", cat: s.category } : itemTarget(s.label, s.category)}
                  variant="chip"
                  onRemove={() => remove(key(s))}
                />
              ))}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto no-scrollbar">
            {q ? (
              <SearchResults
                catOpts={catOpts}
                itemOpts={itemOpts}
                selectedKeys={selectedKeys}
                onToggleCat={(c) => toggleEntry(catEntry(c))}
                onToggleItem={(label, category) => toggleEntry(itemEntry(label, category))}
              />
            ) : presets ? (
              <>
                {/* mutually-exclusive lens radios + cross-cutting presets */}
                <div className="border-b border-slate-100 p-2">
                  <LensRow title="Structural" lenses={structural} exactLens={exactLens} onPick={pickLens} />
                  <LensRow title="Context" lenses={context} exactLens={exactLens} onPick={pickLens} />
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <button
                      onClick={() => setCats(presets.structuralOnly)}
                      className="rounded border border-teal-600/40 bg-teal-50 px-1.5 py-0.5 text-[10px] text-teal-800 hover:bg-teal-100"
                    >
                      Structural only
                    </button>
                    <button
                      onClick={() => setCats(presets.hideDeposition)}
                      className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50"
                    >
                      Hide deposition
                    </button>
                    <span className="ml-auto text-[10px] text-slate-400">Pick a lens, or check categories below.</span>
                  </div>
                </div>
                {/* full category list */}
                <div className="px-2 py-1">
                  <div className="px-1.5 py-1 text-[9px] uppercase tracking-wide text-slate-400">
                    All categories <span className="text-slate-300">({categories.length})</span>
                  </div>
                  {categories.map((c) => (
                    <MmcifChip
                      key={c}
                      target={{ kind: "category", cat: c }}
                      variant="row"
                      selected={selectedCats.has(c)}
                      onToggle={() => toggleEntry(catEntry(c))}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

const itemTarget = (label: string, category: string) => {
  const dot = label.indexOf(".");
  const field = dot >= 0 ? label.slice(dot + 1) : label;
  return { kind: "item" as const, cat: category, field };
};

// A labeled wrap-row of mutually-exclusive lens pills. Clicking a pill replaces the selection
// (or clears it if it was the active lens) via onPick.
function LensRow({
  title,
  lenses,
  exactLens,
  onPick,
}: {
  title: string;
  lenses: LensPreset[];
  exactLens: (cats: string[]) => boolean;
  onPick: (cats: string[]) => void;
}) {
  if (lenses.length === 0) return null;
  return (
    <div className="mb-1.5 last:mb-0">
      <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      <div className="flex flex-wrap gap-1">
        {lenses.map((l) => {
          const active = exactLens(l.categories);
          return (
            <button
              key={l.id}
              onClick={() => onPick(l.categories)}
              title={l.blurb}
              className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${
                active
                  ? "border-indigo-500 bg-indigo-500 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {l.short}{" "}
              <span className={active ? "text-indigo-100" : "text-slate-400"}>· {l.categories.length}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SearchResults({
  catOpts,
  itemOpts,
  selectedKeys,
  onToggleCat,
  onToggleItem,
}: {
  catOpts: string[];
  itemOpts: { label: string; category: string }[];
  selectedKeys: Set<string>;
  onToggleCat: (c: string) => void;
  onToggleItem: (label: string, category: string) => void;
}) {
  if (!catOpts.length && !itemOpts.length) {
    return <div className="p-3 text-center text-[10px] text-slate-400">No matches.</div>;
  }
  return (
    <div className="py-1">
      {catOpts.length > 0 && (
        <div className="px-2 py-1 text-[9px] uppercase tracking-wide text-slate-400">Categories</div>
      )}
      <div className="px-2">
        {catOpts.map((c) => (
          <MmcifChip
            key={`c:${c}`}
            target={{ kind: "category", cat: c }}
            variant="row"
            selected={selectedKeys.has(`category:${c}`)}
            onToggle={() => onToggleCat(c)}
          />
        ))}
      </div>
      {itemOpts.length > 0 && (
        <div className="px-2 py-1 text-[9px] uppercase tracking-wide text-slate-400">Items</div>
      )}
      <div className="px-2">
        {itemOpts.map((it) => (
          <MmcifChip
            key={`i:${it.label}`}
            target={itemTarget(it.label, it.category)}
            variant="row"
            selected={selectedKeys.has(`item:${it.label}`)}
            onToggle={() => onToggleItem(it.label, it.category)}
          />
        ))}
      </div>
    </div>
  );
}
