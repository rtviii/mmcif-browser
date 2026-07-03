"use client";
import { useEffect } from "react";

// The file loader, moved out of the (removed) top bar into a compact, semi-transparent card that
// floats over the source pane — shown automatically on an empty tab, reopened via the "Open…" button
// in the file-browser row. Style follows the fend_tubulinxyz demo popups (bg-white/85 + backdrop-blur).
export default function LoaderPopup({
  open,
  onClose,
  pdbId,
  setPdbId,
  onOpenFile,
  onFetch,
  loading,
  error,
}: {
  open: boolean;
  onClose: () => void;
  pdbId: string;
  setPdbId: (v: string) => void;
  onOpenFile: (f: File) => void;
  onFetch: () => void;
  loading: boolean;
  error: string | null;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[320px] max-w-full rounded-lg border border-slate-200/60 bg-white/85 p-3 shadow-lg backdrop-blur-sm">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-600">Load a structure</span>
          <button
            onClick={onClose}
            title="close (Esc)"
            className="rounded px-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ×
          </button>
        </div>

        <label className="mb-2 flex cursor-pointer items-center justify-center rounded border border-dashed border-slate-300 px-2 py-3 text-center text-[11px] text-slate-600 hover:border-indigo-400 hover:text-indigo-600">
          Open a .cif / .mmcif / .bcif file
          <input
            type="file"
            accept=".cif,.mmcif,.bcif"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onOpenFile(e.target.files[0])}
          />
        </label>

        <div className="flex items-center gap-1.5">
          <input
            value={pdbId}
            onChange={(e) => setPdbId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onFetch()}
            placeholder="PDB ID (e.g. 1cbs)"
            className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500"
          />
          <button
            onClick={onFetch}
            className="shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50"
          >
            Fetch
          </button>
        </div>

        <p className="mt-2 text-[10px] leading-tight text-slate-400">
          …or drag a file onto the pane. Heterogeneity demo files live next to the DICT switcher
          (top-right) when the het dictionary is active.
        </p>
        {loading && <p className="mt-1 text-[10px] text-slate-500">loading…</p>}
        {error && <p className="mt-1 text-[10px] text-rose-600">{error}</p>}
      </div>
    </div>
  );
}
