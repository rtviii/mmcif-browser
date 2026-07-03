"use client";
import { useEffect, useRef, useState } from "react";
import { useViewSettings } from "@/lib/view-settings";
import { MmcifChip } from "./MmcifChip";

// The global display-settings gear (⚙), placed before "mmCIF" in the NavBar. It drives the shared
// view-settings store, so the naming convention, the two "hide" filters, the sticky header, and the
// outline pane apply across every structure tab. The preamble section lists exactly the categories it
// collapses in the file you're currently looking at (published by the active tab). Opens on hover
// (grace delay) or click. Visual patterns mirror the retired inline ViewMenu.
export function SettingsMenu() {
  const naming = useViewSettings((s) => s.naming);
  const setNaming = useViewSettings((s) => s.setNaming);
  const hidePreamble = useViewSettings((s) => s.hidePreamble);
  const toggleHidePreamble = useViewSettings((s) => s.toggleHidePreamble);
  const hideNoise = useViewSettings((s) => s.hideNoise);
  const toggleHideNoise = useViewSettings((s) => s.toggleHideNoise);
  const stickyHeader = useViewSettings((s) => s.stickyHeader);
  const toggleStickyHeader = useViewSettings((s) => s.toggleStickyHeader);
  const showOutline = useViewSettings((s) => s.showOutline);
  const toggleShowOutline = useViewSettings((s) => s.toggleShowOutline);
  const preambleCategories = useViewSettings((s) => s.activePreambleCategories);

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
        title="display settings"
        className={`flex items-center rounded px-1 py-0.5 text-sm leading-none ${
          open ? "text-neutral-100" : "text-neutral-400 hover:text-neutral-100"
        }`}
      >
        ⚙
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[340px] rounded border border-slate-200 bg-white p-3 text-[11px] text-slate-700 shadow-xl">
          {/* Naming convention */}
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">Naming</div>
          <div className="flex overflow-hidden rounded border border-slate-300">
            {(["auth", "label"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setNaming(m)}
                className={`flex-1 px-2 py-0.5 font-mono ${
                  naming === m ? "bg-indigo-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
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

          {/* Show outline */}
          <MenuToggle on={showOutline} onToggle={toggleShowOutline} label="Outline pane" />
          <p className="mt-1 leading-snug text-slate-500">
            Show the collapsible category / chain / residue outline beside the source.
          </p>

          <div className="my-2.5 border-t border-slate-100" />

          {/* Hide preamble */}
          <MenuToggle on={hidePreamble} onToggle={toggleHidePreamble} label="Hide preamble" />
          <p className="mt-1 leading-snug text-slate-500">
            Collapse the method &amp; deposition header categories — refinement, diffraction, experimental and
            citation paperwork that precedes the structure.
          </p>
          {hidePreamble && (
            <div className="mt-1.5">
              {preambleCategories.length ? (
                <div className="no-scrollbar flex max-h-28 flex-wrap gap-1 overflow-auto">
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
          <MenuToggle on={hideNoise} onToggle={toggleHideNoise} label="Hide noise" />
          <p className="mt-1 leading-snug text-slate-500">
            Drop blank lines and <span className="font-mono text-slate-600">#</span> comment lines so only data rows
            remain.
          </p>

          <div className="my-2.5 border-t border-slate-100" />

          {/* Sticky header */}
          <MenuToggle on={stickyHeader} onToggle={toggleStickyHeader} label="Sticky header" />
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
