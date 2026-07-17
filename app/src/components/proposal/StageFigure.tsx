"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseCif } from "@/lib/cif";
import { segmentDocument, type CifDocument } from "@/lib/cif-source/segment";
import { buildLineToRowFull } from "@/lib/cif-source/table";
import { asMolCifFile, type MolCifFile } from "@/lib/cif-source/types";
import { parseHeterogeneity, HET_PALETTE_MUTED, type HetModel } from "@/lib/molstar/het";
import { buildNetworkLineIndex, HET_ID_FIELDS, type NetworkLines } from "@/lib/molstar/het-lines";
import {
  buildAltGroupExpression,
  buildAtomQuery,
  buildResidueQuery,
  executeQuery,
  type AltGroupSelector,
} from "@/lib/molstar/queries";
import type { HetVizNetwork, MolstarViewer as MolstarViewerInstance } from "@/lib/molstar/viewer";
import type { StructureView } from "@/lib/molstar/style";
import { CifPanel, type CifPanelHandle, type LineMark } from "./CifPanel";
import { FigureProvider, type FigureApi } from "./FigureContext";

const MolstarViewer = dynamic(() => import("@/components/MolstarViewer"), { ssr: false });

const swatch = (color: number) => `#${color.toString(16).padStart(6, "0")}`;
const FLASH_MS = 1200;

type Target =
  | { kind: "network"; id: string }
  | { kind: "atom"; chain: string; seq: number; atomId: string; altId?: string };

// Every annotated example begins its proposed block with this category, so it is the uniform cut
// point for the dict-switch's "current mmCIF" view.
const PROPOSED_CUT = "_pdbx_alt_groups";

/** One _atom_site row, flattened: what it is, and which source line it is on. This one index
 *  serves both the altloc chips and the <Tok>s in `brief` — they ask the same question ("which
 *  rows are these?") and the answer must not be computed two different ways. */
interface AtomRow {
  line: number;
  chain: string;
  seq: number;
  atomId: string;
  alt: string | null;
  occ: number | null;
}

interface AltLoc {
  letter: string;
  /** The occupancy, only when every row carrying the letter agrees on one. Where a letter means
   *  different occupancies in different residues — which is the whole point of the deposited 5E1N
   *  figure — there is no single number to show, and claiming one would be a lie. */
  occ: number | null;
  selectors: AltGroupSelector[];
  lines: number[];
}

export interface StageFigureProps {
  /** DOM id applied to the <figure>, so the example glossary can link to it. */
  id?: string;
  fileUrl: string;
  view?: StructureView;
  het?: boolean;
  truncateBefore?: string;
  codeTitle?: string;
  caption?: React.ReactNode;
  /** This example's own preamble, shown inside the expanded figure. It is where the explanation
   *  of *this file* lives — the level of detail below the section it sits in. <Tok>s written in
   *  it drive the figure through FigureContext. */
  brief?: React.ReactNode;
  /** Height of the whole figure row: the source panel is bounded to it and scrolls internally. */
  height?: string;
}

