"use client";
import { useStore } from "@/lib/store";
import { HoverDefinitionTooltip } from "./HoverDefinitionTooltip";

// Single dictionary-definition tooltip for the whole app. Mounted once at the root layout so
// any mmCIF category/item element (MmcifChip, source-view tokens, filter rows) on any page can
// raise it via the store's hoverDef/hoverAnchor. Portaled to <body> by the tooltip itself.
export default function GlobalHoverTooltip() {
  const hover = useStore((s) => s.hoverDef);
  const anchor = useStore((s) => s.hoverAnchor);
  return <HoverDefinitionTooltip hover={hover} anchor={anchor} />;
}
