# Handoff — mmcif-browser

For the next session picking this up cold. Pair this with `ROADMAP.md` (status + intent) and
`README.md` (architecture + how to run). This file is the orientation + gotchas.

## What this is

A personal tool to replace the unusable `mmcif.wwpdb.org`. Two parts:
- A dictionary explorer (`/`) — a navigable graph of the PDBx/mmCIF dictionary.
- A CIF inspector (`/inspector`) — a verbatim, foldable, "linted" view of a real structure file
  side-by-side with a Mol* 3D view.

Standalone repo at `~/dev/mmcif-browser`. It was started while another project (`~/dev/sampleworks`)
was the shell's working directory. **Do not modify sampleworks.**

## Run & verify

```bash
cd ~/dev/mmcif-browser/app && npm run dev     # http://localhost:3000
npx tsc --noEmit                              # typecheck (run from app/)
```
Regenerate dictionary artifacts (only if the pinned `.dic` changes):
```bash
cd ~/dev/mmcif-browser && pipeline/.venv/bin/python pipeline/build_artifacts.py
```

### Preview / browser-driving gotchas (important — cost time)
- The Claude preview MCP roots at the session's PRIMARY dir. When that's `mmcif-browser`, the existing
  `.claude/launch.json` (name `mmcif`, cwd `app`, port 3000) works directly via `preview_start`. When
  the primary dir is sampleworks, write a TEMP `~/dev/sampleworks/.claude/launch.json` that
  `cd`s into `mmcif-browser/app` and `exec npm run dev`, then delete it afterward.
- React-controlled inputs (PDB-id box): `preview_fill` does NOT update React state. Set the value via
  the native input setter + dispatch an `input` event, then in a SEPARATE step click Fetch.
