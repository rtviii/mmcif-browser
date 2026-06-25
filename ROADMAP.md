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

### Inspector — folded, linted source view (Phase 1, done)
`/inspector` renders the VERBATIM file text, syntax-highlighted, with fold regions computed by
parsing (the displayed bytes are the real file; parsing only decides what's collapsible). Built as
four pure modules (`src/lib/cif-source/{segment,tokenize,fold-tree,flatten}.ts`) feeding a virtualized
renderer (`src/components/cif/{SourceView,SourceInspector,Definition}.tsx`), with `CifInspector`
keeping the toolbar / file-load / block-select / Mol* panel.
- `atom_site` folds by chain > residue (residues computed lazily on chain expand); a few more
  categories fold by one grouping level (`entity_poly_seq`, `struct_conf`, `struct_sheet_range`).
  Every other category collapses at the category level.
- `auth_*` / `label_*` toggle recomputes only the fold grouping; the rendered text never changes.
- Dictionary hover-definition kept (hovering an `_cat.item` token). Virtualized via
  `@tanstack/react-virtual`; verified smooth on ~58k-atom structures (1aon).
- `.bcif` shows a notice (needs text mmCIF); the 3D panel still loads.

### Inspector Phase 2 — 3D linkage (source → Mol*, done)
Hovering a structural source row (atom line, residue/chain placeholder, or chain/residue fold rail)
highlights the matching element in the Mol* view; clicking an atom row focuses the camera on its
residue. Maps `atom_site` rows to `auth_asym_id` / `auth_seq_id` read directly (so it works in both
auth and label modes) → `buildResidueQuery`/`buildChainQuery` → `executeQuery` →
`highlightLoci`/`focusLoci`. The `MolstarViewer` handle is surfaced via `onReady`. Ligands are covered
by the atom_site residue path.

### Inspector Phase 3 — quality-of-life view options (done)
The raw on-disk view is the default; these are toggles in the source-view header:
- Hierarchy rail gutter: text shifts right of a fold rail showing category > chain > residue nesting;
  any level collapses from any line, and hovering a rail highlights that chain/residue in 3D.
- Hide noise (`loop_` / `#` / blank lines) and Collapse preamble (bookkeeping categories) toggles;
  every category collapses to a one-line summary.
- Table view: loop categories render as column-aligned tables (tiny category name + column-name
  header row + value cells; widths sampled from the first rows; long values truncate with click-to-
  expand). atom_site keeps its chain/residue rails, so you get the table AND the hierarchy. Key-value
  categories stay verbatim (they already read fine).

## Next

Open / deferred:
- Reverse 3D linkage: 3D hover/click → scroll + highlight the source row (use each fold node's
  `rowStart`/`rowEnd`).
- Label-mode chain queries when a label chain spans multiple auth chains (auth mode is exact).
- Table view refinements: key-value categories as a two-column table; `;`-multiline loop values
  (currently fall back to verbatim for that row); aligning across the whole loop (widths are sampled
  from the first ~40 rows).
- `.bcif` generated-text fallback (clearly marked synthetic) so the source view works for binary.
- Value-vs-dictionary validation (flag values violating an item's type regex / enum).
- The "preamble" classifier is a heuristic prefix list in `fold-tree.ts` — tune as needed.

## Backlog (unscheduled)

- Part A: group filters; usage-coverage enrichment (gray out items never used in the archive, data
  in `rcsb/mmcif_website_file_assets/coverage`); version diff between dictionary releases.
- Inspector: value-vs-dictionary validation (flag values violating an item's type regex / enum).
- Multi-dictionary: the parser is DDL2-generic — add em / ihm / ma / ddl by pointing at another `.dic`.
- A generic chains/entities panel (cf. fend_tubulinxyz `PolymerBrowser`, minus tubulin families).
- Optional: stylized Mol* rendering (outline + ambient occlusion) from their postprocessing config.
