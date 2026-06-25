// Mirrors the JSON emitted by pipeline/build_artifacts.py

export interface DictMeta {
  title: string;
  version: string;
  source_url: string;
  source_file: string;
  source_sha256: string;
  num_categories: number;
  num_items: number;
  num_edges: number;
  num_groups: number;
}

export interface TypeDef {
  code: string;
  primitive: string | null;
  regex: string | null;
  detail: string | null;
}

export interface GroupDef {
  id: string;
  description: string | null;
  parent: string | null;
  categories: string[];
}

export interface Category {
  name: string;
  description: string | null;
  groups: string[];
  keys: string[];
  mandatory: string | null;
  examples: string[];
  items: string[]; // attribute short-names
}

export interface Item {
  name: string; // fully qualified, e.g. _atom_site.Cartn_x
  category: string;
  attribute: string;
  description: string | null;
  type: string | null; // type code, join into Dictionary.types
  mandatory: string | null;
  units: string | null;
  default: string | null;
  enums?: [string, string | null][];
  examples?: string[];
  boundaries?: unknown[];
  aliases?: string[][];
  parents?: string[]; // fully-qualified parent item names
}

export interface Dictionary {
  meta: DictMeta;
  types: Record<string, TypeDef>;
  groups: Record<string, GroupDef>;
  categories: Record<string, Category>;
  items: Record<string, Item>;
}

export interface GraphNode {
  id: string;
  label: string;
  groups: string[];
  numItems: number;
  numKeys: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  self: boolean;
  count: number;
  links: { child: string; parent: string }[];
}

export interface GraphData {
  meta: DictMeta;
  nodes: GraphNode[];
  edges: GraphEdge[];
}