- `preview_console_logs`/`preview_network` often overflow; they save to a file — grep it.
- Mol* logs ~40 dev-only `Cannot mount a disposed context` errors under React StrictMode (in
  `useMolstarViewer`'s deferred-dispose). Benign; gone in production builds. Not from our code.
- First `/inspector` compile is ~6s. Restart the dev server after a `next.config`/dependency change.
- Virtualized panes (`@tanstack/react-virtual` — both the source view and the outline tree): setting
  `scrollTop` programmatically does NOT trigger the virtualizer's re-render in the preview harness, so the
  rows you want never mount. Dispatch a scroll event after (`el.scrollTop = N; el.dispatchEvent(new
  Event('scroll', {bubbles:true}))`), or drive it through the component's own `scrollToIndex`. Also: virtual
  rows are absolutely positioned, so `querySelectorAll` DOM order ≠ visual order, and `getBoundingClientRect`
  can flakily read 0 mid-reflow. Verify these panes by SCREENSHOT, not by reading element positions.

## Current state (done)

Everything below is committed (4 commits, `init` → `a60e4fe`) and the working tree is clean —
the baseline is solid, so branch freely before starting the next batch.

- Pipeline + Part A graph explorer (`/`): unchanged, working.
- Inspector (`/inspector`) — the rework is DONE and committed (this replaced the v0 column-summary tree):
  - Verbatim, syntax-highlighted source view; fold regions computed by parsing (the displayed bytes
    are the real file). `atom_site` folds chain > residue (lazy residues); other categories collapse
    at the category level. `auth_*`/`label_*` toggle. Dictionary hover-definition kept. Virtualized
    (`@tanstack/react-virtual`); smooth on ~58k atoms.
  - Hierarchy rail gutter: text shifts right of a nested fold rail (category > chain > residue); any
    level collapses from any line; hovering a rail highlights that chain/residue in 3D.
  - View toggles: Hide preamble, Hide noise, Table. Table mode renders loop categories as
    column-aligned tables (atom_site keeps its rails); KV categories stay verbatim.
  - 3D linkage (source -> Mol*): hover a row/rail highlights, click an atom row focuses it.
    Viewer handle exposed via `MolstarViewer.tsx` `onReady`.
  - File-viewer refinement batch (branch `inspector-file-viewer`): table cells now come from Mol*'s
    parsed fields (`lib/cif-source/table.ts`), so wrapped-row loops (e.g. `entity_poly` `;`-sequences)
    table; columns align (gutter-pinned category label); long values are badges with a click-popover;
    atom rows target the ATOM (`buildAtomQuery`); collapsed placeholders are column-aligned.
  - Mol* default look (same branch): white canvas + illustrative postprocessing (outline + ambient
    occlusion) + flat `ignoreLight` material, structures rendered as ball-and-stick (lifted from
    fend_tubulinxyz). Config in `lib/molstar/style.ts`; applied in `lib/molstar/viewer.ts`
    (`applyDefaultStyling` + `buildBallAndStick`, replacing the old cartoon preset).
  - UI/UX batch (same branch): draggable vertical divider between the source and 3D panels
    (`CifInspector.tsx`, resizes the Mol* canvas live via `handleResize`); a "go to category" search
    box with native autosuggest that scrolls the virtual list (`SourceView.tsx`); and "Expand all"
    reworked into a single Expand all ↔ Collapse all toggle (`SourceInspector.onToggleExpandAll`).
  - Category → 3D interaction map v1 (same branch): hover/click a non-atom_site data row to highlight/
    focus the relevant loci. `SourceInspector.queryForLine` switches on category — entity* →
    `buildEntityQuery`, struct_conf/struct_sheet_range → residue range, struct_conn →
    `buildBondQuery` (both partners), chem_comp → `buildComponentQuery` (all instances). Row index via
    `buildLineToRow` (`cif-source/table.ts`). Deferred: struct_site, assemblies, struct_asym, unit cell.
  - Phase 5 — light-theme refit + table/nav/filter UX (same branch, 2026-06-26, commit `2de091b`):
    full light theme scoped to the inspector (`.light-surface`, IBM Plex Mono/Sans), per-category
    header rows (name + count, `∗` marks key-value categories), key-value categories as two-column tables
    (`buildKeyValueTable`), dictionary definition moved to a 1s floating tooltip
    (`HoverDefinitionTooltip` + `dict-lookup.ts`; `Definition.tsx` deleted), hidden scrollbars; fixed-
    width table cells (columns no longer shift; long values are dotted-underline click-to-expand), one
    fold arrow per category (header only), line numbers dropped, collapsed chain/residue placeholders
    rendered as a muted left-anchored outline (not data columns), and "go to category" replaced by a
    multi-value category/item filter (`CategoryFilter.tsx`, narrows the view). See ROADMAP Phase 5.
  - Phase 6 — category lenses + filter presets (same branch, 2026-06-26, commit `2de091b`): every category is
    classified into human lenses (`lib/cif-source/classify.ts`, sourced from the dictionary's own
    `Category.groups` + a `struct_*` override) so structural data is legible against deposition paperwork.
    The filter (`CategoryFilter.tsx`) shows a preset panel on focus — lens chips (Structural | Context)
    with in-file counts + hover blurbs, plus "Structural only" / "Hide deposition" / "Clear" — that
    autopopulate it. Verified on 1cbs. See ROADMAP Phase 6 for the taxonomy.
  - Navigation rework — split outline pane (same branch, commit `fcb7d76`): the left panel is now a persistent
    virtualized outline tree (every category; `atom_site` + grouped categories expand into chains → lazy
    residues; `cif-source/outline.ts` + `cif/OutlinePane.tsx`) beside a pristine source view, scroll- and
    selection-synced. The chain/residue placeholder rows are gone from the data column; `flatten.ts` folds
    only at the category level and `SourceView.tsx` lost its rail machinery. Click an outline node →
    force-expand its category in the source + scroll + amber-flash + select; source scroll → active outline
    node; hover → 3D. `atom_site` collapses by default. Inner draggable outline|source split. Verified on
    1cbs + 1aon. See ROADMAP.

## Where things live (app/src)

- `lib/store.ts`, `lib/data.ts`, `lib/types.ts`, `lib/layout.ts` — dictionary explorer core.
- `components/GraphExplorer.tsx`, `Sidebar.tsx`, etc. — Part A.
- `lib/cif.ts` — Mol* CIF/BinaryCIF parse → category/field views.
- `lib/cif-source/{segment,tokenize,fold-tree,flatten,outline,table,classify,types}.ts` — the inspector's
  source-view engine (verbatim text → document model → fold tree → flattened virtual rows; `flatten.ts` now
  folds only at the category level; `outline.ts` = `flattenOutline`/`deepestVisibleNodeAt` for the outline
  pane; `buildLoopTable`/`buildKeyValueTable`/`buildLineToRow` for table cells; `classify.ts` = the
  category→lens taxonomy (`lensesFor`/`buildLensGroups`); `isPreamble`/`ensureChildren`/`MolCifFile`
  helpers). `fold-tree.ts` still holds `PREAMBLE_PREFIXES` (now redundant with `classify.ts`'s presets).
- `components/cif/{SourceInspector,SourceView,OutlinePane,CategoryFilter,HoverDefinitionTooltip,dict-lookup}.tsx`
  — the inspector UI: orchestration + the four-way outline↔source sync; the virtualized pristine source
  renderer (header rows + table cells, no chain/residue rails); the virtualized outline tree pane; the
  multi-value category/item filter with lens presets; the floating 1s dictionary tooltip; the
  dictionary-lookup join. (The old `Definition.tsx` bottom panel was removed in Phase 5.)
- `components/CifInspector.tsx`, `app/inspector/page.tsx` — page shell: toolbar/file-load/PDB-fetch +
  the left source panel + the right `MolstarViewer`.
- `lib/molstar/{viewer,spec,queries}.ts`, `hooks/useMolstarViewer.ts`, `components/MolstarViewer.tsx`
  — Mol* foundation (adapted from `~/dev/fend_tubulinxyz`, no tubulin specifics).

## Next task

The navigation rework is DONE — the left panel is now a split outline pane + pristine source view (see
ROADMAP "Inspector navigation rework — split outline pane"). Natural next focus: **reverse 3D linkage** —
3D hover/click should scroll + highlight the source row AND select the matching outline node. The plumbing
exists: `SourceView` exposes a `scrollToIndex` handle, `OutlinePane` exposes `scrollToIndex` + takes
`activeOutlineId`, and `deepestVisibleNodeAt` (`cif-source/outline.ts`) maps a source line to its outline node.

Other deferred (ROADMAP "Carried-over"): interaction map for `struct_site`/assemblies/`struct_asym`/
unit-cell; toolbar crowding at narrow splits; retire "Hide preamble" (redundant with the Phase-6 presets);
`chem_comp_bond` lens tag (Ligands vs Bonds); whole-loop column alignment past the first-rows sample.

## Notes

- `~/dev/fend_tubulinxyz` is the user's tubulin viewer and the SOURCE of our Mol* patterns; it's
  pre-indexed in Deepwiki. Use Deepwiki for its molstar styling/representation specifics.
- Git: `main` is at `a60e4fe`. Branch `inspector-file-viewer` (off `a60e4fe`): Phase 4 batch (5 commits to
  `523db7d`), then Phase 5+6 (`2de091b`), then the split outline pane rework (`fcb7d76`). Working tree clean;
  nothing merged to `main` yet. The user signs commits — if signing fails ("Couldn't find key in agent"),
  `ssh-add ~/.ssh/rtviii` first (the ed25519 key matching `user.signingkey`). `.claude/launch.json` has
  `autoPort: true` (port 3000 was occupied during dev); revert if you want it pinned.
