"use client";
import { useState } from "react";
import { groupColor } from "@/lib/data";
import { useStore } from "@/lib/store";
import type { Item } from "@/lib/types";

function Para({ text }: { text: string | null }) {
  if (!text) return <p className="text-xs italic text-neutral-500">No description.</p>;
  return (
    <div className="space-y-2 text-xs leading-relaxed text-neutral-300">
      {text.split("\n\n").map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}

function ItemRow({ item }: { item: Item }) {
  const [open, setOpen] = useState(false);
  const dict = useStore((s) => s.dict)!;
  const focusCat = useStore((s) => s.focus);
  const expand = useStore((s) => s.expand);
  const setSelected = useStore((s) => s.setSelected);
  const t = item.type ? dict.types[item.type] : null;

  const jumpToCat = (cat: string) => {
    focusCat(cat);
    expand(cat);
    setSelected(cat);
  };

  return (
    <div className="border-b border-neutral-800/70">
      <button
        className="flex w-full items-center gap-2 py-1.5 text-left hover:bg-neutral-800/40"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-[9px] text-neutral-500">{open ? "▼" : "▶"}</span>
        <span className="flex-1 truncate font-mono text-[11px] text-neutral-200">{item.attribute}</span>
        {item.mandatory === "yes" && <span className="text-[9px] text-rose-400" title="mandatory">req</span>}
        {item.type && <span className="rounded bg-neutral-800 px-1 text-[9px] text-neutral-400">{item.type}</span>}
      </button>
      {open && (
        <div className="space-y-2 pb-2 pl-4 pr-1">
          <Para text={item.description} />
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[10px] text-neutral-400">
            <span className="text-neutral-500">name</span>
            <span className="text-neutral-300">{item.name}</span>
            {t && (
              <>
                <span className="text-neutral-500">type</span>
                <span className="text-neutral-300">
                  {t.code} <span className="text-neutral-500">({t.primitive})</span>
                </span>
              </>
            )}
            {item.units && (
              <>
                <span className="text-neutral-500">units</span>
                <span className="text-neutral-300">{item.units}</span>
              </>
            )}
            <span className="text-neutral-500">mandatory</span>
            <span className="text-neutral-300">{item.mandatory ?? "—"}</span>
          </div>

          {item.enums && (
            <div>
              <div className="text-[10px] font-medium text-neutral-400">enumeration</div>
              <ul className="mt-1 space-y-0.5">
                {item.enums.map(([v, det]) => (
                  <li key={v} className="font-mono text-[10px] text-neutral-300">
                    <span className="rounded bg-sky-500/10 px-1 text-sky-300">{v}</span>
                    {det && <span className="ml-1 font-sans text-neutral-500">{det}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {item.parents && (
            <div className="text-[10px]">
              <span className="text-neutral-500">references </span>
              {item.parents.map((p) => {
                const cat = p.replace(/^_/, "").split(".")[0];
                return (
                  <button
                    key={p}
                    className="mr-1 font-mono text-sky-400 hover:underline"
                    onClick={() => jumpToCat(cat)}
                    title={`jump to ${cat}`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          )}

          {item.examples && item.examples.length > 0 && (
            <pre className="overflow-x-auto rounded bg-neutral-950 p-2 font-mono text-[10px] text-neutral-300">
              {item.examples.join("\n")}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const dict = useStore((s) => s.dict);
  const selected = useStore((s) => s.selected);
  const hovered = useStore((s) => s.hovered);
  const expand = useStore((s) => s.expand);
  const id = selected ?? hovered;
  const cat = dict && id ? dict.categories[id] : null;

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-neutral-800 bg-neutral-900/60">
      {!cat ? (
        <div className="p-4 text-sm text-neutral-500">
          Click a category to inspect it. Double-click a node (or use ＋) to reveal what it links to.
        </div>
      ) : (
        <>
          <div className="border-b border-neutral-800 p-4">
            <div className="font-mono text-base font-semibold text-neutral-100">{cat.name}</div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {cat.groups.map((g) => (
                <span
                  key={g}
                  className="rounded px-1.5 py-0.5 text-[9px] text-neutral-200"
                  style={{ backgroundColor: `${groupColor(g)}33`, color: groupColor(g) }}
                  title="category group"
                >
                  {g}
                </span>
              ))}
            </div>
            {cat.keys.length > 0 && (
              <div className="mt-2 font-mono text-[10px] text-amber-300/90">
                key: {cat.keys.join(", ")}
              </div>
            )}
            <button
              className="mt-3 rounded bg-neutral-800 px-2 py-1 text-[11px] text-neutral-200 hover:bg-neutral-700"
              onClick={() => expand(cat.name)}
            >
              ＋ reveal links
            </button>
          </div>

          <div className="overflow-y-auto">
            <div className="p-4">
              <Para text={cat.description} />
              {cat.examples.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-[11px] text-neutral-400">example</summary>
                  <pre className="mt-1 overflow-x-auto rounded bg-neutral-950 p-2 font-mono text-[10px] text-neutral-300">
                    {cat.examples[0]}
                  </pre>
                </details>
              )}
            </div>
            <div className="px-4 pb-6">
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                {cat.items.length} items
              </div>
              {cat.items.map((attr) => {
                const it = dict!.items[`_${cat.name}.${attr}`];
                return it ? <ItemRow key={attr} item={it} /> : null;
              })}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
