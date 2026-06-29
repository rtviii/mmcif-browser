"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { type ParsedCif, parseCif } from "@/lib/cif";
import type { MolstarViewer as MolstarViewerInstance } from "@/lib/molstar/viewer";
import { useTabsStore } from "@/lib/tabs-store";
import SourceInspector from "./cif/SourceInspector";

const MolstarViewer = dynamic(() => import("./MolstarViewer"), { ssr: false });

interface LoadedFile {
  data: string | Uint8Array;
  binary: boolean;
  name: string;
}

// One inspector tab: a fully self-contained structure context (its own loaded file, parsed CIF,
// view state, and Mol* viewer). Stays mounted while inactive (hidden by the container) so switching
// tabs is instant and preserves everything. `active` drives the 3D viewer resize on (re)show.
export default function StructureTab({ id, active }: { id: string; active: boolean }) {
  const setTitle = useTabsStore((s) => s.setTitle);

  const [file, setFile] = useState<LoadedFile | null>(null);
  const [parsed, setParsed] = useState<ParsedCif | null>(null);
  const [blockIndex, setBlockIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdbId, setPdbId] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [viewer, setViewer] = useState<MolstarViewerInstance | null>(null);

  // The consolidated top bar holds the file controls (below) plus the inspector's view controls,
  // which SourceInspector portals into this slot so the whole inspector shares one top bar.
  const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null);

  // Draggable split: left (source) panel width as a % of the body; the 3D panel takes the rest.
  const [leftPct, setLeftPct] = useState(50);
  const splitRef = useRef<HTMLDivElement>(null);
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      const rect = splitRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.min(80, Math.max(20, pct)));
      viewer?.handleResize();
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      viewer?.handleResize();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  // The Mol* canvas measures 0x0 while the tab is hidden; resize it when this tab (re)appears.
  useEffect(() => {
    if (active) viewer?.handleResize();
  }, [active, viewer]);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    parseCif(file.data, file.binary)
      .then((p) => {
        if (cancelled) return;
        setParsed(p);
        setBlockIndex(0);
      })
      .catch((e) => !cancelled && setError(e?.message ?? String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [file]);

  async function loadFile(f: File) {
    const binary = /\.bcif$/i.test(f.name);
    const buf = await f.arrayBuffer();
    setFile({
      data: binary ? new Uint8Array(buf) : new TextDecoder().decode(buf),
      binary,
      name: f.name,
    });
    setTitle(id, f.name);
  }

  async function loadPdb() {
    const pid = pdbId.trim().toLowerCase();
    if (!pid) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`https://files.rcsb.org/download/${pid}.cif`);
      if (!res.ok) throw new Error(`fetch ${pid}: HTTP ${res.status}`);
      setFile({ data: await res.text(), binary: false, name: `${pid}.cif` });
      setTitle(id, `${pid}.cif`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }

  const block = parsed?.blocks[blockIndex];

  // File controls — rendered directly in the consolidated bar (they must work before any file is
  // loaded, when SourceInspector isn't mounted to portal its view controls in).
  const fileControls = (
    <>
      <label className="shrink-0 cursor-pointer rounded border border-slate-300 bg-white px-2 py-0.5 text-slate-700 hover:bg-slate-50">
        Open file
        <input
          type="file"
          accept=".cif,.mmcif,.bcif"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])}
        />
      </label>
      <input
        value={pdbId}
        onChange={(e) => setPdbId(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && loadPdb()}
        placeholder="PDB ID (e.g. 1cbs)"
        className="w-28 shrink-0 rounded border border-slate-300 bg-white px-2 py-0.5 text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500"
      />
      <button
        onClick={loadPdb}
        className="shrink-0 rounded border border-slate-300 bg-white px-2 py-0.5 text-slate-700 hover:bg-slate-50"
      >
        Fetch
      </button>
      {file && <span className="shrink-0 truncate font-mono text-slate-500">{file.name}</span>}
      {block && (
        <span className="shrink-0 truncate text-slate-400">
          data_{block.header} · {block.categories.length} cats
        </span>
      )}
      {parsed && parsed.blocks.length > 1 && (
        <select
          value={blockIndex}
          onChange={(e) => setBlockIndex(Number(e.target.value))}
          className="shrink-0 rounded border border-slate-300 bg-white px-1 py-0.5 text-slate-700"
        >
          {parsed.blocks.map((b, i) => (
            <option key={i} value={i}>
              {b.header}
            </option>
          ))}
        </select>
      )}
      {loading && <span className="shrink-0 text-slate-500">loading…</span>}
      {error && <span className="shrink-0 text-rose-600">{error}</span>}
    </>
  );

  return (
    <div
      className="light-surface flex h-full flex-col bg-white text-slate-700"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) loadFile(f);
      }}
    >
      {/* consolidated top bar: file controls + (portaled) inspector view controls + pin chip */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-slate-200 px-3 text-[11px]">
        {fileControls}
        {block && <span className="mx-1 h-5 w-px shrink-0 bg-slate-200" />}
        <div ref={setToolbarSlot} className="flex min-w-0 flex-1 items-center gap-2" />
      </div>

      {/* body */}
      <div ref={splitRef} className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-col border-r border-slate-200" style={{ width: `${leftPct}%` }}>
          {!block ? (
            <div
              className={`m-3 flex flex-1 items-center justify-center rounded border border-dashed text-center text-xs ${
                dragOver ? "border-indigo-400 text-indigo-600" : "border-slate-300 text-slate-400"
              }`}
            >
              Drop a .cif / .mmcif / .bcif file here,
              <br />
              or open one / fetch a PDB ID above.
            </div>
          ) : (
            <SourceInspector file={file} parsed={parsed} viewer={viewer} toolbarSlot={toolbarSlot} active={active} />
          )}
        </div>

        <div
          onMouseDown={startDrag}
          title="drag to resize"
          className="w-1 shrink-0 cursor-col-resize bg-slate-200 transition-colors hover:bg-indigo-400"
        />

        <div className="min-w-0 flex-1 bg-white">
          <MolstarViewer data={file?.data ?? null} binary={file?.binary ?? false} onReady={setViewer} />
        </div>
      </div>
    </div>
  );
}
