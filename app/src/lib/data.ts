import type { DictVariant, Dictionary, GraphData } from "./types";

// Each variant is a separate artifact pair under /public/data (see pipeline/build_artifacts.py).
const VARIANT_FILES: Record<DictVariant, { dict: string; graph: string }> = {
  base: { dict: "/data/dictionary.json", graph: "/data/graph.json" },
  het: { dict: "/data/dictionary.het.json", graph: "/data/graph.het.json" },
};

// Artifacts live in /public/data and are fetched at runtime (too big to bundle).
export async function loadData(variant: DictVariant = "base"): Promise<{ dict: Dictionary; graph: GraphData }> {
  const f = VARIANT_FILES[variant];
  const [dict, graph] = await Promise.all([
    fetch(f.dict).then((r) => r.json() as Promise<Dictionary>),
    fetch(f.graph).then((r) => r.json() as Promise<GraphData>),
  ]);
  return { dict, graph };
}

// stable hue from an arbitrary string (used to color-code category groups)
export function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function groupColor(group: string | undefined): string {
  if (!group) return "hsl(220 6% 50%)";
  return `hsl(${hashHue(group)} 38% 58%)`;
}
