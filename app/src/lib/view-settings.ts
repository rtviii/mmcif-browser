import { create } from "zustand";
import type { HierarchyMode } from "./cif-source/fold-tree";

// Global, cross-tab display settings for the source inspector. These used to live as per-tab local
// state in SourceInspector; they're lifted here so the NavBar settings gear (⚙, before "mmCIF") can
// drive them for the whole app and every mounted tab reads the same values. Per-tab state (the tree
// collapse set, the category filter, the pin) stays local to each SourceInspector.
//
// `activePreambleCategories` is published by the active tab so the gear's "Hide preamble" section can
// list exactly the categories it collapses in the file you're looking at.
interface ViewSettings {
  naming: HierarchyMode; // auth_* vs label_* grouping of chains/residues
  hidePreamble: boolean; // collapse method/deposition header categories
  hideNoise: boolean; // drop blank + comment lines
  stickyHeader: boolean; // pin the current category header while scrolling (table mode)
  showOutline: boolean; // show the outline pane
  tableMode: boolean; // render loops as tables

  activePreambleCategories: string[]; // preamble categories present in the active file

  setNaming: (m: HierarchyMode) => void;
  toggleHidePreamble: () => void;
  toggleHideNoise: () => void;
  toggleStickyHeader: () => void;
  toggleShowOutline: () => void;
  toggleTableMode: () => void;
  setActivePreambleCategories: (cats: string[]) => void;
}

export const useViewSettings = create<ViewSettings>((set) => ({
  naming: "auth",
  hidePreamble: true,
  hideNoise: true,
  stickyHeader: true,
  showOutline: false,
  tableMode: true,

  activePreambleCategories: [],

  setNaming: (naming) => set({ naming }),
  toggleHidePreamble: () => set((s) => ({ hidePreamble: !s.hidePreamble })),
  toggleHideNoise: () => set((s) => ({ hideNoise: !s.hideNoise })),
  toggleStickyHeader: () => set((s) => ({ stickyHeader: !s.stickyHeader })),
  toggleShowOutline: () => set((s) => ({ showOutline: !s.showOutline })),
  toggleTableMode: () => set((s) => ({ tableMode: !s.tableMode })),
  setActivePreambleCategories: (activePreambleCategories) => set({ activePreambleCategories }),
}));
