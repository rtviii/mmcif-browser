"use client";
import { useEffect, useRef, useState } from "react";
import type { HierarchyMode } from "@/lib/cif-source/fold-tree";
import { MmcifChip } from "./MmcifChip";

// The consolidated "View" menu: the naming convention + the two "hide" filters that used to sit
// flat in the top bar, each with a plain-English explanation of what it actually does. The
// preamble filter additionally lists the exact categories it will collapse (as hoverable chips),
// so "preamble" stops being a mystery word. Opens on hover (with a grace delay) or click.
export function ViewMenu({
  mode,
  onModeChange,
  collapsePreamble,
  onTogglePreamble,
  hideNoise,
  onToggleNoise,
  stickyHeader,
  onToggleSticky,
  preambleCategories,
}: {
  mode: HierarchyMode;
  onModeChange: (m: HierarchyMode) => void;
  collapsePreamble: boolean;
  onTogglePreamble: () => void;
  hideNoise: boolean;
  onToggleNoise: () => void;
  stickyHeader: boolean;
  onToggleSticky: () => void;
  preambleCategories: string[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  const cancelClose = () => {
    if (closeTimer.current != null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 180);
  };

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

  const activeHides = (collapsePreamble ? 1 : 0) + (hideNoise ? 1 : 0);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 ${
          open || activeHides
            ? "border-indigo-500 bg-indigo-50 text-indigo-700"
            : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
        }`}
      >
        View
        {activeHides > 0 && (
          <span className="rounded-full bg-indigo-600 px-1 text-[9px] leading-tight text-white">{activeHides}</span>
        )}
        <span className="text-[8px] text-slate-400">▼</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[340px] rounded border border-slate-200 bg-white p-3 text-[11px] shadow-lg">
          {/* Naming convention */}
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">Naming</div>
          <div className="flex overflow-hidden rounded border border-slate-300">
            {(["auth", "label"] as const).map((m) => (
              <button
                key={m}
                onClick={() => onModeChange(m)}
                className={`flex-1 px-2 py-0.5 font-mono ${
                  mode === m ? "bg-indigo-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                {m}_*
              </button>
            ))}
          </div>
          <p className="mt-1 leading-snug text-slate-500">
            Group chains/residues by <span className="font-mono text-slate-600">auth_*</span> (author / PDB-assigned
            IDs) or <span className="font-mono text-slate-600">label_*</span> (mmCIF canonical IDs).
          </p>

          <div className="my-2.5 border-t border-slate-100" />

          {/* Hide preamble */}
          <MenuToggle on={collapsePreamble} onToggle={onTogglePreamble} label="Hide preamble" />
          <p className="mt-1 leading-snug text-slate-500">
            Collapse the method &amp; deposition header categories — refinement, diffraction, experimental and
            citation paperwork that precedes the structure.
          </p>
          {collapsePreamble && (
            <div className="mt-1.5">
              {preambleCategories.length ? (
                <div className="flex max-h-28 flex-wrap gap-1 overflow-auto no-scrollbar">
                  {preambleCategories.map((c) => (
                    <MmcifChip key={c} target={{ kind: "category", cat: c }} variant="chip" />
                  ))}
                </div>
              ) : (
                <span className="text-slate-400">No preamble categories in this file.</span>
              )}
            </div>
          )}

          <div className="my-2.5 border-t border-slate-100" />

          {/* Hide noise */}
          <MenuToggle on={hideNoise} onToggle={onToggleNoise} label="Hide noise" />
          <p className="mt-1 leading-snug text-slate-500">
            Drop blank lines and <span className="font-mono text-slate-600">#</span> comment lines so only data rows
            remain.
          </p>

          <div className="my-2.5 border-t border-slate-100" />

          {/* Sticky header */}
          <MenuToggle on={stickyHeader} onToggle={onToggleSticky} label="Sticky header" />
          <p className="mt-1 leading-snug text-slate-500">
            Keep the current category name (and its column headers, in table mode) pinned at the top while you scroll
            through a long block.
          </p>
        </div>
      )}
    </div>
  );
}

function MenuToggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button onClick={onToggle} className="flex w-full items-center gap-2 text-left">
      <span
        className={`relative h-3.5 w-6 shrink-0 rounded-full transition-colors ${on ? "bg-indigo-500" : "bg-slate-300"}`}
      >
        <span
          className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${on ? "left-3" : "left-0.5"}`}
        />
      </span>
      <span className="font-semibold text-slate-700">{label}</span>
    </button>
  );
}
