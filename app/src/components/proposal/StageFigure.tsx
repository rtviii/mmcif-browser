"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseCif } from "@/lib/cif";
import { segmentDocument, type CifDocument } from "@/lib/cif-source/segment";
import { buildLineToRowFull } from "@/lib/cif-source/table";
import { asMolCifFile, type MolCifFile } from "@/lib/cif-source/types";
import { parseHeterogeneity, HET_PALETTE_MUTED, type HetModel } from "@/lib/molstar/het";
import { buildNetworkLineIndex, HET_ID_FIELDS, type NetworkLines } from "@/lib/molstar/het-lines";
import { buildAtomQuery, buildResidueQuery, executeQuery } from "@/lib/molstar/queries";
import type { HetVizNetwork, MolstarViewer as MolstarViewerInstance } from "@/lib/molstar/viewer";
import type { StructureView } from "@/lib/molstar/style";
import { CifPanel, type CifPanelHandle, type LineMark } from "./CifPanel";

const MolstarViewer = dynamic(() => import("@/components/MolstarViewer"), { ssr: false });

const swatch = (color: number) => `#${color.toString(16).padStart(6, "0")}`;
const FLASH_MS = 1200;

type Target =
  | { kind: "network"; id: string }
  | { kind: "atom"; chain: string; seq: number; atomId: string; altId?: string };

export interface StageFigureProps {
  fileUrl: string;
  view?: StructureView;
  het?: boolean;
  truncateBefore?: string;
  codeTitle?: string;
  caption?: React.ReactNode;
  /** Shown in the control strip when the file carries no networks, so an unannotated figure
   *  explains its empty strip instead of merely lacking one. */
  note?: React.ReactNode;
  /** Height of the whole figure row: the source panel is bounded to it and scrolls internally. */
  height?: string;
}

