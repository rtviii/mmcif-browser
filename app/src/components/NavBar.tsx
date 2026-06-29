"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTabsStore } from "@/lib/tabs-store";

// Inspector is the default page (/); the dictionary graph moved to /dictionary. The page switch is
// tucked behind a hover on the "mmCIF" logo to keep the top bar uncluttered.
const pages = [
  { href: "/", label: "Inspector" },
  { href: "/dictionary", label: "Dictionary" },
];

export default function NavBar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  const cancelClose = () => {
    if (closeTimer.current != null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 180);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = pages.find((p) => (p.href === "/" ? path === "/" : path.startsWith(p.href))) ?? pages[0];
  const onInspector = path === "/";

  return (
    <header className="flex h-9 shrink-0 items-center gap-3 border-b border-neutral-800 bg-neutral-950 px-3">
      <div
        ref={ref}
        className="relative"
        onMouseEnter={() => {
          cancelClose();
          setOpen(true);
        }}
        onMouseLeave={scheduleClose}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded px-1 py-0.5 font-mono text-xs font-semibold tracking-tight text-neutral-300 hover:text-neutral-100"
          title="switch page"
        >
          mmCIF
          <span className="text-[10px] font-normal text-neutral-500">{current.label}</span>
          <span className="text-[8px] text-neutral-500">▼</span>
        </button>
        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 w-40 overflow-hidden rounded border border-neutral-700 bg-neutral-900 py-1 shadow-xl">
            {pages.map((p) => {
              const active = p.href === current.href;
              return (
                <Link
                  key={p.href}
                  href={p.href}
                  onClick={() => setOpen(false)}
                  className={`block px-3 py-1 text-xs ${
                    active
                      ? "bg-neutral-800 text-neutral-100"
                      : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                  }`}
                >
                  {p.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
      {onInspector && <InspectorTabs />}
    </header>
  );
}

// The structure-tab strip (inspector route only): switch, close, and open new tabs. Each tab is a
// completely separate inspector context held in the tabs store.
function InspectorTabs() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeId = useTabsStore((s) => s.activeId);
  const setActive = useTabsStore((s) => s.setActive);
  const closeTab = useTabsStore((s) => s.closeTab);
  const addTab = useTabsStore((s) => s.addTab);
  return (
    <div className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto">
      {tabs.map((t) => {
        const isActive = t.id === activeId;
        return (
          <div
            key={t.id}
            className={`flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-xs ${
              isActive
                ? "bg-neutral-800 text-neutral-100"
                : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
            }`}
          >
            <button onClick={() => setActive(t.id)} className="max-w-[140px] truncate" title={t.title}>
              {t.title}
            </button>
            {tabs.length > 1 && (
              <button
                onClick={() => closeTab(t.id)}
                title="close tab"
                className="shrink-0 rounded px-0.5 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-100"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
      <button
        onClick={addTab}
        title="new tab"
        className="shrink-0 rounded px-1.5 py-0.5 text-sm leading-none text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
      >
        +
      </button>
    </div>
  );
}
