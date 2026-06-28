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

### Inspector Phase 4 — file-viewer + Mol* look + UI/UX + interaction map (done, branch `inspector-file-viewer`)
The 2026-06-25 feedback batch. Branch off `a60e4fe`, NOT yet merged to `main` (five commits). Each
piece verified in-browser on 1cbs + 4hhb; typecheck clean; no runtime errors.
- File-viewer / table mode (`f8e4c15`): table cells read from Mol*'s parsed fields per row
  (`cif-source/table.ts` `buildLoopTable` / `buildLineToRow`), so loops whose rows wrap across physical
  lines (e.g. `entity_poly` `;`-sequences) now table instead of falling back to verbatim. Column
  stagger fixed (category label pinned in the gutter so header + data share one origin); long /
  `;`-multiline values render as a truncated badge with a click-to-open persistent popover; atom rows
  target the ATOM (`buildAtomQuery`); collapsed placeholders are column-aligned.
- Mol* default look (`fbcf078`): white canvas + illustrative postprocessing (black outline + ambient
  occlusion) + flat `ignoreLight` material, structures rendered as ball-and-stick. Config in
  `lib/molstar/style.ts`; applied in `viewer.ts` (`applyDefaultStyling` + `buildBallAndStick`,
  replacing Mol*'s cartoon preset). Lifted from `~/dev/fend_tubulinxyz`.
- UI/UX (`b006220`): draggable vertical divider between the source and 3D panels (resizes the Mol*
  canvas live via `handleResize`); "go to category" search box with native autosuggest that scrolls
  the virtual list; "Expand all" reworked into a single Expand all ↔ Collapse all toggle.
- Category → 3D interaction map v1 (`523db7d`): hover/click a non-`atom_site` data row highlights /
  focuses the loci, via `SourceInspector.queryForLine` (switch on category) — entities →
  `buildEntityQuery`, struct_conf / struct_sheet_range → residue range, struct_conn → both partners
  (`buildBondQuery`), chem_comp → all instances (`buildComponentQuery`).

### Inspector Phase 5 — light-theme refit + table/nav/filter UX (done, branch `inspector-file-viewer`)
Two 2026-06-26 feedback batches. Verified in-browser on 1cbs; typecheck clean. UNCOMMITTED (working
tree) — see Git note in `HANDOFF.md`.

Batch A — light theme + per-category structure:
- Full light theme, scoped to the inspector (`.light-surface` on the `CifInspector` root + utilities in
  `globals.css`), matching fend_tubulinxyz: white surface, slate text, muted syntax (indigo keyword /
  teal item / amber string / rose number), IBM Plex Mono + Sans via `next/font` (`layout.tsx`,
  `tailwind.config.ts`). The dark dictionary-graph page (`/`) is deliberately untouched (the shared
  `NavBar` stays dark over the light inspector).
- Category header rows: every category (loop AND key-value) now gets a header ROW above its block
  (name + row/item count) with inter-block spacing; key-value categories carry a `∗` marker
  (`title="Key-value category"`). The old truncated in-gutter teal category label is gone. Mechanics:
  new `"header"` `VisibleRow` kind emitted per top-level category in `flatten.ts` (additive when
  expanded, replaces the placeholder when collapsed); header rows are 30px via per-index
  `estimateSize`; `FoldNode` gained `spanKind` + `summary` (`fold-tree.ts`).
- Key-value categories render as aligned two-column item|value tables in table mode
  (`buildKeyValueTable` in `cif-source/table.ts`, values from Mol*'s parsed fields; `;`-continuation
  lines hidden via the `hiddenLines` set).
- Dictionary hover-definition moved from the fixed bottom panel to a floating tooltip (~1s dwell,
  `createPortal` to body, edge-clamped, `pointer-events-none`): `HoverDefinitionTooltip.tsx` + extracted
  `dict-lookup.ts` (`lookupDefinition`); `Definition.tsx` deleted.
- Scrollbars hidden (`.no-scrollbar`; still wheel/trackpad-scrollable).

Batch B — table / navigation / filter polish:
- Table cells are ALWAYS fixed-width now (`cellPx(w)`), so columns never shift; the old content-sized
  badge is gone. Long / multiline values are click-to-expand with a dotted underline, and the expand
  threshold was raised to `value.length > w + 12` so near-fit values don't sprout an affordance
  (`DataCell` in `SourceView.tsx`).
- One fold arrow per category: the chevron lives only in the header row; the redundant gutter chevron at
  the category's first line is suppressed (`a.level !== "category"` in `Gutter`). Chains/residues keep
  theirs.
- Line numbers dropped (narrow gutter). Collapsed chain/residue placeholders render as a muted,
  left-anchored outline (`▸ chain A · … lines`) instead of data-aligned columns, so navigation no longer
  reads as data (`PlaceholderRow`).
- "Go to category" replaced by a multi-value category/item filter (`CategoryFilter.tsx`): searchable
  chips, categories vs items styled distinctly; selecting narrows the source view to those categories (an
  item resolves to / is shown under its category). Applied in `SourceInspector` (`visibleShown`). This is
  the seed for the next feature.

### Inspector Phase 6 — category lenses + filter presets (done, branch `inspector-file-viewer`, UNCOMMITTED)
2026-06-26. Classify every category into human "lenses" so structural data (a small fraction) is legible
against deposition paperwork (the bulk), and drive the filter from one-click presets. Verified on 1cbs
(typecheck clean, no console errors): lens counts correct (Atoms 3 / Molecules 10 / Bonds 6 / Ligands 6 /
Assembly 8 / Experiment 11 / Heterogeneity 1 / Metadata 15); "Structural only" and "Hide deposition"
select the right sets (the latter keeps experiment/refinement, drops the 14 pure-metadata categories);
lens chips toggle and narrow the view. Implementation: `lib/cif-source/classify.ts` (`lensesFor` +
`buildLensGroups` + `structuralCategories` + `nonDepositionCategories`), the preset panel in
`CategoryFilter.tsx`, wired from `SourceView` via the store `dict`. The taxonomy + sourcing it shipped
with are recorded below.

What "Hide preamble" excludes today (so we can articulate / replace it): the prefix list
`PREAMBLE_PREFIXES` in `fold-tree.ts` — categories equal to or starting with `audit`, `citation`,
`software`, `computing`, `database`, `pdbx_database`, `pdbx_audit`, `pdbx_version`, `struct_keywords`,
`diffrn`, `exptl`, `reflns`, `refine`, `pdbx_refine`, `pdbx_nmr`, `phasing`, `pdbx_validate`, `em`,
`pdbx_initial`, `pdbx_data_processing`, `pdbx_serial`. It only COLLAPSES them, it's an opaque heuristic,
and it lumps experiment/refinement in with pure paperwork. The lenses below separate those and explain
themselves.

Proposed lenses — two tiers (a category may carry several; overlaps expected). The split that matters is
Structural (the few you came for) vs Context (provenance/method/admin — the bulk).

Structural:
- Atoms — the literal coordinates + atom inventory. `atom_site`, `atom_sites`, `atom_site_anisotrop`,
  `atom_type`.
- Molecules & sequence — what the chains/entities are and how sequence maps onto the model. `entity*`,
  `entity_poly`, `entity_poly_seq`, `entity_src_*`, `struct_asym`, `struct_ref`, `struct_ref_seq(_dif)`,
  `pdbx_poly_seq_scheme`, `pdbx_nonpoly_scheme`.
- Bonds & topology — covalent connectivity + secondary structure. `struct_conf(_type)`, `struct_sheet*`,
  `pdbx_struct_sheet_hbond`, `struct_conn(_type)`, `chem_comp_bond`, `geom_*`.
- Ligands & chemistry — non-polymer components + where they bind. `chem_comp`, `chem_comp_atom`,
  `chem_comp_bond`, `pdbx_chem_comp_*`, `pdbx_entity_nonpoly`, `struct_site`, `struct_site_gen`.
- Assembly & symmetry — biological unit + crystallographic frame. `cell`, `symmetry`, `space_group*`,
  `pdbx_struct_assembly(_gen)`, `pdbx_struct_oper_list`, `struct_biol*`, `struct_ncs_*`,
  `database_PDB_matrix`, `atom_sites` (the fract/Cartn transform).

Context (mostly skippable):
- Experiment & refinement — how it was determined + quality. `exptl*`, `diffrn*`, `reflns*`, `refine`,
  `refine_hist`, `refine_ls_*`, `refine_analyze`, `pdbx_refine*`, `phasing*`, `em_*` (cryo-EM),
  `pdbx_nmr_*`, `software`, `computing`, `pdbx_data_processing*`.
- Heterogeneity & validation — disorder, alt confs, unmodeled atoms, geometry-validation flags.
  `atom_site_anisotrop`, `pdbx_struct_mod_residue`, `pdbx_unobs_or_zero_occ_*`, `pdbx_validate_*`,
  `struct_ncs_*` (overlap with Assembly).
- Deposition & metadata — the paperwork: provenance, citation, revision history, database IDs. `entry`,
  `struct`, `struct_keywords`, `audit*`, `citation*`, `database_2`, `pdbx_database_*`, `pdbx_audit_*`,
  `pdbx_version*`, `pdbx_contact_author`.

How to source the tags (don't hand-maintain a category list): the dictionary already groups every
category — `dictionary.json` carries `Category.groups` (e.g. `refine_analyze → refine_group,
inclusive_group`; visible in the hover tooltip). Curate a small `dictionaryGroup → lens` map (~30 DDL2
groups: `atom_group`, `entity_group`, `struct_conn_group`, `chem_comp_group`, `cell_group`,
`symmetry_group`, `diffrn_group`, `reflns_group`, `refine_group`, `phasing_group`, `exptl_group`,
`citation_group`, `database_group`, `audit_group`, `em_group`, `nmr_group`, …) and treat
`inclusive_group` (the catch-all root) as no signal. One coarseness to patch: `struct_group` spans
topology, sites, assembly, sequence-refs AND the `struct`/`struct_keywords` metadata — so add a
category-level override map for the `struct_*` family. Put this in a new `lib/cif-source/classify.ts`
exporting `lensesFor(category, dict): Lens[]`.

Filter UX (a real control, not a search box — `CategoryFilter.tsx` already owns the selection model):
- Add a compact preset strip beside/above the input: one chip per lens, grouped Structural | Context,
  each showing its in-file category count (e.g. "Atoms · 4") and a hover explanation of what the lens
  means and why you'd (de)select it. Empty lenses (not present in this file) are hidden/disabled — derive
  counts from `doc.spans`.
- Two cross-cutting presets: "Structural only" (selects every in-file category tagged with any structural
  lens) and "Hide deposition/metadata" (everything except the Deposition lens). Clicking a preset
  AUTOPOPULATES the filter with the matching category chips, so it composes with manual chips and stays
  editable.
- Reconcile "Hide preamble": back it by `classify.ts` (Deposition + Experiment lenses) so it stops being
  a prefix heuristic, or retire it for the "Hide deposition/metadata" preset.
- Watch toolbar width — it already crowds at narrow split widths; the richer control may want its own row
  or a popover rather than sitting inline (overflow-x scroll is out: it clips the filter dropdown).

### Inspector navigation rework — split outline pane (done, branch `inspector-file-viewer`, commit `fcb7d76`)
The Phase-5 ask (chain/residue navigation OFF the data columns, untouched data) is now addressed properly.
The inspector's left panel is split into a persistent OUTLINE/TREE pane + a pristine source view, scroll-
and selection-synced. The interleaved `▸ A ASN 2 … 8 lines` placeholder rows (and the redundant double-
triangle) are gone.
- New `lib/cif-source/outline.ts` (`flattenOutline` + `deepestVisibleNodeAt`) and `components/cif/OutlinePane.tsx`
  — a virtualized document outline: every category, with `atom_site` (and the grouped categories) expandable
  into chains → lazy residues. One chevron per node.
- Source is pristine: `flatten.ts` folds only at the category level (dropped the `placeholder` `VisibleRow`
  kind + chain/residue recursion); `SourceView.tsx` dropped the rail machinery (`PlaceholderRow`/`Rail`/gutter
  slots, `maxDepth`, the "Collapse chains" button) for a fixed gutter spacer, and gained a `scrollToIndex`
  imperative handle, an `onTopLineChange` scroll reporter, and a transient `highlightRange` flash. Identical in
  table and regular mode.
- `SourceInspector.tsx` is the sync hub: its own `outlineExpanded` state (`ensureChildren` on lazy expand);
  hover → 3D (reuses `onNodeEnter`); click an outline node → force-expand its category in the source, scroll,
  amber-flash, select; source scroll → deepest outline-visible node (guarded against feedback). `atom_site`
  collapses by default so the source never dumps tens of thousands of atom lines — reach atoms via the outline
  or the category header. Inner draggable outline|source split (no Mol* resize). Verified on 1cbs + 1aon
  (58,870-row `atom_site`, 21 chains); typecheck clean, no console errors.

### Inspector — controls refactor + reusable context chip + persistent pin + 3D labels (done, branch `inspector-controls-pin-labels`)
2026-06-28. Verified in-browser on 9mlf (typecheck clean, no console errors). UNCOMMITTED (working tree)
— branch off `main` (which now carries the old `inspector-file-viewer` commits).
- Shared mmCIF category/item element + one tooltip (`components/cif/MmcifChip.tsx`,
  `GlobalHoverTooltip.tsx`): the hover-definition state moved into the Zustand store (`store.ts`:
  `hoverDef`/`hoverAnchor`/`setHoverDef`/`clearHoverDef`), one `HoverDefinitionTooltip` mounts at the app
  root (`app/layout.tsx`), and `MmcifChip` (variants `chip`/`row`/`inline`, optional `onToggle`/`onRemove`/
  `onDigDeeper`) raises it. `SourceInspector` dropped its local hover state and routes the source-view
  token/header hover through the store, so every category/item context looks + behaves the same. Verified
  the same tooltip fires from a View-menu pill AND a source category name.
- Compact top bar + hover "View" menu (`components/cif/ViewMenu.tsx`): `auth_*`/`label_*`, Hide preamble,
  Hide noise consolidated into one hover/click menu, each with a plain-English explanation; Hide preamble
  also lists the file's actual preamble categories as `MmcifChip` pills (the `isPreamble` set over
  `tree.roots`). Table + Collapse/Expand-all stay as one-click buttons. Bar is now
  `View ▾ | Table | Expand all | Filter / lenses ▾ | N rows`.
- Filter / lenses as a real panel (rewrote `CategoryFilter.tsx`): a button (active-count badge) opens a
  ~520px popover — search box, collapsible lens clusters (Structural/Context) each expandable to its
  categories as `MmcifChip` rows with a toggle + the shared tooltip, plus Structural only / Hide deposition
  / Clear. `FilterEntry[]` contract unchanged (`SourceInspector.visibleShown` untouched). The `onDigDeeper`
  hook on each row is the wired-but-unused entry point for the reference graph below.
- Persistent single pin (`SourceInspector` `pinned: PinnedTarget`, `SourceView` pin strip): click a row
  (atom / structural / metadata) or a category header to pin it — persistent indigo text highlight
  (`pinnedRange`/`pinnedHeaderId`), an outline mark (`OutlinePane` `pinnedId`), the 3D selection + a
  persistent label, and a `PINNED <label> × unpin` strip below the toolbar that scrolls back (reuses the
  `pendingScroll` path, now generalized from a `FoldNode` to a `{line, catId, flash}` `ScrollRequest`).
  Re-click / the chip's × / Esc release it. `resolveLine` replaced `queryForLine` and returns `{query,
  label}` for hover, click, and pin.
- 3D labels on hover + pin (`lib/molstar/labels.ts` — `LabelManager` ported from `~/dev/fend_tubulinxyz`,
  Mol* 5.10 `mol-repr/shape/loci/label`): `viewer.ts` gained `showHoverLabel`/`hideHoverLabel`/
  `addPersistentLabel`/`removePersistentLabel`. Hovering/pinning a structural row shows a tethered in-scene
  text label populated with the item (atom `COMP seq · atom (chain)`, residue, `chain X`, entity
  description, `helix/strand X a–b`, bond, chem_comp name) — sky for hover, indigo for the pin — so the
  faint Mol* highlight is no longer the only signal. Verified: the "Stathmin-4" label tethered to entity 3.

## Next

### Reference graph — what links to / from any element ("dig deeper")
BUILT 2026-06-28 (s2), branch `inspector-controls-pin-labels` (uncommitted): `cif/ReferencePanel.tsx` (custom
MmcifChip ego-view, not React Flow) + `lib/cif-source/joins.ts` (R2 forward joins + R3 reverse scan, capped, with
a residue-positional adapter for struct_conf/sheet_range/conn/site_gen). Store slice `itemChildren` + `refPanel`.
Opened from the reachable tooltip's "References" button and the pinned strip's "⧉ references". The R1-R3 sketch
below is the original design; the follow-up "references = file navigation" rework is in the next-session batch.
For any row / item / category, a compact ~400×400 popover
that shows what it REFERENCES (outgoing foreign keys) and what REFERENCES it (incoming), beyond the
structural hierarchy. Entry point already wired: `MmcifChip`'s `onDigDeeper` (currently unused). Build on
the dictionary-graph instrumentation that already exists for `/` (`store.ts` `adj.in`/`adj.out`,
`GraphEdge.links {child, parent}` from `graph.json`, the `GraphExplorer`/`Sidebar` rendering). Three layers,
phased:
- R1 — schema layer (cheap, mostly built). For a CATEGORY: the categories it links to / that link to it,
  at item granularity, straight from `adj` + `GraphEdge.links`. A focused reuse of the existing graph data
  in a small popover (reuse React Flow, or a lightweight custom tree). This alone makes `MmcifChip` "dig
  deeper" useful everywhere it appears.
- R2 — instance layer (the meaty part the user actually asked for). For a SPECIFIC row, resolve its actual
  FK VALUES to specific rows in referenced categories: e.g. an `atom_site` row → `label_asym_id` joins
  `struct_asym.id` → `label_entity_id` → the `entity` row; `auth_seq_id`+asym → `entity_poly_seq`. Needs a
  lazily-built per-file value index (`category.field` value → row indices), parsed from `parsed.raw`. This is
  the "what is this atom part of" chain (atom → residue → chain → entity).
- R3 — reverse references. Scan the FK tables (`struct_conf`, `struct_sheet_range`, `struct_conn`,
  `struct_site_gen`, `pdbx_struct_mod_residue`, …) for rows that MENTION the focused residue/atom/chain —
  "this residue also appears in helix X / bond Y / site Z".
- UI: centered focused node; incoming above/left, outgoing below/right; nodes clickable to navigate (scroll
  the source + re-pin via the existing `pendingScroll` / pin machinery). Compose with the persistent pin so
  "dig deeper" and "pin" reinforce each other.

### Next session — polish + references-as-navigation (from 2026-06-28 s2 in-browser feedback)
Surfaced after testing the DOM-overlay labels / reachable tooltip / reference panel on 8roj + chem_comp_bond.
All on branch `inspector-controls-pin-labels` (still UNCOMMITTED). Roughly ordered by cost.

1. **Duplicate tooltip (quick).** A table-mode column header shows BOTH the native browser `title` tooltip
   ("value_order") and our dictionary tooltip — the small one is useless. Remove `title={f}` at `SourceView.tsx:450`
   (audit other `title=` on hover-def triggers). Dictionary tooltip is the only one.

2. **Reference-panel header truncates the name (quick).** Header chip is `MmcifChip variant="chip"`, inner span
   `max-w-[160px] truncate` (`MmcifChip.tsx:109`), so `_chem_comp_bond.value_ord…` clips. Render the FULL name in
   the header (use `variant="inline"` or a dedicated non-truncating title); keep truncation on neighbour chips.

3. **Hover label persists after fast scroll (bug).** Fast scrolling sometimes leaves a hover label stuck (no pin).
   Cause: in `labels.ts`, `hideHover()` sets the hover node `display:none`, but `updateAll()` (every `didDraw`)
   re-calls `place(this.hover)` → `display:""` re-shows it. Fix: a `hoverActive` flag (or per-node `active`) that
   `hideHover` clears, `updateAll`/`place` honour, `showHover` sets. Also confirm `onStructLeave` cancels the
   pending throttled show (`rafRef`) so a queued show can't reappear after leave.

4. **Filter lenses = mutually exclusive (radio).** The lens clusters currently UNION into the selection. Make each
   lens preset REPLACE the whole category selection (one active at a time): point the lens `onToggleAll` at
   `setCats(l.categories)` instead of `toggleCats` (`CategoryFilter.tsx:83-91`); "active" = current selection equals
   that lens's set. ("Structural only" / "Hide deposition" already replace.)

5. **Filter: full category list by default.** Beneath the lens presets (no-search view), render the COMPLETE in-file
   category list as a scrollable section of toggle rows so the search space is obvious without typing. `catOpts`
   already computes it but is capped at `MAX_OPTS = 60` (`CategoryFilter.tsx:30,71`) and only shown in
   `SearchResults`. Raise/remove the cap for the default list (or virtualize) + an "All categories" section.

6. **Outline pane toggleable + hidden by default.** Reclaim horizontal space. Add `showOutline` (default `false`) in
   `SourceInspector`; a toggle in the top bar (`SourceView` TopBar via a new prop); when hidden, skip `OutlinePane`
   + its drag handle so the source takes full inner width. Current split: `outlinePct`/`innerSplitRef` + OutlinePane
   render (~663-685).

7. **References panel = FILE navigation, not schema re-center (the meaty one).** Clicking a neighbour currently
   re-centers the schema view (`setRefTarget`) — useless per the user. Make it jump into the loaded file with a
   transient flash, reusing the `pendingScroll` machinery (`onOutlineNodeClick` / `jumpToInstance`):
   - neighbour CATEGORY chip → scroll the source to that category's header.
   - **"via &lt;key&gt;"** → scroll to where the CHILD item `_childCat.childField` appears (its declaration/column).
   - Add `jumpToCategory(cat)` + `jumpToItem(cat, field)` in `SourceInspector`; pass to `ReferencePanel`; carry the
     child item (cat+field) per neighbour. Keep instance-mode `→` (jump to the exact joined row).

   **Underdetermined — settle at the start of next session:**
   - (a) Not-in-file neighbours (the graph lists categories/items absent from THIS file): no line to jump to.
     Recommend grey + non-jumping (tooltip still works), keep "Open in full graph"; alt is to hide them.
   - (b) "via" precision: schema mode has no specific row → jump to the item's DECLARATION/column line. Confirm.
   - (c) Panel after a jump: keep open (keep hopping) vs auto-close to reveal the file. Recommend keep open.
   - (d) Drop schema re-center entirely (yes per "kinda useless") — deeper schema browse stays on "Open in full
     graph". Confirm.
   - (e) Instance mode: keep `→` for the exact row AND make the category chip jump to the category header. Confirm.

### Carried-over / deferred
- Interaction map — deferred categories: `struct_site` / `struct_site_gen` (binding-site residues),
  `pdbx_struct_assembly`(`_gen`) (assembly transforms), `struct_asym` (asym unit), cell / symmetry
  (unit cell). Same `queryForLine` switch in `SourceInspector.tsx`.
- Interaction map — extend hover to the fold-rail group nodes (entity / secondary-structure groups);
  decide whether an atom-row CLICK should focus the whole residue rather than the single atom.
- Reverse 3D linkage: 3D hover/click → scroll + highlight the source row AND select the matching outline
  node. The plumbing now exists — `SourceView` exposes `scrollToIndex`, the outline has `scrollToIndex` +
  `activeOutlineId`, and `deepestVisibleNodeAt` (in `outline.ts`) maps a line to its outline node.
- Label-mode chain queries when a label chain spans multiple auth chains (auth mode is exact).
- Whole-loop column alignment: cell widths are now fixed but still SAMPLED from the first ~60 rows
  (`SAMPLE_ROWS` in `table.ts`); a wide value past the sample can clip. (KV two-column tables: done.)
- `.bcif` generated-text fallback (clearly marked synthetic) so the source view works for binary.
- Value-vs-dictionary validation (flag values violating an item's type regex / enum).
- Retire "Hide preamble" (`PREAMBLE_PREFIXES` in `fold-tree.ts`) — now redundant with the Phase 6
  "Hide deposition" / "Structural only" presets; or re-point it at `classify.ts`.
- ~~The filter control crowds the toolbar at narrow split widths~~ — DONE (2026-06-28): the filter is now a
  popover button, the pin moved to its own strip below the toolbar, and the toolbar buttons are `shrink-0
  whitespace-nowrap`, so the bar no longer wraps.
- Lens taxonomy is a heuristic over the dictionary's (coarse) own groups + a `struct_*` override; tune
  `classify.ts` as edge cases surface (e.g. `chem_comp_bond` is tagged Ligands, not Bonds).

## Backlog (unscheduled)

- Part A: group filters; usage-coverage enrichment (gray out items never used in the archive, data
  in `rcsb/mmcif_website_file_assets/coverage`); version diff between dictionary releases.
- Inspector: value-vs-dictionary validation (flag values violating an item's type regex / enum).
- Multi-dictionary: the parser is DDL2-generic — add em / ihm / ma / ddl by pointing at another `.dic`.
- A generic chains/entities panel (cf. fend_tubulinxyz `PolymerBrowser`, minus tubulin families).
