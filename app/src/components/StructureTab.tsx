"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { type ParsedCif, parseCif } from "@/lib/cif";
import type { StructureExample } from "@/lib/molstar/examples";
import { HET_PALETTE, type HetModel, parseHeterogeneity } from "@/lib/molstar/het";
import type { StructureView } from "@/lib/molstar/style";
import { parseTlsGroups, type TlsGroup } from "@/lib/molstar/tls";
import type { MolstarViewer as MolstarViewerInstance } from "@/lib/molstar/viewer";
import { useTabsStore } from "@/lib/tabs-store";
import HeterogeneityPanel from "./cif/HeterogeneityPanel";
import LoaderPopup from "./cif/LoaderPopup";
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
  const pendingExample = useTabsStore((s) => s.pendingExample);

  const [file, setFile] = useState<LoadedFile | null>(null);
  const [parsed, setParsed] = useState<ParsedCif | null>(null);
  const [blockIndex, setBlockIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdbId, setPdbId] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [viewer, setViewer] = useState<MolstarViewerInstance | null>(null);

  // The loader popup (Open / Fetch), shown on an empty tab and reopened from the file row's "Open…".
  const [loaderOpen, setLoaderOpen] = useState(true);

  // 3D view config: undefined = the default ball-and-stick look (plain file/PDB loads); set by the
  // examples drawer to override representation + colour theme. modelCount/modelIndex drive the frame
  // scrubber shown for multi-model (e.g. NMR ensemble) structures.
  const [view, setView] = useState<StructureView | undefined>(undefined);
  const [modelCount, setModelCount] = useState(1);
  const [modelIndex, setModelIndex] = useState(0);

  // Loaded heterogeneity example (drives the encoding chip + motion controls), and TLS rigid-body
  // groups parsed from the file when the example demonstrates TLS.
  const [example, setExample] = useState<StructureExample | null>(null);
  const [tlsGroups, setTlsGroups] = useState<TlsGroup[] | null>(null);

  // Proposed heterogeneity-extension networks parsed from the file (_pdbx_alt_groups etc.).
  // `hetColor` = colour atoms by network (the 3D facility); `hetState` indexes the enumerated legal
  // states (-1 = show all networks); `hetPanel` toggles the relationship/states panel.
  const [hetModel, setHetModel] = useState<HetModel | null>(null);
  const [hetColor, setHetColor] = useState(true);
  const [hetState, setHetState] = useState(-1);
  const [hetPanel, setHetPanel] = useState(false);

  // Frame playback (auto-advance the model index) and TLS libration playback.
  const [framePlaying, setFramePlaying] = useState(false);
  const [tlsPlaying, setTlsPlaying] = useState(false);
  // Mol* shader "wiggle": off, B-factor-driven (whole structure), or just the current selection.
  const [wiggle, setWiggle] = useState<"off" | "uncertainty" | "selection">("off");
  const frameTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopFrameAnim = () => {
    if (frameTimer.current) {
      clearInterval(frameTimer.current);
      frameTimer.current = null;
    }
    setFramePlaying(false);
  };
  const toggleFrameAnim = () => {
    if (frameTimer.current) {
      stopFrameAnim();
      return;
    }
    setFramePlaying(true);
    frameTimer.current = setInterval(() => {
      setModelIndex((prev) => {
        const n = modelCount > 0 ? (prev + 1) % modelCount : 0;
        void viewer?.setModelIndex(n);
        return n;
      });
    }, 150);
  };
  const toggleTls = () => {
    if (!viewer) return;
    if (viewer.isTlsAnimating()) {
      viewer.stopTlsAnimation();
      setTlsPlaying(false);
    } else {
      viewer.startTlsAnimation();
      setTlsPlaying(true);
    }
  };
  const toggleUncertaintyWiggle = () => {
    if (!viewer) return;
    if (wiggle === "uncertainty") {
      void viewer.clearWiggle();
      setWiggle("off");
    } else {
      void viewer.applyUncertaintyWiggle();
      setWiggle("uncertainty");
    }
  };
  const toggleSelectionWiggle = () => {
    if (!viewer) return;
    if (wiggle === "selection") {
      void viewer.clearWiggle();
      setWiggle("off");
    } else if (viewer.hasSelection()) {
      void viewer.wiggleSelection();
      setWiggle("selection");
    }
  };

  // Networks prepared for the viewer (a colour + the membership selectors), only when colour-by-
  // network is on. Identity is stable across stepping, so the viewer isn't rebuilt as states change.
  const hetNetworks = useMemo(
    () =>
      hetModel && hetColor
        ? hetModel.networks.map((n, i) => ({
            id: n.id,
            color: HET_PALETTE[i % HET_PALETTE.length],
            selectors: n.members,
          }))
        : null,
    [hetModel, hetColor],
  );

  // Isolate a legal state in 3D: show base + that state's networks (idx -1 = show all networks).
  const applyHetState = (idx: number) => {
    if (!viewer || !hetModel) return;
    setHetState(idx);
    if (idx < 0 || idx >= hetModel.states.length) void viewer.showAllNetworks();
    else void viewer.setVisibleNetworks(new Set(hetModel.states[idx].networks));
  };
  const stepHetState = (delta: number) => {
    if (!hetModel || !hetModel.states.length) return;
    const n = hetModel.states.length;
    let next = hetState + delta;
    if (next < -1) next = n - 1;
    if (next >= n) next = -1;
    applyHetState(next);
  };
  const toggleHetColor = () => {
    setHetColor((c) => !c);
    setHetState(-1);
  };

  // Stop any running animation when the tab goes inactive or unmounts.
  useEffect(() => {
    if (active) return;
    stopFrameAnim();
    if (viewer?.isTlsAnimating()) {
      viewer.stopTlsAnimation();
      setTlsPlaying(false);
    }
    if (wiggle !== "off") {
      void viewer?.clearWiggle();
      setWiggle("off");
    }
  }, [active, viewer, wiggle]);
  useEffect(() => () => stopFrameAnim(), []);

  // The file-browser controls (Table / Expand / Filter / pin / rows) portal into this row over the
  // source pane; the "encodes X" chip portals into the floating bar over the 3D viewer.
  const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null);
  const [viewerBarSlot, setViewerBarSlot] = useState<HTMLDivElement | null>(null);

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
        // Detect the proposed heterogeneity categories; if present, default to colour-by-network.
        const hm = parseHeterogeneity(p.raw);
        setHetModel(hm);
        setHetColor(!!hm);
        setHetState(-1);
        setHetPanel(false);
      })
      .catch((e) => !cancelled && setError(e?.message ?? String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [file]);

  // A loaded file closes the loader popup; an empty tab keeps it open.
  useEffect(() => {
    if (file) setLoaderOpen(false);
  }, [file]);

  // Reset the example/heterogeneity context (called on any plain file/PDB load). Clearing hetModel
  // here means the first viewer load of a new file renders normally; the parse effect re-enables
  // colour-by-network once the new file's networks are known.
  function resetHeterogeneity() {
    stopFrameAnim();
    setTlsPlaying(false);
    setWiggle("off");
    setExample(null);
    setTlsGroups(null);
    setHetModel(null);
    setView(undefined);
    setModelIndex(0);
  }

  async function loadFile(f: File) {
    const binary = /\.bcif$/i.test(f.name);
    const buf = await f.arrayBuffer();
    resetHeterogeneity();
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
    resetHeterogeneity();
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

  // Load a curated heterogeneity example: fetch from RCSB (same path as a PDB id) but apply the
  // example's representation + colour theme so the feature it demonstrates is visible in 3D. For TLS
  // examples, parse the rigid-body groups up front so the viewer builds the librating decomposition.
  async function loadExample(ex: StructureExample) {
    setLoading(true);
    setError(null);
    stopFrameAnim();
    setTlsPlaying(false);
    setWiggle("off");
    setExample(ex);
    setView(ex.view);
    setModelIndex(0);
    setTlsGroups(null);
    setHetModel(null);
    try {
      // Bundled demos (the heterogeneity examples) carry a local `file`; everything else is an RCSB id.
      const url = ex.file ? ex.file.url : `https://files.rcsb.org/download/${ex.pdbId}.cif`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch ${ex.file?.name ?? ex.pdbId}: HTTP ${res.status}`);
      const text = await res.text();
      if (ex.motion === "tls") {
        const parsedForTls = await parseCif(text, false);
        setTlsGroups(parseTlsGroups(parsedForTls.raw));
      }
      const name = ex.file?.name ?? `${ex.pdbId}.cif`;
      setFile({ data: text, binary: false, name });
      setTitle(id, `${ex.pdbId} · ${ex.title}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }

  // Consume an example picked from the NavBar Examples dropdown (next to the DICT switcher) into the
  // ACTIVE tab. The nonce guard makes re-picking the same example fire again; initialising the ref to
  // the current pending nonce means a freshly-opened tab ignores a pick made before it existed.
  const lastExampleNonce = useRef(useTabsStore.getState().pendingExample?.nonce ?? 0);
  useEffect(() => {
    if (!active || !pendingExample || pendingExample.nonce === lastExampleNonce.current) return;
    lastExampleNonce.current = pendingExample.nonce;
    void loadExample(pendingExample.ex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, pendingExample]);

  const block = parsed?.blocks[blockIndex];
  const hasSelectionWiggle = !!block;
  const showViewerBar = !!block; // the floating bar hosts the encodes chip + motion / het controls

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
      {/* body */}
      <div ref={splitRef} className="flex min-h-0 flex-1">
        {/* LEFT: source pane, with its own controls row + the loader popup overlay */}
        <div className="relative flex min-w-0 flex-col border-r border-slate-200" style={{ width: `${leftPct}%` }}>
          {block && (
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-slate-200 px-2 text-[11px]">
              <button
                onClick={() => setLoaderOpen(true)}
                title="open a different file / fetch a PDB id"
                className="shrink-0 rounded border border-slate-300 bg-white px-2 py-0.5 text-slate-700 hover:bg-slate-50"
              >
                Open…
              </button>
              {file && (
                <span className="max-w-[150px] shrink-0 truncate font-mono text-slate-500" title={file.name}>
                  {file.name}
                </span>
              )}
              {block && (
                <span className="hidden shrink-0 truncate text-slate-400 sm:inline">
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
              <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-200" />
              <div ref={setToolbarSlot} className="flex min-w-0 flex-1 items-center gap-2" />
            </div>
          )}

          {!block ? (
            <div
              className={`m-3 flex flex-1 items-center justify-center rounded border border-dashed text-center text-xs ${
                dragOver ? "border-indigo-400 text-indigo-600" : "border-slate-300 text-slate-400"
              }`}
            >
              Drop a .cif / .mmcif / .bcif file here,
              <br />
              or use the loader.
            </div>
          ) : (
            <SourceInspector
              file={file}
              parsed={parsed}
              viewer={viewer}
              toolbarSlot={toolbarSlot}
              viewerBarSlot={viewerBarSlot}
              active={active}
              signature={example?.signature ?? null}
            />
          )}

          <LoaderPopup
            open={loaderOpen}
            onClose={() => setLoaderOpen(false)}
            pdbId={pdbId}
            setPdbId={setPdbId}
            onOpenFile={loadFile}
            onFetch={loadPdb}
            loading={loading}
            error={error}
          />
        </div>

        <div
          onMouseDown={startDrag}
          title="drag to resize"
          className="w-1 shrink-0 cursor-col-resize bg-slate-200 transition-colors hover:bg-indigo-400"
        />

        {/* RIGHT: 3D viewer + floating control bar (example / motion / het) */}
        <div className="relative min-w-0 flex-1 bg-white">
          <MolstarViewer
            data={file?.data ?? null}
            binary={file?.binary ?? false}
            view={view}
            tlsGroups={tlsGroups}
            hetNetworks={hetNetworks}
            onReady={setViewer}
            onLoaded={(info) => {
              setModelCount(info.modelCount);
              setModelIndex(0);
            }}
          />

          {showViewerBar && (
            <div className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1.5 rounded-lg border border-slate-200/60 bg-white/85 px-2 py-1 text-[11px] text-slate-700 shadow-sm backdrop-blur-sm">
              {/* the amber "encodes X" chip portals in here (SourceInspector owns its jump wiring) */}
              <div ref={setViewerBarSlot} className="contents" />

              {modelCount > 1 && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={toggleFrameAnim}
                    className="rounded border border-slate-300 bg-white px-1.5 py-0 text-slate-700 hover:bg-slate-50"
                    title="play / pause the frames"
                  >
                    {framePlaying ? "pause" : "play"}
                  </button>
                  <span className="text-slate-500">frame</span>
                  <input
                    type="range"
                    min={0}
                    max={modelCount - 1}
                    value={modelIndex}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setModelIndex(n);
                      void viewer?.setModelIndex(n);
                    }}
                    className="h-1 w-24 cursor-pointer accent-indigo-500"
                    title="scrub model / frame"
                  />
                  <span className="shrink-0 tabular-nums text-slate-600">
                    {modelIndex + 1}/{modelCount}
                  </span>
                </div>
              )}

              {example?.motion === "tls" && tlsGroups && tlsGroups.length > 0 && (
                <button
                  onClick={toggleTls}
                  className={`shrink-0 rounded border px-2 py-0.5 ${
                    tlsPlaying
                      ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                  title="animate the TLS rigid-body libration"
                >
                  {tlsPlaying ? "stop libration" : `play libration (${tlsGroups.length} groups)`}
                </button>
              )}

              {/* Wiggle group — renamed to "Animate B-factors" / "Animate selection", with a plain
                  explanation of the spatially-correlated noise field (Mol* position mode, freq ~0.2). */}
              {(example?.motion === "wiggle" || hasSelectionWiggle) && (
                <div className="flex shrink-0 items-center gap-1">
                  {example?.motion === "wiggle" && (
                    <button
                      onClick={toggleUncertaintyWiggle}
                      className={`rounded border px-1.5 py-0 ${
                        wiggle === "uncertainty"
                          ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                      title="Animate B-factors — each atom jitters by an amount set by its B-factor (bigger B = more motion)."
                    >
                      {wiggle === "uncertainty" ? "stop B-factors" : "Animate B-factors"}
                    </button>
                  )}
                  {hasSelectionWiggle && (
                    <button
                      onClick={toggleSelectionWiggle}
                      className={`rounded border px-1.5 py-0 ${
                        wiggle === "selection"
                          ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                      title="Animate selection — wiggles only the pinned atoms. Pin a residue or atom first, then click."
                    >
                      {wiggle === "selection" ? "stop selection" : "Animate selection"}
                    </button>
                  )}
                  <span
                    title={
                      "How it works: both use Mol*'s smooth 'position' noise field (spatial frequency ~0.2). " +
                      "Every atom is displaced by one shared, spatially-correlated field, so neighbours move together " +
                      "and bonds flex instead of tearing. B-factor mode scales each atom's amplitude by its B-factor; " +
                      "selection mode uses a fixed amplitude that tapers to zero ~6 Å out from the pinned atoms " +
                      "(1.0 → 0.66 → 0.4 → 0.2)."
                    }
                    className="cursor-help select-none text-slate-400"
                  >
                    ⓘ
                  </span>
                </div>
              )}

              {hetModel && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={toggleHetColor}
                    className={`rounded border px-1.5 py-0 ${
                      hetColor
                        ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                    title="colour each network distinctly (base grey)"
                  >
                    {hetColor ? "networks ✓" : "color by network"}
                  </button>
                  {hetColor && hetModel.states.length > 0 && (
                    <>
                      <button
                        onClick={() => stepHetState(-1)}
                        className="rounded px-1 text-slate-600 hover:bg-slate-200"
                        title="previous state"
                      >
                        ‹
                      </button>
                      <span className="tabular-nums text-slate-600">
                        {hetState === -1
                          ? `all states (${hetModel.states.length})`
                          : `state ${hetState + 1}/${hetModel.states.length}`}
                      </span>
                      <button
                        onClick={() => stepHetState(1)}
                        className="rounded px-1 text-slate-600 hover:bg-slate-200"
                        title="next state"
                      >
                        ›
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setHetPanel((p) => !p)}
                    className={`rounded border px-1.5 py-0 ${
                      hetPanel
                        ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                    title="show the networks / hierarchy / states panel"
                  >
                    relationships
                  </button>
                </div>
              )}
            </div>
          )}

          {hetModel && hetPanel && (
            <HeterogeneityPanel
              model={hetModel}
              viewer={viewer}
              activeStateIndex={hetState}
              onPickState={applyHetState}
              onClose={() => setHetPanel(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
