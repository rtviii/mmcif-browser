"use client";
import "molstar/build/viewer/molstar.css";
import { useEffect, useRef } from "react";
import { useMolstarViewer } from "@/hooks/useMolstarViewer";

// React boundary around the pure MolstarViewer wrapper: renders the container,
// manages lifecycle via the hook, and (re)loads whenever `data` changes.
export default function MolstarViewer({
  data,
  binary,
}: {
  data: string | Uint8Array | null;
  binary: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { viewer, ready } = useMolstarViewer(containerRef);

  useEffect(() => {
    if (!viewer || !ready || data == null) return;
    let cancelled = false;
    (async () => {
      try {
        await viewer.clear();
        if (cancelled) return;
        await viewer.load(data, { label: "structure" });
        if (!cancelled) viewer.resetCamera();
      } catch (e) {
        console.error("Mol* failed to load structure:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewer, ready, data, binary]);

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
