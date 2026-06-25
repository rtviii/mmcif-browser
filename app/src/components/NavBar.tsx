"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Dictionary" },
  { href: "/inspector", label: "Inspector" },
];

export default function NavBar() {
  const path = usePathname();
  return (
    <header className="flex h-9 shrink-0 items-center gap-3 border-b border-neutral-800 bg-neutral-950 px-3">
      <span className="font-mono text-xs font-semibold tracking-tight text-neutral-300">mmCIF</span>
      <nav className="flex items-center gap-1">
        {tabs.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`rounded px-2 py-0.5 text-xs transition-colors ${
                active ? "bg-neutral-800 text-neutral-100" : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