export function StageFigure({
  id,
  fileUrl,
  view,
  het = false,
  truncateBefore,
  codeTitle,
  caption,
  brief,
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
  const [activeAlt, setActiveAlt] = useState<string | null>(null);
  const [hoverLines, setHoverLines] = useState<ReadonlySet<number> | null>(null);
  const [flashLines, setFlashLines] = useState<ReadonlySet<number> | null>(null);

  const panelRef = useRef<CifPanelHandle>(null);
  const figureRef = useRef<HTMLElement>(null);
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
    setActiveAlt(null);
    setHoverLines(null);
  }, [open]);

  useEffect(() => () => {
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
  }, []);

  // A glossary link points at this figure's id. Figures are collapsed by default, so arriving via
  // the hash must also open the target — otherwise the reader lands on a bare toggle button. This
  // drives the same `open` state the button does, so the lazy fetch/mount still runs, for this one
  // figure only.
  useEffect(() => {
    if (!id) return;
    const openIfTargeted = () => {
      if (window.location.hash === `#${id}`) {
        setOpen(true);
        figureRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    openIfTargeted();
    window.addEventListener("hashchange", openIfTargeted);
    return () => window.removeEventListener("hashchange", openIfTargeted);
  }, [id]);

  // The dict-switch cut is uniform (PROPOSED_CUT) for annotated figures. An explicit truncateBefore
  // (the "where the letter stops" figure) stays a fixed one-way cut with no toggle.
  const cutMarker = truncateBefore ?? (het ? PROPOSED_CUT : undefined);
  const showSwitch = het && !truncateBefore;

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

  // Every _atom_site row, flattened once: the basis for the altloc chips and for the residue/atom
  // <Tok>s alike.
  const atomRows = useMemo<AtomRow[]>(() => {
    if (!doc || !molFile) return [];
    const out: AtomRow[] = [];
    for (const span of doc.spans) {
      if (span.kind !== "loop" || span.category !== "atom_site") continue;
      const cat = molFile.blocks[span.block]?.categories[span.category];
      if (!cat) continue;
      const chainF = cat.getField("auth_asym_id");
      const seqF = cat.getField("auth_seq_id");
      const atomF = cat.getField("label_atom_id");
      const altF = cat.getField("label_alt_id");
      const occF = cat.getField("occupancy");
      for (const [line, row] of buildLineToRowFull(doc, span, cat.rowCount)) {
        const chain = chainF?.str(row)?.trim();
        const seq = seqF?.int(row);
        const atomId = atomF?.str(row)?.trim();
        if (!chain || !atomId || seq == null || Number.isNaN(seq)) continue;
        const altRaw = altF?.str(row)?.trim();
        const occ = occF?.float(row);
        out.push({
          line,
          chain,
          seq,
          atomId,
          alt: altRaw && altRaw !== "." && altRaw !== "?" ? altRaw : null,
          occ: occ == null || Number.isNaN(occ) ? null : occ,
        });
      }
    }
    return out;
  }, [doc, molFile]);

  // The raw alternates the file carries, with no annotation needed. One selector per (chain,
  // letter) over that letter's residue span: the expression's own atom-test filters by
  // label_alt_id, so a range never over-selects the residues that lack the letter.
  const altLocs = useMemo<AltLoc[]>(() => {
    const byLetter = new Map<string, AtomRow[]>();
    for (const r of atomRows) {
      if (!r.alt) continue;
      (byLetter.get(r.alt) ?? byLetter.set(r.alt, []).get(r.alt)!).push(r);
    }
    return [...byLetter.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([letter, rows]) => {
        const byChain = new Map<string, number[]>();
        for (const r of rows) (byChain.get(r.chain) ?? byChain.set(r.chain, []).get(r.chain)!).push(r.seq);
        const occs = new Set(rows.map((r) => r.occ));
        return {
          letter,
          occ: occs.size === 1 ? [...occs][0] : null,
          selectors: [...byChain.entries()].map(([chain, seqs]) => ({
            chain,
            seqStart: Math.min(...seqs),
            seqEnd: Math.max(...seqs),
            altId: letter,
            atomId: null,
          })),
          lines: rows.map((r) => r.line),
        };
      });
  }, [atomRows]);

  const colorOfAlt = useMemo(() => {
    const m = new Map<string, string>();
    altLocs.forEach((a, i) => m.set(a.letter, swatch(HET_PALETTE_MUTED[i % HET_PALETTE_MUTED.length])));
    return m;
  }, [altLocs]);

  // Persistent marks. At rest every het row carries a faint rail in its network's colour, so the
  // code reads as a legend. Selecting a network promotes its definition rows to a full highlight
  // and rails its atom rows.
  const marks = useMemo(() => {
    const m = new Map<number, LineMark>();
    const put = (ln: number, color: string, tier: LineMark["tier"]) => {
      const cur = m.get(ln);
      if (!cur || (cur.tier === "rail" && tier === "row")) m.set(ln, { color, tier });
    };

    // Unannotated file: the letters themselves are the only grouping there is, so rail every
    // lettered row in its letter's colour. On the deposited 5E1N that legend is the argument —
    // the reader sees two colour sets that do not line up before reading a word about it.
    if (!netLines || !model) {
      for (const a of altLocs) {
        const color = colorOfAlt.get(a.letter);
        if (!color) continue;
        for (const ln of a.lines) put(ln, color, activeAlt === a.letter ? "row" : "rail");
      }
      return m;
    }
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
  }, [netLines, model, colorOf, activeNet, activeState, altLocs, colorOfAlt, activeAlt]);

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

  const altLociOf = useCallback(
    (letter: string) => {
      const a = altLocs.find((x) => x.letter === letter);
      const struct = viewer?.getCurrentStructure();
      if (!a || !struct) return null;
      return executeQuery(buildAltGroupExpression(a.selectors), struct);
    },
    [altLocs, viewer],
  );

  // The unannotated counterpart of pickNetwork: select every atom carrying one letter.
  const pickAltLoc = useCallback(
    (letter: string) => {
      const next = activeAlt === letter ? null : letter; // click again to release
      setActiveAlt(next);
      if (!next) {
        viewer?.clearSelection();
        return;
      }
      const loci = altLociOf(letter);
      if (loci) {
        viewer?.setSelection(loci);
        viewer?.focusLoci(loci);
      }
      const a = altLocs.find((x) => x.letter === letter);
      if (a?.lines.length) snapTo(a.lines, Math.min(...a.lines));
    },
    [activeAlt, altLocs, altLociOf, viewer, snapTo],
  );

  const hoverAltLoc = useCallback(
    (letter: string | null) => {
      if (!letter) {
        viewer?.highlightLoci(null);
        return setHoverLines(null);
      }
      viewer?.highlightLoci(altLociOf(letter));
      const a = altLocs.find((x) => x.letter === letter);
      setHoverLines(a ? new Set(a.lines) : null);
    },
    [viewer, altLocs, altLociOf],
  );

  // Focus a residue (or an inclusive range) and snap the source to its first row.
  const focusResidue = useCallback(
    (chain: string, seqStart: number, seqEnd?: number) => {
      const struct = viewer?.getCurrentStructure();
      if (!struct) return;
      const loci = executeQuery(buildResidueQuery(chain, seqStart, seqEnd), struct);
      if (loci) viewer?.focusLoci(loci);
      const end = seqEnd ?? seqStart;
      const lines = atomRows
        .filter((r) => r.chain === chain && r.seq >= seqStart && r.seq <= end)
        .map((r) => r.line);
      if (lines.length) snapTo(lines, Math.min(...lines));
    },
    [viewer, atomRows, snapTo],
  );

  // Focus the residue, select the one atom inside it, and snap the source to that atom's row.
  const focusAtom = useCallback(
    (chain: string, seq: number, atomId: string, altId?: string) => {
      const struct = viewer?.getCurrentStructure();
      if (!struct) return;
      const residue = executeQuery(buildResidueQuery(chain, seq), struct);
      const atom = executeQuery(buildAtomQuery(chain, seq, atomId, altId), struct);
      if (residue) viewer?.focusLoci(residue);
      if (atom) viewer?.setSelection(atom);
      const lines = atomRows
        .filter(
          (r) =>
            r.chain === chain &&
            r.seq === seq &&
            r.atomId === atomId &&
            (altId == null || r.alt === altId),
        )
        .map((r) => r.line);
      if (lines.length) snapTo(lines, Math.min(...lines));
    },
    [viewer, atomRows, snapTo],
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
      if (t.kind === "network") pickNetwork(t.id);
      else focusAtom(t.chain, t.seq, t.atomId, t.altId);
    },
    [viewer, resolveTarget, pickNetwork, focusAtom],
  );

  // What a <Tok> in `brief` can drive. Same handlers the control strip below the viewer uses.
  const figureApi = useMemo<FigureApi>(
    () => ({
      pickNetwork,
      hoverNetwork,
      pickAltLoc,
      hoverAltLoc,
      focusResidue,
      focusAtom,
      knownNetworks: new Set(model?.networks.map((n) => n.id) ?? []),
      knownAltLocs: new Set(altLocs.map((a) => a.letter)),
      ready: !!viewer,
    }),
    [pickNetwork, hoverNetwork, pickAltLoc, hoverAltLoc, focusResidue, focusAtom, model, altLocs, viewer],
  );

  // Annotated files get the network/state strip; unannotated ones get their raw letters, which is
  // all they have. A file with neither (the fully-occupied baseline) gets no strip: there is
  // nothing to select, and saying so in a box was noise.
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
    ) : altLocs.length > 0 ? (
      <AltLocControls
        altLocs={altLocs}
        colorOf={colorOfAlt}
        activeAlt={activeAlt}
        onPick={pickAltLoc}
        onHover={hoverAltLoc}
      />
    ) : null;

  return (
    // Collapsed the figure sits in the prose column, so it reads as a line in the text rather than
    // interrupting it. Expanded it spans the full grid (see .doc-grid / .bleed in globals.css).
    <figure ref={figureRef} id={id} className={`my-5 ${open ? "bleed" : ""}`}>
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
          {/* Which dictionary this file needs, legible while still collapsed. */}
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
              het ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-400"
            }`}
          >
            {het ? "extended" : "vanilla cif"}
          </span>
          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            {open ? "hide" : "show"}
          </span>
        </button>

        {open && (
          <FigureProvider value={figureApi}>
            {/* This example's own preamble. It used to be a comment block inside the CIF, where it
                was both invisible and unclickable. */}
            {brief && (
              <div className="mt-2 rounded border border-slate-200 bg-slate-50/60 px-4 py-3">
                <div className="max-w-[104ch] space-y-2 text-[12.5px] leading-[1.7] text-slate-600">
                  {brief}
                </div>
              </div>
            )}
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
                  truncateBefore={cutMarker}
                  dictSwitch={showSwitch}
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
              <figcaption className="mt-3 max-w-[120ch] text-[12px] leading-relaxed text-slate-500">
                {caption}
              </figcaption>
            )}
          </FigureProvider>
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

// The strip for a file with no annotation: its raw altloc letters. Clicking one selects every atom
// carrying it, across the whole file — which is exactly how a reader discovers that the letter's
// reach is local, and that two stretches of one chain need not use the same set of them.
function AltLocControls({
  altLocs,
  colorOf,
  activeAlt,
  onPick,
  onHover,
}: {
  altLocs: AltLoc[];
  colorOf: Map<string, string>;
  activeAlt: string | null;
  onPick: (letter: string) => void;
  onHover: (letter: string | null) => void;
}) {
  return (
    <div className="rounded border border-slate-200 bg-white text-[11px]">
      <ChipRow label="altlocs">
        {altLocs.map((a) => (
          <button
            key={a.letter}
            className={chip(activeAlt === a.letter)}
            aria-pressed={activeAlt === a.letter}
            title={`select every atom with label_alt_id ${a.letter}`}
            onClick={() => onPick(a.letter)}
            onMouseEnter={() => onHover(a.letter)}
            onMouseLeave={() => onHover(null)}
          >
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
              style={{ background: colorOf.get(a.letter) }}
            />
            <span>{a.letter}</span>
            {a.occ != null && <span className="tabular-nums text-slate-400">{a.occ.toFixed(2)}</span>}
          </button>
        ))}
      </ChipRow>
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
