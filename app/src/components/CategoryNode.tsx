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
      className={`group relative flex h-[38px] w-[168px] items-center rounded border bg-neutral-900 pl-2 pr-1.5 transition-colors
        ${selected ? "border-neutral-300" : d.hovered ? "border-neutral-500" : "border-neutral-700/80"}`}
      style={{ borderLeftColor: accent, borderLeftWidth: 3 }}
    >
      <Handle type="target" position={targetPos} className="!h-1.5 !w-1.5 !border-0 !bg-neutral-600" />
      <Handle type="source" position={sourcePos} className="!h-1.5 !w-1.5 !border-0 !bg-neutral-600" />

      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-[12px] leading-tight text-neutral-100" title={d.label}>
          {d.label}
        </div>
        <div className="text-[9px] leading-tight text-neutral-500">
          {d.numItems} items{d.numKeys > 0 ? " · key" : ""}
        </div>
      </div>

      <div className="ml-1 hidden shrink-0 flex-col gap-0.5 group-hover:flex">
        <button
          className="rounded px-1 text-[9px] leading-none text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
          title="Expand neighbours"
          onClick={(e) => {
            e.stopPropagation();
            expand(id);
          }}
        >
          ＋
        </button>
        <button
          className="rounded px-1 text-[9px] leading-none text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
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
