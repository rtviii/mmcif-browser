"use client";
import { useEffect, useMemo, useRef, useState } from "react";

// A multi-value filter over the source view: pick any categories and/or items; the view is
// narrowed to those categories (an item resolves to — and is shown under — its category).
// Empty selection means no filtering. Searchable; categories and items are styled distinctly.
// On focus it also surfaces "lens" presets (groups of categories by interpretation) that
// autopopulate the filter — see classify.ts / the `presets` prop.

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
const MAX_OPTS = 40;

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
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hoverBlurb, setHoverBlurb] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selectedKeys = useMemo(() => new Set(selected.map(key)), [selected]);
  const selectedCats = useMemo(
    () => new Set(selected.filter((s) => s.kind === "category").map((s) => s.label)),
    [selected],
  );
  const q = query.trim().toLowerCase();
  const catOpts = categories
    .filter((c) => !selectedKeys.has(`category:${c}`) && c.toLowerCase().includes(q))
    .slice(0, MAX_OPTS);
  const itemOpts = items
    .filter((it) => !selectedKeys.has(`item:${it.label}`) && it.label.toLowerCase().includes(q))
    .slice(0, MAX_OPTS);

  const add = (e: FilterEntry) => {
    if (!selectedKeys.has(key(e))) onChange([...selected, e]);
    setQuery("");
  };
  const remove = (k: string) => onChange(selected.filter((s) => key(s) !== k));

  // Preset actions over category chips (item chips are left untouched).
  const lensActive = (cats: string[]) => cats.length > 0 && cats.every((c) => selectedCats.has(c));
  const toggleCats = (cats: string[]) => {
    if (lensActive(cats)) {
      const drop = new Set(cats);
      onChange(selected.filter((s) => !(s.kind === "category" && drop.has(s.label))));
    } else {
      const add = cats.filter((c) => !selectedCats.has(c)).map(catEntry);
      onChange([...selected, ...add]);
    }
  };
  const setCats = (cats: string[]) => onChange(cats.map(catEntry));

  const showPresets = open && presets && !q;
  const showResults = open && (q.length > 0 || !presets) && (catOpts.length > 0 || itemOpts.length > 0);

  return (
    <div ref={ref} className="relative">
      <div
        className="flex max-w-[320px] items-center gap-1 overflow-x-auto rounded border border-slate-300 bg-white px-1 py-0.5 no-scrollbar focus-within:border-indigo-500"
        onClick={() => setOpen(true)}
      >
        {selected.map((s) => (
          <span
            key={key(s)}
            className={`flex shrink-0 items-center gap-0.5 rounded px-1 text-[10px] ${
              s.kind === "category" ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-600"
            }`}
            title={s.kind === "item" ? `item — filters to ${s.category}` : "category"}
          >
            <span className="max-w-[140px] truncate font-mono">{s.label}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                remove(key(s));
              }}
              className="text-slate-400 hover:text-slate-700"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !query && selected.length) remove(key(selected[selected.length - 1]));
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder={selected.length ? "" : "filter / lenses…"}
          className="min-w-[90px] flex-1 bg-transparent px-1 py-0.5 text-[11px] text-slate-700 placeholder-slate-400 outline-none"
        />
      </div>

      {(showPresets || showResults) && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-80 w-80 overflow-auto rounded border border-slate-200 bg-white text-[11px] shadow-lg no-scrollbar">
          {showPresets && (
            <div className="border-b border-slate-100 px-2 py-1.5">
              <PresetGroup
                title="Structural"
                lenses={presets!.lenses.filter((l) => l.tier === "structural")}
                lensActive={lensActive}
                toggleCats={toggleCats}
                setHoverBlurb={setHoverBlurb}
              />
              <PresetGroup
                title="Context"
                lenses={presets!.lenses.filter((l) => l.tier === "context")}
                lensActive={lensActive}
                toggleCats={toggleCats}
                setHoverBlurb={setHoverBlurb}
              />
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <button
                  onClick={() => setCats(presets!.structuralOnly)}
                  onMouseEnter={() => setHoverBlurb("Show only the structural lenses — hide all deposition / method paperwork.")}
                  onMouseLeave={() => setHoverBlurb(null)}
                  className="rounded border border-teal-600/40 bg-teal-50 px-1.5 py-0.5 text-[10px] text-teal-800 hover:bg-teal-100"
                >
                  Structural only
                </button>
                <button
                  onClick={() => setCats(presets!.hideDeposition)}
                  onMouseEnter={() => setHoverBlurb("Keep everything except categories that are purely deposition metadata.")}
                  onMouseLeave={() => setHoverBlurb(null)}
                  className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50"
                >
                  Hide deposition
                </button>
                {selected.length > 0 && (
                  <button
                    onClick={() => onChange([])}
                    className="rounded px-1.5 py-0.5 text-[10px] text-slate-500 hover:text-slate-800"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="mt-1.5 min-h-[14px] text-[10px] leading-tight text-slate-400">
                {hoverBlurb ?? "Click a lens to add its categories. Most categories are deposition paperwork; structural data is a small fraction."}
              </div>
            </div>
          )}

          {showResults && (
            <div className="py-1">
              {catOpts.map((c) => (
                <button
                  key={`c:${c}`}
                  onClick={() => add(catEntry(c))}
                  className="flex w-full items-center justify-between gap-2 px-2 py-0.5 text-left hover:bg-slate-50"
                >
                  <span className="truncate font-mono font-medium text-slate-700">{c}</span>
                  <span className="shrink-0 text-[9px] uppercase tracking-wide text-indigo-400">category</span>
                </button>
              ))}
              {catOpts.length > 0 && itemOpts.length > 0 && <div className="my-1 border-t border-slate-100" />}
              {itemOpts.map((it) => {
                const dot = it.label.indexOf(".");
                const cat = it.label.slice(0, dot + 1);
                const attr = it.label.slice(dot + 1);
                return (
                  <button
                    key={`i:${it.label}`}
                    onClick={() => add({ kind: "item", category: it.category, label: it.label })}
                    className="flex w-full items-center justify-between gap-2 px-2 py-0.5 text-left hover:bg-slate-50"
                  >
                    <span className="truncate font-mono">
                      <span className="text-slate-400">{cat}</span>
                      <span className="text-teal-700">{attr}</span>
                    </span>
                    <span className="shrink-0 text-[9px] uppercase tracking-wide text-slate-300">item</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PresetGroup({
  title,
  lenses,
  lensActive,
  toggleCats,
  setHoverBlurb,
}: {
  title: string;
  lenses: LensPreset[];
  lensActive: (cats: string[]) => boolean;
  toggleCats: (cats: string[]) => void;
  setHoverBlurb: (b: string | null) => void;
}) {
  if (!lenses.length) return null;
  return (
    <div className="mb-1">
      <div className="mb-0.5 text-[9px] uppercase tracking-wide text-slate-400">{title}</div>
      <div className="flex flex-wrap gap-1">
        {lenses.map((l) => {
          const active = lensActive(l.categories);
          return (
            <button
              key={l.id}
              onClick={() => toggleCats(l.categories)}
              onMouseEnter={() => setHoverBlurb(`${l.label} — ${l.blurb}`)}
              onMouseLeave={() => setHoverBlurb(null)}
              title={l.blurb}
              className={`rounded border px-1.5 py-0.5 text-[10px] ${
                active
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {l.short} <span className="text-slate-400">· {l.categories.length}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
