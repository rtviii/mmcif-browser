"use client";
import { useMemo } from "react";
import { HET_PALETTE, type HetModel, type HetNetwork } from "@/lib/molstar/het";
import type { MolstarViewer } from "@/lib/molstar/viewer";

// The relationship view for the proposed heterogeneity extension: the network legend, the
// coexistence (occupancy) groups with sum checks, the NOT exclusions, and the whole-molecule
// states — read off _pdbx_het_state when the file states them, otherwise derived under an
// independence assumption and labelled as such. Hovering a network highlights it in 3D; clicking a
// state isolates it (drives the stepper). Floats over the 3D pane so the structure stays visible.
const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

export default function HeterogeneityPanel({
  model,
  viewer,
  activeStateIndex,
  onPickState,
  onClose,
}: {
  model: HetModel;
  viewer: MolstarViewer | null;
  activeStateIndex: number; // -1 = all networks shown
  onPickState: (idx: number) => void;
  onClose: () => void;
}) {
  const colorOf = useMemo(() => {
    const m = new Map<string, number>();
    model.networks.forEach((n, i) => m.set(n.id, HET_PALETTE[i % HET_PALETTE.length]));
    return m;
  }, [model]);

  const hover = (id: string | null) => viewer?.highlightNetwork(id);

  // networks grouped by coexistence group — the mutually-exclusive sets, with their sum checks.
  // An unassigned network is its own group (a lone partial site with nothing opposite it).
  const groups = useMemo(() => {
    const m = new Map<string, HetNetwork[]>();
    for (const n of model.networks) {
      const g = n.coexistenceGroupId ?? `:${n.id}`;
      (m.get(g) ?? m.set(g, []).get(g)!).push(n);
    }
    return m;
  }, [model]);

  const swatch = (id: string) => (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
      style={{ background: hex(colorOf.get(id) ?? 0x999999) }}
    />
  );

  // One block per coexistence group: its members and the sum of their marginals, which is 1.00 when
  // exactly one of them is always present and less when "none of them" is also an outcome.
  const renderGroups = (): React.ReactNode => (
    <div className="ml-3 flex flex-col gap-1">
      {[...groups.entries()].map(([g, members]) => {
        const named = !g.startsWith(":");
        const sums = members.map((m) => m.occupancy).filter((o): o is number => o != null);
        const sum = sums.length === members.length ? sums.reduce((a, b) => a + b, 0) : null;
        return (
          <div key={g} className="border-l border-slate-200 pl-2">
            {named && (
              <div className="text-[9px] uppercase tracking-wide text-slate-400">
                {g}
                {sum != null && (
                  <span className="ml-1 normal-case text-slate-500">
                    ({members.map((m) => m.occupancy?.toFixed(2)).join(" + ")} = {sum.toFixed(2)})
                  </span>
                )}
              </div>
            )}
            {members.map((n) => (
              <button
                key={n.id}
                onMouseEnter={() => hover(n.id)}
                onMouseLeave={() => hover(null)}
                onClick={() => viewer?.focusNetwork(n.id)}
                className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-indigo-50"
              >
                {swatch(n.id)}
                <span className="font-mono text-[11px] text-slate-700">{n.id}</span>
                {n.occupancy != null && (
                  <span className="text-[10px] text-slate-400">occ {n.occupancy.toFixed(2)}</span>
                )}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="pointer-events-auto absolute left-2 top-2 z-20 flex max-h-[calc(100%-1rem)] w-72 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white/95 shadow-xl backdrop-blur">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-slate-700">Heterogeneity networks</span>
        <button onClick={onClose} title="close" className="rounded px-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          ×
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-2 text-[11px]">
        {/* networks, by coexistence group */}
        <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">networks</div>
        <div className="flex items-center gap-1.5 text-slate-500">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-[#cfd8dc]" />
          <span className="font-mono text-[11px]">base</span>
          <span className="text-[10px] text-slate-400">constant · occ 1.00</span>
        </div>
        {renderGroups()}

        {/* exclusions */}
        {model.exclusions.length > 0 && (
          <>
            <div className="mb-1 mt-3 text-[9px] font-semibold uppercase tracking-wide text-slate-400">exclusions</div>
            {model.exclusions.map((e) => (
              <div key={e.id} className="flex items-center gap-1.5 text-rose-600">
                {swatch(e.a)}
                <span className="font-mono text-[11px]">{e.a}</span>
                <span className="text-[10px] font-semibold">{e.rule}</span>
                <span className="font-mono text-[11px]">{e.b}</span>
                {swatch(e.b)}
              </div>
            ))}
          </>
        )}

        {/* the states: the file's own, or our reading of it */}
        {model.states.length > 0 && (
          <>
            <div className="mb-1 mt-3 flex items-center justify-between">
              <span
                className="text-[9px] font-semibold uppercase tracking-wide text-slate-400"
                title={
                  model.stateSource === "stated"
                    ? "read from _pdbx_het_state — the joint occupancies the file records"
                    : "the file states no joint distribution; these are every combination the coexistence groups allow, weighted as if the groups were independent"
                }
              >
                {model.stateSource === "stated"
                  ? `states (${model.states.length})`
                  : `states (${model.states.length}) · assuming independence`}
              </span>
              <button
                onClick={() => onPickState(-1)}
                className={`rounded px-1.5 py-0.5 text-[10px] ${
                  activeStateIndex === -1 ? "bg-indigo-100 text-indigo-700" : "text-slate-400 hover:bg-slate-100"
                }`}
              >
                show all
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {model.states.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => onPickState(i)}
                  className={`flex items-center justify-between gap-2 rounded border px-1.5 py-1 text-left ${
                    activeStateIndex === i
                      ? "border-indigo-300 bg-indigo-50"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-1">
                    {s.networks.length === 0 ? (
                      <span className="text-[10px] text-slate-400">base only</span>
                    ) : (
                      s.networks.map((id) => (
                        <span key={id} className="flex items-center gap-1">
                          {swatch(id)}
                          <span className="font-mono text-[10px] text-slate-700">{id}</span>
                        </span>
                      ))
                    )}
                  </span>
                  {s.probability != null && (
                    <span className="shrink-0 tabular-nums text-[10px] text-slate-400">
                      p={s.probability.toFixed(2)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
