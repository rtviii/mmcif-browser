"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import type { ParsedCif } from "@/lib/cif";
import { computeInstanceJoins, type JoinHit } from "@/lib/cif-source/joins";
import { asMolCifFile } from "@/lib/cif-source/types";
import { type RefTarget, useStore } from "@/lib/store";
import { lookupDefinition } from "./dict-lookup";
import { MmcifChip } from "./MmcifChip";

// The "dig deeper" reference panel. A compact, click-pinned ~420px window that shows, for a
// hovered/clicked mmCIF category or item, what it REFERENCES and what REFERENCES IT — the
// foreign-key neighbourhood from the dictionary graph. Every neighbour is an MmcifChip, so it
// raises the same definition tooltip and can be clicked to re-center the panel on it. When opened
// from a specific data row (instance context), it also resolves the actual joined rows (v2).

function parseItemName(name: string): { cat: string; field: string } {
  const n = name.startsWith("_") ? name.slice(1) : name;
  const dot = n.indexOf(".");
  return dot < 0 ? { cat: n, field: "" } : { cat: n.slice(0, dot), field: n.slice(dot + 1) };
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {title} <span className="text-slate-300">({count})</span>
      </div>
      {count === 0 ? (
        <div className="px-1 text-[11px] text-slate-300">none</div>
      ) : (
        <div className="flex flex-col gap-0.5">{children}</div>
      )}
    </div>
  );
}

// One navigable neighbour row: a chip that re-centers the panel + an optional muted "via" caption.
function NeighbourRow({
  target,
  via,
  onNavigate,
}: {
  target: RefTarget;
  via?: string;
  onNavigate: (t: RefTarget) => void;
}) {
  return (
    <div className="flex items-baseline gap-1.5 px-1">
      <MmcifChip target={target} variant="chip" onToggle={() => onNavigate(target)} />
      {via && <span className="truncate font-mono text-[10px] text-slate-400">{via}</span>}
    </div>
  );
}

// One resolved instance join: a chip to navigate the schema + the joined row's summary + a
// jump-to-source affordance (when the row actually exists in the file).
function InstanceRow({
  hit,
  blockIndex,
  onNavigate,
  onJump,
}: {
  hit: JoinHit;
  blockIndex: number;
  onNavigate: (t: RefTarget) => void;
  onJump?: (blockIndex: number, category: string, rowIndex: number) => void;
}) {
  const target: RefTarget = { kind: "category", cat: hit.category };
  return (
    <div className="flex items-baseline gap-1.5 px-1">
      <MmcifChip target={target} variant="chip" onToggle={() => onNavigate(target)} />
      <span className="min-w-0 flex-1 truncate text-[11px] text-slate-600" title={hit.summary}>
        {hit.summary}
      </span>
      {hit.rowIndex >= 0 && onJump && (
        <button
          onClick={() => onJump(blockIndex, hit.category, hit.rowIndex)}
          title="scroll to this row in the source"
          className="shrink-0 rounded px-1 text-[11px] text-indigo-500 hover:bg-indigo-50 hover:text-indigo-700"
        >
          →
        </button>
      )}
    </div>
  );
}

