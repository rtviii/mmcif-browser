"use client";
import "molstar/build/viewer/molstar.css";
import { useEffect, useRef } from "react";
import { useMolstarViewer } from "@/hooks/useMolstarViewer";
import type { HetVizNetwork, MolstarViewer as MolstarViewerInstance } from "@/lib/molstar/viewer";
import type { StructureView } from "@/lib/molstar/style";
import type { TlsGroup } from "@/lib/molstar/tls";

// React boundary around the pure MolstarViewer wrapper: renders the container,
// manages lifecycle via the hook, and (re)loads whenever `data` (or the requested view) changes.
export default function MolstarViewer({
  data,
  binary,
  view,
  tlsGroups,
  hetNetworks,
  onReady,
  onLoaded,
}: {
  data: string | Uint8Array | null;
  binary: boolean;
  view?: StructureView;
  tlsGroups?: TlsGroup[] | null;
  hetNetworks?: HetVizNetwork[] | null;
  onReady?: (viewer: MolstarViewerInstance | null) => void;
  onLoaded?: (info: { modelCount: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { viewer, ready } = useMolstarViewer(containerRef);

  // Keep latest onLoaded without making it a load-effect dependency (it changes identity each render).
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  // Surface the live viewer handle to the parent so the source view can drive
  // highlight/focus (cleared to null while not ready).
  useEffect(() => {
    onReady?.(ready ? viewer : null);
  }, [ready, viewer, onReady]);

  useEffect(() => {
    if (!viewer || !ready || data == null) return;
    let cancelled = false;
    (async () => {
      try {
        await viewer.clear();
        if (cancelled) return;
        await viewer.load(data, {
          label: "structure",
          view,
          tlsGroups: tlsGroups ?? undefined,
          het: hetNetworks ?? undefined,
        });
        if (cancelled) return;
        viewer.resetCamera();
        onLoadedRef.current?.({ modelCount: viewer.getModelCount() });
      } catch (e) {
        console.error("Mol* failed to load structure:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewer, ready, data, binary, view, tlsGroups, hetNetworks]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
      {!ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-neutral-500">
          Initialising 3D viewer…
        </div>
      )}
    </div>
  );
}
