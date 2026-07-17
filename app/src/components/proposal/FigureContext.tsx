"use client";
import { createContext, useContext, type ReactNode } from "react";

// The bridge between an example's prose and its figure.
//
// Each StageFigure publishes the handlers its own control strip already uses; a <Tok> written in
// the prose of that figure's `brief` calls them. So "the amide H" in a sentence and the chip under
// the viewer do the same thing, and the prose can point at the structure instead of describing
// where to look. A Tok whose target does not exist in the file renders as inert code rather than a
// dead link, which also means the prose degrades safely if an example is recarved.

export interface FigureApi {
  pickNetwork: (id: string) => void;
  hoverNetwork: (id: string | null) => void;
  pickAltLoc: (letter: string) => void;
  hoverAltLoc: (letter: string | null) => void;
  /** Focus a residue or an inclusive residue range in the viewer, and snap the source to it. */
  focusResidue: (chain: string, seqStart: number, seqEnd?: number) => void;
  /** Focus the residue and select one atom within it. */
  focusAtom: (chain: string, seq: number, atomId: string, altId?: string) => void;
  knownNetworks: ReadonlySet<string>;
  knownAltLocs: ReadonlySet<string>;
  ready: boolean;
}

const FigureCtx = createContext<FigureApi | null>(null);
export const FigureProvider = FigureCtx.Provider;
export const useFigure = () => useContext(FigureCtx);

// "A/8" -> chain A, residue 8.  "A/6-7" -> chain A, residues 6..7.
function parseRes(s: string): { chain: string; start: number; end: number } | null {
  const m = /^([A-Za-z0-9]+)\/(-?\d+)(?:-(-?\d+))?$/.exec(s.trim());
  if (!m) return null;
  const start = Number(m[2]);
  const end = m[3] != null ? Number(m[3]) : start;
  return { chain: m[1], start, end };
}

// "A/8/H" -> chain A, residue 8, atom H.
function parseAtom(s: string): { chain: string; seq: number; atomId: string } | null {
  const m = /^([A-Za-z0-9]+)\/(-?\d+)\/(\S+)$/.exec(s.trim());
  if (!m) return null;
  return { chain: m[1], seq: Number(m[2]), atomId: m[3] };
}

export interface TokProps {
  /** A network name, as it appears in _pdbx_alt_groups.alt_group_id. */
  net?: string;
  /** A raw altloc letter, for the files that carry no annotation. */
  altloc?: string;
  /** "A/8" or "A/6-7" — chain / residue or inclusive range. */
  res?: string;
  /** "A/8/H" — chain / residue / atom name. */
  atom?: string;
  /** Narrows `atom` to one alternate. */
  alt?: string;
  children: ReactNode;
}

const BASE = "rounded px-1 py-0.5 font-mono text-[0.86em]";

export function Tok({ net, altloc, res, atom, alt, children }: TokProps) {
  const api = useFigure();

  let act: (() => void) | null = null;
  let over: ((on: boolean) => void) | null = null;

  if (api?.ready) {
    if (net && api.knownNetworks.has(net)) {
      act = () => api.pickNetwork(net);
      over = (on) => api.hoverNetwork(on ? net : null);
    } else if (altloc && api.knownAltLocs.has(altloc)) {
      act = () => api.pickAltLoc(altloc);
      over = (on) => api.hoverAltLoc(on ? altloc : null);
    } else if (res) {
      const r = parseRes(res);
      if (r) act = () => api.focusResidue(r.chain, r.start, r.end);
    } else if (atom) {
      const a = parseAtom(atom);
      if (a) act = () => api.focusAtom(a.chain, a.seq, a.atomId, alt);
    }
  }

  // Unresolvable (or the figure is still loading): say the word, don't offer an action.
  if (!act) {
    return <code className={`${BASE} bg-slate-100 text-slate-700`}>{children}</code>;
  }

  return (
    <button
      type="button"
      onClick={act}
      onMouseEnter={() => over?.(true)}
      onMouseLeave={() => over?.(false)}
      className={`${BASE} cursor-pointer bg-slate-100 text-slate-700 underline decoration-slate-300 decoration-dotted underline-offset-2 transition-colors hover:bg-slate-200 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400`}
    >
      {children}
    </button>
  );
}
