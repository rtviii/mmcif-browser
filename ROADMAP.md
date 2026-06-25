# Roadmap

Living record of what mmcif-browser is and where it's going. See `README.md` for how to run
and the architecture; this file tracks status and intent.

## Done

### Data pipeline (`pipeline/`)
Parse the pinned PDBx/mmCIF dictionary into committed JSON the app loads client-side.
- `build_artifacts.py` uses rcsb `py-mmcif` `DictionaryApi` on `data/mmcif_pdbx_v50.dic` (v5.415)
  → `app/public/data/dictionary.json` (categories, items, types, groups) + `graph.json`
  (category nodes + foreign-key edges). 607 categories, 6801 items, 625 edges.
- Deterministic + pinned (records source URL / sha256 / version); no reliance on the live wwPDB site.

### Part A — dictionary graph explorer (`/`)
A navigable replacement for `mmcif.wwpdb.org`.
- React Flow, radial/ego layout centered on a focused category; click/hover/expand, hide.
- Compact default (a category + only what it references); full in+out expand is explicit.
- Sidebar: reflowed descriptions, groups, keys, items with type/enum/parent detail.
- Client-side full-text search (MiniSearch) over categories + items.
- Calm styling (static edges, no animation).

### Mol* foundation (`src/lib/molstar/`, `src/hooks/useMolstarViewer.ts`)
Generic 3D-viewer plumbing, adapted/generalised from `~/dev/fend_tubulinxyz` (no tubulin specifics).
Mol* 5.x.
- `viewer.ts` — pure `MolstarViewer` wrapper class: `load`/`loadFromUrl`, `highlightLoci`/
  `focusLoci`/`setFocusFromLoci`, `subscribeToHover`/`subscribeToClick` (→ `{chainId, authSeqId,
  compId}`), selection, `projectToScreen`, `resetCamera`, `dispose`.
- `spec.ts` (hidden UI chrome), `queries.ts` (MolScript builders + `executeQuery` → loci),
  `useMolstarViewer` (StrictMode-safe deferred dispose), thin `MolstarViewer.tsx` (lazy, ssr:false).
- Exposes the highlight/focus/hover/click primitives the inspector's 3D linkage will use.

### Inspector v0 (`/inspector`) — STOPGAP, to be reworked
Current state: load mmCIF/BinaryCIF (file or PDB id) → a tree of CATEGORIES whose rows are each
category's COLUMNS with one sample value + dictionary intellisense on hover, plus a Mol* 3D view.
This is not the intended design (see below). Reusable parts: the file load + `CIF.parseText/
parseBinary` parsing (`src/lib/cif.ts`), the dictionary join for intellisense, and the 3D viewer.

## Next

### Inspector rework — "linted source view with structural folding" (the actual goal)
See the file's real content, navigated like code in an editor — not a plaintext dump and not a
column summary.

Phase 1 — structural folding:
- Render the CIF content syntax-highlighted / "linted" (categories, items, loops, values).
- Collapsible blocks by SEMANTIC hierarchy. For coordinate loops (`atom_site`): fold by the
  biological nesting — chain > residue > atoms (collapse all atoms of a residue, all residues of a
  chain, …). Other categories: fold at the category / loop / row level.
- Editor-like: expand/collapse, jump around; stays usable on huge files (virtualized rendering).
- Keep the v0 dictionary join: hovering an item/column still surfaces its dictionary definition.

Phase 2 — 3D linkage:
- Identify which categories/items have a spatial mapping (atom_site rows, residues, chains, ligands,
  secondary-structure ranges, assemblies, …).
- Wire interaction both ways: hover/select a row (atom / residue / chain) → highlight it in the Mol*
  view (foundation already supports this: `executeQuery` → `highlightLoci`/`focusLoci`); and 3D
  hover/click → scroll/highlight the corresponding row in the source view.

Open design questions (resolve when we start):
- Source-faithful text with fold regions (CodeMirror-style) vs a structured re-render of the parsed
  data styled to look like source. The chain>residue>atom fold needs parsed grouping, so likely a
  structured re-render rather than literal text folding.
- Hierarchy keys: `auth_*` (what users cite) vs `label_*` (canonical) — probably offer both.
- Which categories get bespoke hierarchical folds beyond `atom_site` (e.g. `entity_poly_seq`,
  `struct_conf`/secondary structure, `pdbx_struct_assembly`).
- Performance: `atom_site` can be millions of rows → virtualization is mandatory.

## Backlog (unscheduled)

- Part A: group filters; usage-coverage enrichment (gray out items never used in the archive, data
  in `rcsb/mmcif_website_file_assets/coverage`); version diff between dictionary releases.
- Inspector: value-vs-dictionary validation (flag values violating an item's type regex / enum).
- Multi-dictionary: the parser is DDL2-generic — add em / ihm / ma / ddl by pointing at another `.dic`.
- A generic chains/entities panel (cf. fend_tubulinxyz `PolymerBrowser`, minus tubulin families).
- Optional: stylized Mol* rendering (outline + ambient occlusion) from their postprocessing config.
