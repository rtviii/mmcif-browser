import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";

const NODE_W = 168;
const NODE_H = 38;

// Lay out the currently-visible nodes/edges with dagre. Recomputed whenever the
// visible set changes; keeps the explorer readable as categories are expanded.
export function layout(
  nodes: Node[],
  edges: Edge[],
  direction: "LR" | "TB" = "LR",
): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 40, ranksep: 90, marginx: 40, marginy: 40 });

  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of edges) {
    // skip self-loops and dangling edges for layout purposes
    if (e.source !== e.target && g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }

  dagre.layout(g);

  return nodes.map((n) => {
    const p = g.node(n.id);
    return {
      ...n,
      position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 },
      width: NODE_W,
      height: NODE_H,
    };
  });
}

// Radial / ego layout: the dictionary's relational graph is hub-and-spoke around
// key categories, which reads far better as concentric rings (center = focused or
// highest-degree node) than as dagre's hierarchical ranks.
export function layoutRadial(nodes: Node[], edges: Edge[], centerId?: string): Node[] {
  if (nodes.length === 0) return nodes;
  const ids = new Set(nodes.map((n) => n.id));
  if (nodes.length === 1) {
    return [{ ...nodes[0], position: { x: 0, y: 0 }, width: NODE_W, height: NODE_H }];
  }

  const adj = new Map<string, Set<string>>();
  ids.forEach((id) => adj.set(id, new Set()));
  for (const e of edges) {
    if (e.source !== e.target && ids.has(e.source) && ids.has(e.target)) {
      adj.get(e.source)!.add(e.target);
      adj.get(e.target)!.add(e.source);
    }
  }

  let center = centerId && ids.has(centerId) ? centerId : nodes[0].id;
  if (!centerId || !ids.has(centerId)) {
    let best = -1;
    for (const n of nodes) {
      const deg = adj.get(n.id)!.size;
      if (deg > best) {
        best = deg;
        center = n.id;
      }
    }
  }

  // BFS hop-distance from the center node
  const dist = new Map<string, number>([[center, 0]]);
  const queue = [center];
  while (queue.length) {
    const c = queue.shift()!;
    for (const nb of adj.get(c)!) {
      if (!dist.has(nb)) {
        dist.set(nb, dist.get(c)! + 1);
        queue.push(nb);
      }
    }
  }

  const maxd = Math.max(0, ...dist.values());
  const rings = new Map<number, string[]>();
  for (const n of nodes) {
    const d = dist.has(n.id) ? dist.get(n.id)! : maxd + 1; // disconnected -> outer ring
    (rings.get(d) ?? rings.set(d, []).get(d)!).push(n.id);
  }

  const pos = new Map<string, { x: number; y: number }>();
  for (const [d, arr] of rings) {
    if (d === 0) {
      pos.set(arr[0], { x: 0, y: 0 });
      continue;
    }
    const radius = Math.max(300 * d, (arr.length * 200) / (2 * Math.PI));
    arr.forEach((id, i) => {
      const a = (i / arr.length) * 2 * Math.PI - Math.PI / 2;
      pos.set(id, { x: Math.cos(a) * radius, y: Math.sin(a) * radius });
    });
  }

  return nodes.map((n) => ({
    ...n,
    position: pos.get(n.id) ?? { x: 0, y: 0 },
    width: NODE_W,
    height: NODE_H,
  }));
}
