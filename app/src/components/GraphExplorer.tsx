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

  // 1) positions: recomputed ONLY when the visible set / center changes (never on hover)
  const positioned = useMemo<Node[]>(() => {
    if (!graph) return [];
    const base: Node[] = visible
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
            hovered: false,
          },
        } satisfies Node;
      });
    const es = graph.edges
      .filter((e) => !e.self && visible.includes(e.source) && visible.includes(e.target))
      .map((e) => ({ id: e.id, source: e.source, target: e.target }));
    return layoutRadial(base, es as Edge[], center ?? undefined);
  }, [graph, nodeIndex, visible, center, layoutDir]);

  // 2) per-node selection/hover flags applied without re-laying-out
  const nodes = useMemo<Node[]>(
    () =>
      positioned.map((n) => ({
        ...n,
        selected: selected === n.id,
        data: { ...n.data, hovered: hovered === n.id },
      })),
    [positioned, selected, hovered],
  );

  // 3) edges: static (no animation), calm neutral palette, subtle highlight on active node
  const edges = useMemo<Edge[]>(() => {
    if (!graph) return [];
    const vis = new Set(visible);
    const active = hovered ?? selected;
    return graph.edges
      .filter((e) => !e.self && vis.has(e.source) && vis.has(e.target))
      .map((e) => {
        const incident = active === e.source || active === e.target;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.count > 1 ? String(e.count) : undefined,
          markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: incident ? "#94a3b8" : "#3f3f46" },
          style: {
            stroke: incident ? "#94a3b8" : "#3f3f46",
            strokeWidth: incident ? 1.4 : 1,
            opacity: active && !incident ? 0.1 : 1,
          },
          labelStyle: { fill: "#71717a", fontSize: 9 },
          labelBgStyle: { fill: "#0a0a0a", fillOpacity: 0.8 },
        } satisfies Edge;
      });
  }, [graph, visible, hovered, selected]);

  const count = visible.length;
  const nodesInitialized = useNodesInitialized();
  useEffect(() => {
    if (!nodesInitialized) return;
    // double rAF so the pane has its final measured size before fitting
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => fitView({ duration: 200, padding: 0.2 }));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [nodesInitialized, count, center, fitView]);

  // re-fit when the canvas itself resizes (window/sidebar) so the graph stays centred
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => fitView({ padding: 0.18 }));
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [fitView]);

  if (!dict) return null;

  return (
    <div ref={wrapperRef} className="h-full w-full">
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
      <Background color="#262626" gap={22} size={1} />
      <Controls showInteractive={false} className="!shadow-none" />
      <MiniMap
        pannable
        className="!bg-neutral-900/80 !border !border-neutral-800"
        nodeColor="#3f3f46"
        nodeStrokeWidth={0}
        maskColor="rgba(0,0,0,0.55)"
      />
    </ReactFlow>
    </div>
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
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-neutral-500">
            Loading dictionary…
          </div>
        )}
        <ReactFlowProvider>
          <Canvas />
          <div className="absolute left-3 top-3 z-20 w-72">
            <SearchBar />
          </div>
          {dict && (
            <div className="absolute bottom-2 left-2 z-20 font-mono text-[10px] text-neutral-600">
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
