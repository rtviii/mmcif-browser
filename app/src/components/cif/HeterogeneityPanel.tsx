"use client";
import { useMemo } from "react";
import { HET_PALETTE, type HetModel, type HetNetwork } from "@/lib/molstar/het";
import type { MolstarViewer } from "@/lib/molstar/viewer";

// The relationship view for the proposed heterogeneity extension: the network legend, the hierarchy
// (coexistence/occupancy groups with sum checks), the NOT exclusions, and the enumerated legal
// whole-molecule states. Hovering a network highlights it in 3D; clicking a state isolates it
// (drives the stepper). Floats over the 3D pane so the structure stays visible alongside.
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

  // children grouped by parent, then by coexistence group — for the tree + occupancy-sum checks
  const childrenOf = useMemo(() => {
    const m = new Map<string | null, HetNetwork[]>();
    for (const n of model.networks) {
      const k = n.parentId;
      (m.get(k) ?? m.set(k, []).get(k)!).push(n);
    }
    return m;
  }, [model]);

  const swatch = (id: string) => (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
      style={{ background: hex(colorOf.get(id) ?? 0x999999) }}
    />
  );

  // Render the networks under a parent, grouped by coexistence group, recursing into each network.
  const renderChildren = (parentId: string | null, depth: number): React.ReactNode => {
    const kids = childrenOf.get(parentId) ?? [];
    if (!kids.length) return null;
    const groups = new Map<string, HetNetwork[]>();
    for (const n of kids) {
      const g = n.coexistenceGroupId ?? `:${n.id}`;
      (groups.get(g) ?? groups.set(g, []).get(g)!).push(n);
    }
    return (
      <div style={{ marginLeft: depth * 12 }} className="flex flex-col gap-1">
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
                <div key={n.id}>
                  <button
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
                  {renderChildren(n.id, depth + 1)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="pointer-events-auto absolute left-2 top-2 z-20 flex max-h-[calc(100%-1rem)] w-72 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white/95 shadow-xl backdrop-blur">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-slate-700">Heterogeneity networks</span>
        <button onClick={onClose} title="close" className="rounded px-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          ×
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-2 text-[11px]">
        {/* hierarchy / occupancy groups */}
        <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">hierarchy</div>
        <div className="flex items-center gap-1.5 text-slate-500">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-[#cfd8dc]" />
          <span className="font-mono text-[11px]">base</span>
          <span className="text-[10px] text-slate-400">constant · occ 1.00</span>
        </div>
        {renderChildren(null, 1)}

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

        {/* enumerated legal states */}
        {model.states.length > 0 && (
          <>
            <div className="mb-1 mt-3 flex items-center justify-between">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                legal states ({model.states.length})
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
