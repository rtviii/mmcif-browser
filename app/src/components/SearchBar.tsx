"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import type { SearchHit } from "@/lib/store";

export default function SearchBar() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const runSearch = useStore((s) => s.runSearch);
  const focus = useStore((s) => s.focus);
  const expand = useStore((s) => s.expand);
  const setSelected = useStore((s) => s.setSelected);

  const hits = useMemo<SearchHit[]>(() => (q.trim() ? runSearch(q) : []), [q, runSearch]);

  const pick = (h: SearchHit) => {
    focus(h.category);
    expand(h.category);
    setSelected(h.category);
    setQ("");
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search categories & items…"
        className="w-full rounded-md border border-neutral-700 bg-neutral-900/95 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 shadow-lg outline-none focus:border-sky-500"
      />
      {open && hits.length > 0 && (
        <ul className="absolute mt-1 max-h-96 w-full overflow-y-auto rounded-md border border-neutral-700 bg-neutral-900 shadow-xl">
          {hits.map((h) => (
            <li key={`${h.kind}:${h.id}`}>
              <button
                className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-neutral-800"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(h);
                }}
              >
                <span
                  className={`mt-0.5 rounded px-1 text-[9px] ${
                    h.kind === "category" ? "bg-sky-500/15 text-sky-300" : "bg-violet-500/15 text-violet-300"
                  }`}
                >
                  {h.kind === "category" ? "cat" : "item"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs text-neutral-100">{h.label}</span>
                  {h.description && (
                    <span className="block truncate text-[10px] text-neutral-500">{h.description}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
