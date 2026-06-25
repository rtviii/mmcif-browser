import type { Dictionary, GraphData } from "./types";

// Artifacts live in /public/data and are fetched at runtime (too big to bundle).
export async function loadData(): Promise<{ dict: Dictionary; graph: GraphData }> {
  const [dict, graph] = await Promise.all([
    fetch("/data/dictionary.json").then((r) => r.json() as Promise<Dictionary>),
    fetch("/data/graph.json").then((r) => r.json() as Promise<GraphData>),
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
