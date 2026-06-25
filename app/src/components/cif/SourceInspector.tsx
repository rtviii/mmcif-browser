"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ParsedCif } from "@/lib/cif";
import { flattenVisible } from "@/lib/cif-source/flatten";
import { buildFoldTree, ensureChildren, type HierarchyMode } from "@/lib/cif-source/fold-tree";
import { segmentDocument } from "@/lib/cif-source/segment";
import { asMolCifFile } from "@/lib/cif-source/types";
import { Definition, type HoverTarget } from "./Definition";
import SourceView from "./SourceView";

interface LoadedFile {
  data: string | Uint8Array;
  binary: boolean;
  name: string;
}

// Orchestrates the verbatim source view: segment -> fold tree -> flatten, owning the
// collapse/mode/hover state. The fold tree spans every data block in the file (the v0
// block <select> only steers the 3D viewer), so multi-block files fold throughout.
export default function SourceInspector({
  file,
  parsed,
}: {
  file: LoadedFile | null;
  parsed: ParsedCif | null;
}) {
  const [mode, setMode] = useState<HierarchyMode>("auth");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<HoverTarget>(null);

  const isText = !!file && !file.binary;

  const doc = useMemo(
    () => (isText && file ? segmentDocument(file.data as string) : null),
    [file, isText],
  );

  const tree = useMemo(() => {
    if (!doc || !parsed) return null;
    return buildFoldTree(doc, asMolCifFile(parsed.raw), mode);
  }, [doc, parsed, mode]);

  // Reset to the default view (chains collapsed) whenever the tree is rebuilt.
  useEffect(() => {
    const s = new Set<string>();
    if (tree) for (const n of tree.roots) if (n.level === "chain") s.add(n.id);
    setCollapsed(s);
  }, [tree]);

  const visible = useMemo(
    () => (doc && tree ? flattenVisible(doc, tree, collapsed) : []),
    [doc, tree, collapsed],
  );

  const onToggle = useCallback(
    (id: string) => {
      if (!tree) return;
      const node = tree.byId.get(id);
      const expanding = collapsed.has(id);
      // Compute residues lazily on first chain expand (outside the state updater so it
      // runs exactly once under StrictMode).
      if (expanding && node?.lazy) ensureChildren(tree, node);
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
          if (node?.children) for (const c of node.children) next.add(c.id); // residues start collapsed
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [tree, collapsed],
  );

  const onCollapseChains = useCallback(() => {
    const s = new Set<string>();
    if (tree) for (const n of tree.roots) if (n.level === "chain") s.add(n.id);
    setCollapsed(s);
  }, [tree]);

  const onExpandAll = useCallback(() => setCollapsed(new Set()), []);
  const onHoverItem = useCallback((cat: string, field: string) => setHover({ kind: "item", cat, field }), []);
  const onClearHover = useCallback(() => setHover(null), []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {isText && doc && tree ? (
        <SourceView
          doc={doc}
          visible={visible}
          mode={mode}
          onModeChange={setMode}
          onToggle={onToggle}
          onCollapseChains={onCollapseChains}
          onExpandAll={onExpandAll}
          onHoverItem={onHoverItem}
          onClearHover={onClearHover}
        />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-[11px] text-neutral-600">
          {file?.binary
            ? "Source view needs text mmCIF. This is BinaryCIF — open the .cif to inspect the source. The 3D view still works."
            : "Parsing…"}
        </div>
      )}
      <Definition hover={hover} />
    </div>
  );
}
