"use client";
import { useEffect, useRef, useState } from "react";
import { EXAMPLE_GROUPS, type StructureExample } from "@/lib/molstar/examples";

// A small dropdown "drawer" in the inspector top bar: a curated list of structures that each
// demonstrate one kind of heterogeneity (B-factors, ANISOU ellipsoids, multi-model ensembles, TLS).
// Picking one hands the example up to the tab, which fetches it from RCSB and renders it with the
// representation/colour theme baked into the example.
export default function ExamplesDrawer({ onPick }: { onPick: (ex: StructureExample) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`rounded border px-2 py-0.5 ${
          open ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        Examples ▾
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-[70vh] w-80 overflow-auto rounded border border-slate-200 bg-white py-1 shadow-lg">
          {EXAMPLE_GROUPS.map((g) => (
            <div key={g.label} className="border-b border-slate-100 py-1 last:border-0">
              <div className="px-3 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{g.label}</div>
              {g.note && <div className="px-3 pb-1 text-[10px] leading-tight text-slate-400">{g.note}</div>}
              {g.items.map((ex) => (
                <button
                  key={ex.id ?? ex.pdbId}
                  onClick={() => {
                    onPick(ex);
                    setOpen(false);
                  }}
                  className="block w-full px-3 py-1.5 text-left hover:bg-indigo-50"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[11px] font-semibold uppercase text-indigo-700">{ex.pdbId}</span>
                    <span className="truncate text-[11px] text-slate-700">{ex.title}</span>
                  </div>
                  <div className="text-[10px] leading-tight text-slate-400">{ex.blurb}</div>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