export function ReferencePanel({
  parsed,
  onJumpToInstance,
}: {
  parsed: ParsedCif | null;
  onJumpToInstance?: (blockIndex: number, category: string, rowIndex: number) => void;
}) {
  const refPanel = useStore((s) => s.refPanel);
  const dict = useStore((s) => s.dict);
  const adj = useStore((s) => s.adj);
  const itemChildren = useStore((s) => s.itemChildren);
  const setRefTarget = useStore((s) => s.setRefTarget);
  const closeRefPanel = useStore((s) => s.closeRefPanel);
  const focus = useStore((s) => s.focus);
  const expand = useStore((s) => s.expand);
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  // Instance joins: the actual rows this row references / is referenced by in the loaded file.
  const instance = refPanel?.instance ?? null;
  const joins = useMemo(() => {
    if (!instance || !parsed || !dict) return null;
    return computeInstanceJoins(asMolCifFile(parsed.raw), dict, itemChildren, instance);
  }, [instance, parsed, dict, itemChildren]);

  // Esc closes; click-outside closes.
  useEffect(() => {
    if (!refPanel) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRefPanel();
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) closeRefPanel();
    };
    window.addEventListener("keydown", onKey);
    // defer so the opening click doesn't immediately close it
    const id = setTimeout(() => window.addEventListener("mousedown", onDown), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      clearTimeout(id);
    };
  }, [refPanel, closeRefPanel]);

  if (!refPanel || !dict) return null;
  const { target } = refPanel;
  const isCat = target.kind === "category";
  const def = lookupDefinition(dict, target);

  // Build forward ("references") and reverse ("referenced by") neighbours.
  const forward: { target: RefTarget; via?: string }[] = [];
  const reverse: { target: RefTarget; via?: string }[] = [];

  if (isCat) {
    const cat = target.cat;
    for (const e of adj.out.get(cat) ?? []) {
      const via = e.links[0] ? parseItemName(e.links[0].child).field : undefined;
      forward.push({ target: { kind: "category", cat: e.target }, via: via && `via ${via}` });
    }
    for (const e of adj.in.get(cat) ?? []) {
      const via = e.links[0] ? parseItemName(e.links[0].child).field : undefined;
      reverse.push({ target: { kind: "category", cat: e.source }, via: via && `via ${via}` });
    }
  } else {
    const fullName = `_${target.cat}.${target.field}`;
    for (const p of dict.items[fullName]?.parents ?? []) {
      const { cat, field } = parseItemName(p);
      forward.push({ target: { kind: "item", cat, field } });
    }
    for (const c of itemChildren.get(fullName) ?? []) {
      const { cat, field } = parseItemName(c);
      reverse.push({ target: { kind: "item", cat, field } });
    }
  }

  const openInGraph = () => {
    focus(target.cat); // both category and item targets carry `.cat`
    expand(target.cat);
    router.push("/");
  };

  return (
    <div
      ref={panelRef}
      className="fixed right-6 top-[72px] z-[60] flex max-h-[72vh] w-[420px] flex-col rounded-lg border border-slate-200 bg-white shadow-2xl"
    >
      {/* header */}
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 p-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              {isCat ? "category" : "item"}
            </span>
            <MmcifChip target={target} variant="chip" />
          </div>
          {def?.body && (
            <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-500">{def.body}</p>
          )}
        </div>
        <button
          onClick={closeRefPanel}
          className="shrink-0 rounded px-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="close (Esc)"
        >
          ×
        </button>
      </div>

      {/* body */}
      <div className="no-scrollbar flex-1 overflow-auto p-1.5">
        {joins && instance && (
          <div className="mb-1 rounded-md bg-slate-50 p-1.5">
            <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-400">
              In this structure
            </div>
            <Section title="this row references →" count={joins.forward.length}>
              {joins.forward.map((h, i) => (
                <InstanceRow
                  key={`if${i}`}
                  hit={h}
                  blockIndex={instance.blockIndex}
                  onNavigate={setRefTarget}
                  onJump={onJumpToInstance}
                />
              ))}
            </Section>
            <Section title="← rows referencing this" count={joins.reverse.length}>
              {joins.reverse.map((h, i) => (
                <InstanceRow
                  key={`ir${i}`}
                  hit={h}
                  blockIndex={instance.blockIndex}
                  onNavigate={setRefTarget}
                  onJump={onJumpToInstance}
                />
              ))}
            </Section>
            {joins.skipped.length > 0 && (
              <div className="px-1 pt-1 text-[10px] text-amber-600">
                skipped (too large): {joins.skipped.join(", ")}
              </div>
            )}
          </div>
        )}
        <Section title="References →" count={forward.length}>
          {forward.map((n, i) => (
            <NeighbourRow key={`f${i}`} target={n.target} via={n.via} onNavigate={setRefTarget} />
          ))}
        </Section>
        <Section title="← Referenced by" count={reverse.length}>
          {reverse.map((n, i) => (
            <NeighbourRow key={`r${i}`} target={n.target} via={n.via} onNavigate={setRefTarget} />
          ))}
        </Section>
      </div>

      {/* footer */}
      <div className="flex shrink-0 items-center justify-between border-t border-slate-100 px-2.5 py-1.5">
        <span className="font-mono text-[10px] text-slate-400">
          {forward.length + reverse.length} link{forward.length + reverse.length === 1 ? "" : "s"}
        </span>
        <button
          onClick={openInGraph}
          className="rounded px-1.5 py-0.5 text-[11px] text-indigo-600 hover:bg-indigo-50"
          title="open this category in the full dictionary graph"
        >
          Open in full graph →
        </button>
      </div>
    </div>
  );
}
