"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { groupColor } from "@/lib/data";
import { useStore } from "@/lib/store";

function primaryGroup(groups: string[]): string | undefined {
  return groups.find((g) => g !== "inclusive_group") ?? groups[0];
}

export default function CategoryNode({ id, data, selected }: NodeProps) {
  const d = data as {
    label: string;
    numItems: number;
    numKeys: number;
    groups: string[];
    dir: "LR" | "TB";
    hovered: boolean;
  };
  const expand = useStore((s) => s.expand);
  const hide = useStore((s) => s.hide);
  const accent = groupColor(primaryGroup(d.groups));
  const targetPos = d.dir === "LR" ? Position.Left : Position.Top;
  const sourcePos = d.dir === "LR" ? Position.Right : Position.Bottom;

  return (
    <div
      className={`group relative w-[190px] rounded-md border bg-neutral-900 px-3 py-2 shadow-sm transition
        ${selected ? "border-sky-400 ring-2 ring-sky-400/40" : d.hovered ? "border-neutral-500" : "border-neutral-700"}`}
      style={{ borderLeftColor: accent, borderLeftWidth: 4 }}
    >
      <Handle type="target" position={targetPos} className="!h-2 !w-2 !border-0 !bg-neutral-500" />
      <Handle type="source" position={sourcePos} className="!h-2 !w-2 !border-0 !bg-neutral-500" />

      <div className="truncate font-mono text-[13px] font-medium text-neutral-100" title={d.label}>
        {d.label}
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-neutral-400">
        <span>{d.numItems} items</span>
        {d.numKeys > 0 && (
          <span className="rounded bg-amber-500/15 px-1 text-amber-300" title={`${d.numKeys} key item(s)`}>
            key
          </span>
        )}
      </div>

      <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
        <button
          className="rounded bg-neutral-800 px-1 text-[10px] text-neutral-300 hover:bg-neutral-700"
          title="Expand neighbours"
          onClick={(e) => {
            e.stopPropagation();
            expand(id);
          }}
        >
          ＋
        </button>
        <button
          className="rounded bg-neutral-800 px-1 text-[10px] text-neutral-300 hover:bg-neutral-700"
          title="Hide"
          onClick={(e) => {
            e.stopPropagation();
            hide(id);
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
