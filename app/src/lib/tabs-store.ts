import { create } from "zustand";
import type { StructureExample } from "./molstar/examples";
import { useStore } from "./store";

// Multi-structure tabs for the inspector. Each tab is a completely separate context: its own loaded
// file, parsed CIF, view state, and Mol* viewer live in a per-tab StructureTab component instance
// that stays mounted (hidden when inactive). This store only tracks the tab list + which is active +
// the display title; the heavy per-tab state stays local to each pane.
export interface Tab {
  id: string;
  title: string;
}

let seq = 1;
const nextId = () => `tab-${++seq}`;

interface TabsState {
  tabs: Tab[];
  activeId: string;
  addTab: () => void;
  closeTab: (id: string) => void;
  setActive: (id: string) => void;
  setTitle: (id: string, title: string) => void;

  // Cross-component request to load a curated example into the ACTIVE tab. The NavBar's Examples
  // dropdown (next to the DICT switcher) sets this; the active StructureTab consumes it via an effect
  // guarded by a last-handled nonce. The nonce makes re-picking the same example fire again.
  pendingExample: { ex: StructureExample; nonce: number } | null;
  requestExample: (ex: StructureExample) => void;
}

let exampleNonce = 0;

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [{ id: "tab-1", title: "untitled" }],
  activeId: "tab-1",
  pendingExample: null,
  requestExample: (ex) => set({ pendingExample: { ex, nonce: ++exampleNonce } }),

  addTab: () => {
    const id = nextId();
    set((s) => ({ tabs: [...s.tabs, { id, title: "untitled" }], activeId: id }));
    useStore.getState().closeRefPanel(); // the panel targets the old tab's rows
  },

  closeTab: (id) => {
    const s = get();
    const idx = s.tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const wasActive = s.activeId === id;
    const tabs = s.tabs.filter((t) => t.id !== id);
    if (tabs.length === 0) {
      // Always keep at least one tab; closing the last one resets to a fresh empty tab.
      const fresh = { id: nextId(), title: "untitled" };
      set({ tabs: [fresh], activeId: fresh.id });
      useStore.getState().closeRefPanel();
      return;
    }
    const activeId = wasActive ? tabs[Math.min(idx, tabs.length - 1)].id : s.activeId;
    set({ tabs, activeId });
    if (wasActive) useStore.getState().closeRefPanel();
  },

  setActive: (id) => {
    if (get().activeId === id) return;
    useStore.getState().closeRefPanel(); // the panel resolves rows against the old tab's parsed file
    set({ activeId: id });
  },

  setTitle: (id, title) => set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)) })),
}));
