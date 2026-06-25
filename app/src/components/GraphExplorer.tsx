"use client";
import {
  Background,
  Controls,
  type Edge,
  MarkerType,
  MiniMap,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
} from "@xyflow/react";
import { useEffect, useMemo, useRef } from "react";
import { layoutRadial } from "@/lib/layout";
import { useStore } from "@/lib/store";
import CategoryNode from "./CategoryNode";
import SearchBar from "./SearchBar";
import Sidebar from "./Sidebar";

const nodeTypes = { category: CategoryNode };

function Canvas() {
  const dict = useStore((s) => s.dict);
  const graph = useStore((s) => s.graph);
  const nodeIndex = useStore((s) => s.nodeIndex);
  const visible = useStore((s) => s.visible);
  const selected = useStore((s) => s.selected);
  const hovered = useStore((s) => s.hovered);
  const center = useStore((s) => s.center);
  const layoutDir = useStore((s) => s.layoutDir);
  const setSelected = useStore((s) => s.setSelected);
  const setHovered = useStore((s) => s.setHovered);
  const expand = useStore((s) => s.expand);
  const { fitView } = useReactFlow();

  // build + lay out the visible subgraph
  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [] as Node[], edges: [] as Edge[] };
    const vis = new Set(visible);
    const ns: Node[] = visible
      .filter((id) => nodeIndex.has(id))
      .map((id) => {
        const gn = nodeIndex.get(id)!;
        return {
          id,
          type: "category",
          position: { x: 0, y: 0 },
          data: {
            label: gn.label,
            numItems: gn.numItems,
            numKeys: gn.numKeys,
            groups: gn.groups,
            dir: layoutDir,
            hovered: hovered === id,
          },
        } satisfies Node;
      });

    const active = hovered ?? selected;
    const es: Edge[] = graph.edges
      .filter((e) => !e.self && vis.has(e.source) && vis.has(e.target))
      .map((e) => {
        const incident = active === e.source || active === e.target;
        const onHover = hovered != null && (hovered === e.source || hovered === e.target);
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.count > 1 ? String(e.count) : undefined,
          animated: onHover,
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
          style: {
            stroke: incident ? "#38bdf8" : "#3f3f46",
            strokeWidth: incident ? 1.8 : 1,
            opacity: active && !incident ? 0.15 : 1,
          },
          labelStyle: { fill: "#a1a1aa", fontSize: 10 },
          labelBgStyle: { fill: "#18181b" },
        } satisfies Edge;
      });

    return { nodes: layoutRadial(ns, es, center ?? undefined), edges: es };
  }, [graph, nodeIndex, visible, center, selected, hovered, layoutDir]);

  // refit once React Flow has measured the nodes (and whenever the set changes)
  const count = visible.length;
  const nodesInitialized = useNodesInitialized();
  useEffect(() => {
    if (!nodesInitialized) return;
    const t = setTimeout(() => fitView({ duration: 300, padding: 0.18 }), 0);
    return () => clearTimeout(t);
  }, [nodesInitialized, count, center, fitView]);

  if (!dict) return null;

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, n) => setSelected(n.id)}
      onNodeDoubleClick={(_, n) => expand(n.id)}
      onNodeMouseEnter={(_, n) => setHovered(n.id)}
      onNodeMouseLeave={() => setHovered(null)}
      onPaneClick={() => setSelected(null)}
      minZoom={0.1}
      proOptions={{ hideAttribution: true }}
      fitView
    >
      <Background color="#27272a" gap={20} />
      <Controls className="!bg-neutral-800 !text-neutral-200" />
      <MiniMap
        pannable
        zoomable
        className="!bg-neutral-900"
        nodeColor="#3f3f46"
        maskColor="rgba(0,0,0,0.6)"
      />
    </ReactFlow>
  );
}

export default function GraphExplorer() {
  const init = useStore((s) => s.init);
  const loaded = useStore((s) => s.loaded);
  const dict = useStore((s) => s.dict);
  const started = useRef(false);

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      init();
    }
  }, [init]);

  return (
    <div className="flex h-full w-full">
      <div className="relative flex-1">
        {!loaded && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-neutral-400">
            Loading dictionary…
          </div>
        )}
        <ReactFlowProvider>
          <Canvas />
          <div className="pointer-events-none absolute left-3 top-3 z-20 w-80">
            <div className="pointer-events-auto">
              <SearchBar />
            </div>
          </div>
          {dict && (
            <div className="absolute bottom-3 left-3 z-20 rounded bg-neutral-900/80 px-2 py-1 font-mono text-[10px] text-neutral-400">
              {dict.meta.title} v{dict.meta.version} · {dict.meta.num_categories} categories ·{" "}
              {dict.meta.num_items} items
            </div>
          )}
        </ReactFlowProvider>
      </div>
      <Sidebar />
    </div>
  );
}
