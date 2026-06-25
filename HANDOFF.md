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

## Where things live (app/src)

- `lib/store.ts`, `lib/data.ts`, `lib/types.ts`, `lib/layout.ts` — dictionary explorer core.
- `components/GraphExplorer.tsx`, `Sidebar.tsx`, etc. — Part A.
- `lib/cif.ts` — Mol* CIF/BinaryCIF parse → category/field views.
- `lib/cif-source/{segment,tokenize,fold-tree,flatten,types}.ts` — the inspector's source-view engine
  (verbatim text → document model → fold tree → flattened virtual rows; `splitValues` for table cells;
  `isPreamble`/`ensureChildren`/`MolCifFile` helpers).
- `components/cif/{SourceInspector,SourceView,Definition}.tsx` — the inspector UI (orchestration,
  virtualized renderer + rails + table cells, dictionary hover panel).
- `components/CifInspector.tsx`, `app/inspector/page.tsx` — page shell: toolbar/file-load/PDB-fetch +
  the left source panel + the right `MolstarViewer`.
- `lib/molstar/{viewer,spec,queries}.ts`, `hooks/useMolstarViewer.ts`, `components/MolstarViewer.tsx`
  — Mol* foundation (adapted from `~/dev/fend_tubulinxyz`, no tubulin specifics).

## Next task

The whole 2026-06-25 feedback batch (file-viewer, Mol* look, UI/UX, interaction map v1) is DONE on
branch `inspector-file-viewer` — see `inspector-next-work.md` + `mol-viewer-style-pref.md` for detail.
Branch not yet merged to `main`. Remaining polish, when wanted:

- Extend the interaction map to the deferred categories: `struct_site`/`struct_site_gen` (binding-site
  residues), `pdbx_struct_assembly`(`_gen`) (assembly transforms), `struct_asym`, cell/symmetry (unit
  cell). Same `queryForLine` switch in `SourceInspector.tsx`.
- Optional: extend hover to the fold-rail group nodes (entity / secondary-structure groups), and
  reconsider whether atom-row CLICK should focus the residue rather than the single atom.

## Notes

- `~/dev/fend_tubulinxyz` is the user's tubulin viewer and the SOURCE of our Mol* patterns; it's
  pre-indexed in Deepwiki. Use Deepwiki for its molstar styling/representation specifics.
- Git: `main` is at `a60e4fe` (the inspector rework: `4fa1242` → `433dfce` → `a60e4fe`, on `cbf9fa4`
  init). The file-viewer refinement batch lives on branch `inspector-file-viewer` off `a60e4fe`,
  not yet merged. Start the next batch (Mol* look / UI / interaction map) off that branch.