export function StageFigure({
  fileUrl,
  view,
  het = false,
  truncateBefore,
  codeTitle,
  caption,
  note,
  height = "600px",
}: StageFigureProps) {
  // Collapsed by default. Eight figures on the page, and a mounted Mol* plugin is by far the most
  // expensive thing on it — so nothing below is rendered, fetched or instantiated until asked for.
  const [open, setOpen] = useState(false);

  const [cif, setCif] = useState<string | null>(null);
  const [molFile, setMolFile] = useState<MolCifFile | null>(null);
  const [model, setModel] = useState<HetModel | null>(null);
  const [viewer, setViewer] = useState<MolstarViewerInstance | null>(null);

  const [activeNet, setActiveNet] = useState<string | null>(null);
  const [activeState, setActiveState] = useState(-1);
  const [hoverLines, setHoverLines] = useState<ReadonlySet<number> | null>(null);
  const [flashLines, setFlashLines] = useState<ReadonlySet<number> | null>(null);

  const panelRef = useRef<CifPanelHandle>(null);
  const flashTimer = useRef<number | null>(null);

  const onReady = useCallback((v: MolstarViewerInstance | null) => setViewer(v), []);

  // Fetched and parsed on first expand, then kept: collapsing unmounts the viewer, but re-expanding
  // should not re-fetch. `fileUrl` and `het` are fixed per figure on this page.
  useEffect(() => {
    if (!open || cif) return;
    let cancelled = false;
    (async () => {
      try {
        const text = await fetch(fileUrl).then((r) => r.text());
        if (cancelled) return;
        setCif(text);
        const parsed = await parseCif(text, false);
        if (cancelled) return;
        setMolFile(asMolCifFile(parsed.raw));
        if (het) setModel(parseHeterogeneity(parsed.raw));
      } catch (e) {
        console.error("proposal stage failed to load", fileUrl, e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, cif, fileUrl, het]);

  // Collapsing unmounts MolstarViewer, which never reports the loss (its onReady effect has no
  // cleanup). Drop the handle ourselves, or the next expand can drive a disposed plugin in the
  // window before the fresh one is ready. Selection resets with it.
  useEffect(() => {
    if (open) return;
    setViewer(null);
    setActiveNet(null);
    setActiveState(-1);
    setHoverLines(null);
  }, [open]);

  useEffect(() => () => {
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
  }, []);

  const doc = useMemo<CifDocument | null>(() => (cif ? segmentDocument(cif) : null), [cif]);

  const hetNetworks = useMemo<HetVizNetwork[] | null>(() => {
    if (!model) return null;
    return model.networks.map((n, i) => ({
      id: n.id,
      color: HET_PALETTE_MUTED[i % HET_PALETTE_MUTED.length],
      selectors: n.members,
    }));
  }, [model]);

  const colorOf = useMemo(() => {
    const m = new Map<string, string>();
    model?.networks.forEach((n, i) =>
      m.set(n.id, swatch(HET_PALETTE_MUTED[i % HET_PALETTE_MUTED.length])),
    );
    return m;
  }, [model]);

  // network id -> the source lines that are about it (see lib/molstar/het-lines.ts)
  const netLines = useMemo<Map<string, NetworkLines> | null>(
    () => (doc && molFile && model ? buildNetworkLineIndex(doc, molFile, model) : null),
    [doc, molFile, model],
  );

  // Persistent marks. At rest every het row carries a faint rail in its network's colour, so the
  // code reads as a legend. Selecting a network promotes its definition rows to a full highlight
  // and rails its atom rows.
  const marks = useMemo(() => {
    const m = new Map<number, LineMark>();
    if (!netLines || !model) return m;
    const put = (ln: number, color: string, tier: LineMark["tier"]) => {
      const cur = m.get(ln);
      if (!cur || (cur.tier === "rail" && tier === "row")) m.set(ln, { color, tier });
    };
    for (const [id, lines] of netLines) {
      const color = colorOf.get(id);
      if (!color) continue;
      for (const ln of lines.meta) put(ln, color, "rail");
    }
    const active = activeNet
      ? [activeNet]
      : activeState >= 0
        ? (model.states[activeState]?.networks ?? [])
        : [];
    for (const id of active) {
      const lines = netLines.get(id);
      const color = colorOf.get(id);
      if (!lines || !color) continue;
      for (const ln of lines.meta) put(ln, color, "row");
      for (const ln of lines.atoms) put(ln, color, "rail");
    }
    return m;
  }, [netLines, model, colorOf, activeNet, activeState]);

  // The editor motion: mark, scroll the panel to the anchor, flash briefly.
  const snapTo = useCallback((lines: number[], anchor: number) => {
    if (!lines.length) return;
    requestAnimationFrame(() => panelRef.current?.reveal(lines, anchor));
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    setFlashLines(new Set(lines)); // a fresh Set, so re-clicking the same chip re-fires
    flashTimer.current = window.setTimeout(() => setFlashLines(null), FLASH_MS);
  }, []);

  const pickNetwork = useCallback(
    (id: string) => {
      const next = activeNet === id ? null : id; // click again to release
      setActiveNet(next);
      setActiveState(-1);
      if (!next) {
        viewer?.showAllNetworks();
        return;
      }
      viewer?.showAllNetworks();
      const lines = netLines?.get(id);
      if (lines) snapTo(lines.meta, lines.anchor);
      viewer?.focusNetwork(id);
    },
    [activeNet, netLines, viewer, snapTo],
  );

  const pickState = useCallback(
    (idx: number) => {
      setActiveState(idx);
      setActiveNet(null);
      if (!viewer || !model) return;
      if (idx < 0) {
        viewer.showAllNetworks();
        return;
      }
      const ids = model.states[idx]?.networks ?? [];
      viewer.setVisibleNetworks(new Set(ids));
      const lines = ids.flatMap((id) => netLines?.get(id)?.meta ?? []);
      const anchors = ids.map((id) => netLines?.get(id)?.anchor ?? Infinity).filter((n) => n >= 0);
      if (lines.length) snapTo(lines, anchors.length ? Math.min(...anchors) : -1);
    },
    [model, netLines, viewer, snapTo],
  );

  const hoverNetwork = useCallback(
    (id: string | null) => {
      viewer?.highlightNetwork(id);
      if (!id) return setHoverLines(null);
      const lines = netLines?.get(id);
      if (!lines) return setHoverLines(null);
      setHoverLines(new Set([...lines.meta, ...lines.atoms]));
    },
    [viewer, netLines],
  );

  // Resolve a hovered/clicked source line to a 3D target: a named network (het rows) or an atom.
  const resolveTarget = useCallback(
    (idx: number): Target | null => {
      if (!doc || !molFile) return null;
      const si = doc.lineToSpan[idx];
      if (si < 0) return null;
      const span = doc.spans[si];
      if (span.kind !== "loop") return null;
      const cat = molFile.blocks[span.block]?.categories[span.category];
      if (!cat) return null;
      const row = buildLineToRowFull(doc, span, cat.rowCount).get(idx);
      if (row == null) return null;
      const idFields = HET_ID_FIELDS[span.category];
      if (idFields) {
        const id = cat.getField(idFields[0])?.str(row)?.trim();
        return id && id !== "." && id !== "base" ? { kind: "network", id } : null;
      }
      if (span.category === "atom_site") {
        const chain = cat.getField("auth_asym_id")?.str(row)?.trim();
        const seq = cat.getField("auth_seq_id")?.int(row);
        const atomId = cat.getField("label_atom_id")?.str(row)?.trim();
        const altRaw = cat.getField("label_alt_id")?.str(row)?.trim();
        const altId = altRaw && altRaw !== "." && altRaw !== "?" ? altRaw : undefined;
        if (chain && atomId && seq != null && !Number.isNaN(seq)) {
          return { kind: "atom", chain, seq, atomId, altId };
        }
      }
      return null;
    },
    [doc, molFile],
  );

  const onHoverLine = useCallback(
    (idx: number | null) => {
      if (!viewer) return;
      if (idx == null) {
        viewer.highlightNetwork(null);
        viewer.highlightLoci(null);
        setHoverLines(null);
        return;
      }
      const t = resolveTarget(idx);
      if (!t) {
        viewer.highlightNetwork(null);
        viewer.highlightLoci(null);
        return;
      }
      if (t.kind === "network") {
        viewer.highlightLoci(null);
        viewer.highlightNetwork(t.id);
      } else {
        viewer.highlightNetwork(null);
        const struct = viewer.getCurrentStructure();
        if (struct) {
          viewer.highlightLoci(executeQuery(buildAtomQuery(t.chain, t.seq, t.atomId, t.altId), struct));
        }
      }
    },
    [viewer, resolveTarget],
  );

  const onActivateLine = useCallback(
    (idx: number) => {
      if (!viewer) return;
      const t = resolveTarget(idx);
      if (!t) return;
      if (t.kind === "network") {
        pickNetwork(t.id);
        return;
      }
      const struct = viewer.getCurrentStructure();
      if (!struct) return;
      const residue = executeQuery(buildResidueQuery(t.chain, t.seq), struct);
      const atom = executeQuery(buildAtomQuery(t.chain, t.seq, t.atomId, t.altId), struct);
      if (residue) viewer.focusLoci(residue);
      if (atom) viewer.setSelection(atom);
    },
    [viewer, resolveTarget, pickNetwork],
  );

  const strip =
    model && model.networks.length > 0 ? (
      <HetControls
        model={model}
        colorOf={colorOf}
        activeNet={activeNet}
        activeState={activeState}
        onPickNetwork={pickNetwork}
        onPickState={pickState}
        onHoverNetwork={hoverNetwork}
      />
    ) : note ? (
      <div className="rounded border border-slate-200 bg-white px-3 py-2 text-[11px] leading-relaxed text-slate-500">
        {note}
      </div>
    ) : null;

  return (
    // Collapsed the figure sits in the prose column, so it reads as a line in the text rather than
    // interrupting it. Expanded it spans the full grid (see .doc-grid / .bleed in globals.css).
    <figure className={`my-7 ${open ? "bleed" : ""}`}>
      <div className={open ? "mx-auto max-w-[1800px] px-6" : ""}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
        >
          <span
            className={`shrink-0 text-[9px] text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
          >
            ▶
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-600">
            {codeTitle}
          </span>
          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            {open ? "hide" : "show"}
          </span>
        </button>

        {open && (
          <>
            <div
              className="mt-2 flex flex-col gap-3 lg:h-[var(--fig-h)] lg:flex-row lg:gap-4"
              style={{ ["--fig-h" as string]: height }}
            >
              {/* LEFT — the source, bounded to the figure height and scrolling internally.
                  min-h-0 at every level of the chain, or a flex child refuses to shrink below its
                  content and the panel runs off the bottom of the figure. */}
              <div className="flex h-[440px] min-h-0 min-w-0 flex-col lg:h-full lg:flex-1">
                <CifPanel
                  ref={panelRef}
                  className="h-full"
                  cif={cif ?? ""}
                  doc={doc}
                  molFile={molFile}
                  title={fileUrl.split("/").pop()}
                  truncateBefore={truncateBefore}
                  marks={marks}
                  hoverLines={hoverLines}
                  flashLines={flashLines}
                  onHoverLine={onHoverLine}
                  onActivateLine={onActivateLine}
                />
              </div>

              {/* RIGHT — the viewer. Mounted only while open: useMolstarViewer builds the plugin
                  from a mount effect, so not rendering this is what keeps the page cheap. */}
              <div className="relative h-[340px] min-h-0 w-full overflow-hidden rounded border border-slate-200 bg-white lg:h-full lg:w-[440px] lg:shrink-0">
                <MolstarViewer
                  data={cif}
                  binary={false}
                  view={view}
                  hetNetworks={hetNetworks}
                  minimal
                  onReady={onReady}
                />
              </div>
            </div>

            {/* The control strip spans source + viewer, so the chips have the whole figure to wrap
                into. In the viewer column they were silently clipped. */}
            {strip && <div className="mt-2">{strip}</div>}

            {caption && (
              <figcaption className="mt-3 max-w-[110ch] text-[12px] leading-relaxed text-slate-500">
                {caption}
              </figcaption>
            )}
          </>
        )}
      </div>
    </figure>
  );
}

/* ---------------------------------------------------------------- the control strip */

function chip(active: boolean) {
  return `inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10.5px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400 ${
    active
      ? "border-slate-400 bg-slate-100 text-slate-800"
      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
  }`;
}

// One labelled track. The fixed-width label column is what makes the rows read as a toolbar rather
// than a wrapped pile: every chip starts at the same x. The chips wrap — the strip has the width of
// the whole figure now, so nothing needs to be clipped.
function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 border-b border-slate-100 px-2 py-1.5 last:border-0">
      <span className="mt-0.5 w-14 shrink-0 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1">{children}</div>
    </div>
  );
}

function HetControls({
  model,
  colorOf,
  activeNet,
  activeState,
  onPickNetwork,
  onPickState,
  onHoverNetwork,
}: {
  model: HetModel;
  colorOf: Map<string, string>;
  activeNet: string | null;
  activeState: number;
  onPickNetwork: (id: string) => void;
  onPickState: (idx: number) => void;
  onHoverNetwork: (id: string | null) => void;
}) {
  return (
    <div className="rounded border border-slate-200 bg-white text-[11px]">
      <ChipRow label="networks">
        {model.networks.map((n) => (
          <button
            key={n.id}
            className={chip(activeNet === n.id)}
            aria-pressed={activeNet === n.id}
            title="show this network in the source"
            onClick={() => onPickNetwork(n.id)}
            onMouseEnter={() => onHoverNetwork(n.id)}
            onMouseLeave={() => onHoverNetwork(null)}
          >
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
              style={{ background: colorOf.get(n.id) }}
            />
            <span>{n.id}</span>
            {n.occupancy != null && (
              <span className="tabular-nums text-slate-400">{n.occupancy.toFixed(2)}</span>
            )}
          </button>
        ))}
      </ChipRow>

      <ChipRow label="states">
        <button className={chip(activeState === -1 && !activeNet)} onClick={() => onPickState(-1)}>
          all
        </button>
        {model.states.map((s, i) => (
          <button
            key={s.id}
            className={chip(activeState === i)}
            aria-pressed={activeState === i}
            title={s.label}
            onClick={() => onPickState(i)}
          >
            {s.networks.length ? s.networks.join(" + ") : "base"}
            {s.probability != null && (
              <span className="tabular-nums text-slate-400">
                {(s.probability * 100).toFixed(0)}%
              </span>
            )}
          </button>
        ))}
      </ChipRow>

      {model.exclusions.length > 0 && (
        <ChipRow label="excludes">
          {model.exclusions.map((e) => (
            <span
              key={e.id}
              className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10.5px] text-slate-500"
            >
              {e.a} <span className="text-slate-400">not</span> {e.b}
            </span>
          ))}
        </ChipRow>
      )}
    </div>
  );
}
