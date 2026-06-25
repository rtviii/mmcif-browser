import MiniSearch from "minisearch";
import { create } from "zustand";
import { loadData } from "./data";
import type { Dictionary, GraphData, GraphEdge, GraphNode } from "./types";

export interface SearchHit {
  id: string;
  kind: "category" | "item";
  category: string;
  label: string;
  description: string | null;
}

interface Adjacency {
  out: Map<string, GraphEdge[]>; // this category -> edges where it is the source (references others)
  in: Map<string, GraphEdge[]>; // this category -> edges where it is the target (referenced by others)
}

interface State {
  loaded: boolean;
  dict: Dictionary | null;
  graph: GraphData | null;
  nodeIndex: Map<string, GraphNode>;
  adj: Adjacency;
  search: MiniSearch | null;

  visible: string[]; // category ids currently on the canvas
  selected: string | null; // selected category id
  hovered: string | null; // hovered category id
  center: string | null; // stable layout root (set by focus/search, not by clicks)
  layoutDir: "LR" | "TB";

  init: () => Promise<void>;
  show: (id: string) => void;
  hide: (id: string) => void;
  expand: (id: string) => void; // add a category's in+out neighbours
  expandOut: (id: string) => void; // add only what this category references
  focus: (id: string) => void; // select + reveal a single category (clears canvas)
  clear: () => void;
  setSelected: (id: string | null) => void;
  setHovered: (id: string | null) => void;
  toggleDir: () => void;
  neighbors: (id: string) => string[];
  runSearch: (q: string) => SearchHit[];
}

function buildAdjacency(graph: GraphData): Adjacency {
  const out = new Map<string, GraphEdge[]>();
  const inn = new Map<string, GraphEdge[]>();
  for (const e of graph.edges) {
    if (e.self) continue;
    (out.get(e.source) ?? out.set(e.source, []).get(e.source)!).push(e);
    (inn.get(e.target) ?? inn.set(e.target, []).get(e.target)!).push(e);
  }
  return { out, in: inn };
}

export const useStore = create<State>((set, get) => ({
  loaded: false,
  dict: null,
  graph: null,
  nodeIndex: new Map(),
  adj: { out: new Map(), in: new Map() },
  search: null,
  visible: [],
  selected: null,
  hovered: null,
  center: null,
  layoutDir: "LR",

  init: async () => {
    if (get().loaded) return;
    const { dict, graph } = await loadData();
    const nodeIndex = new Map(graph.nodes.map((n) => [n.id, n]));
    const adj = buildAdjacency(graph);

    const search = new MiniSearch<SearchHit>({
      fields: ["label", "description"],
      storeFields: ["id", "kind", "category", "label", "description"],
      searchOptions: { boost: { label: 3 }, prefix: true, fuzzy: 0.2 },
    });
    const docs: SearchHit[] = [];
    for (const c of Object.values(dict.categories)) {
      docs.push({ id: c.name, kind: "category", category: c.name, label: c.name, description: c.description });
    }
    for (const it of Object.values(dict.items)) {
      docs.push({ id: it.name, kind: "item", category: it.category, label: it.name, description: it.description });
    }
    search.addAll(docs);

    set({ loaded: true, dict, graph, nodeIndex, adj, search });
    // seed with a useful starter: atom_site + the categories it references (out-links only,
    // ~13 — compact). Full in+out expansion stays an explicit user action.
    get().focus("atom_site");
    get().expandOut("atom_site");
  },

  neighbors: (id) => {
    const { adj } = get();
    const ids = new Set<string>();
    for (const e of adj.out.get(id) ?? []) ids.add(e.target);
    for (const e of adj.in.get(id) ?? []) ids.add(e.source);
    return [...ids];
  },

  show: (id) =>
    set((s) => (s.visible.includes(id) ? s : { visible: [...s.visible, id] })),

  hide: (id) =>
    set((s) => ({
      visible: s.visible.filter((v) => v !== id),
      selected: s.selected === id ? null : s.selected,
      hovered: s.hovered === id ? null : s.hovered,
    })),

  expand: (id) => {
    const ns = get().neighbors(id);
    set((s) => {
      const vis = new Set(s.visible);
      vis.add(id);
      ns.forEach((n) => vis.add(n));
      return { visible: [...vis] };
    });
  },

  expandOut: (id) => {
    const targets = (get().adj.out.get(id) ?? []).map((e) => e.target);
    set((s) => {
      const vis = new Set(s.visible);
      vis.add(id);
      targets.forEach((n) => vis.add(n));
      return { visible: [...vis] };
    });
  },

  focus: (id) => set({ visible: [id], selected: id, center: id }),

  clear: () => set({ visible: [], selected: null, hovered: null }),

  setSelected: (id) => set({ selected: id }),
  setHovered: (id) => set({ hovered: id }),
  toggleDir: () => set((s) => ({ layoutDir: s.layoutDir === "LR" ? "TB" : "LR" })),

  runSearch: (q) => {
    const { search } = get();
    if (!search || !q.trim()) return [];
    return search.search(q).slice(0, 30) as unknown as SearchHit[];
  },
}));
