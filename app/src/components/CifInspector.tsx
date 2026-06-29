"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { useTabsStore } from "@/lib/tabs-store";
import StructureTab from "./StructureTab";

// The inspector page: a container for one or more structure tabs. Every tab stays mounted (only the
// active one is visible) so each keeps a completely separate context — its own file, view state, and
// 3D viewer — and switching between them is instant. The tab strip itself lives in the NavBar.
export default function CifInspector() {
  const init = useStore((s) => s.init); // load the dictionary once (shared across tabs)
  useEffect(() => {
    init();
  }, [init]);

  const tabs = useTabsStore((s) => s.tabs);
  const activeId = useTabsStore((s) => s.activeId);

  return (
    <div className="h-full">
      {tabs.map((t) => (
        <div key={t.id} className="h-full" style={{ display: t.id === activeId ? undefined : "none" }}>
          <StructureTab id={t.id} active={t.id === activeId} />
        </div>
      ))}
    </div>
  );
}
