# Handoff — mmcif-browser

For the next session picking this up cold. Pair this with `ROADMAP.md` (status + intent) and
`README.md` (architecture + how to run). This file is the orientation + gotchas.

## What this is

A personal tool to replace the unusable `mmcif.wwpdb.org`. Two parts:
- A dictionary explorer (`/`) — a navigable graph of the PDBx/mmCIF dictionary.
- A CIF inspector (`/inspector`) — browse a real structure file; v0 exists but is being reworked.

Standalone repo at `~/dev/mmcif-browser`. It was started while another project (`~/dev/sampleworks`)
was the shell's working directory — that's why the cwd may be sampleworks. **Do not modify
sampleworks.** (Its `git status` legitimately shows pre-existing changes + `docs/`, `q_.md`,
`scratch/` that are NOT ours.)

## Run & verify

```bash
cd ~/dev/mmcif-browser/app && npm run dev     # http://localhost:3000
npx tsc --noEmit                              # typecheck (run from app/)
```
Regenerate dictionary artifacts (only if the pinned `.dic` changes):
```bash
cd ~/dev/mmcif-browser && pipeline/.venv/bin/python pipeline/build_artifacts.py
```

### Preview / browser-driving gotchas (important — cost me time)
- The Claude preview MCP roots at the session's PRIMARY dir (sampleworks), and a launch config's
  `cwd` must be inside that root. Workaround: write a TEMP `~/dev/sampleworks/.claude/launch.json`
  with `runtimeExecutable: "bash"`, `runtimeArgs: ["-lc","cd /Users/rtviii/dev/mmcif-browser/app && exec npm run dev"]`,
  `port: 3000`; `preview_start` it; then **delete that launch.json afterward** to keep sampleworks clean.
- After `preview_resize` to a custom size, screenshots can render scaled/off-center — a harness
  artifact, not a bug. Use the `desktop` preset or a fresh `location.reload()` for clean shots.
- React-controlled inputs: set value via the native setter + dispatch an `input` event, then in a
  SEPARATE step (after React re-renders) click — don't set-and-click in one eval (stale closure
  leaves the handler reading the old state).
- After a Next config change or a dependency version bump, RESTART the dev server (config/molstar
  changes aren't hot-reloaded). First `/inspector` compile is ~6s (Mol* is large + transpiled).

## Current state (done)

- Pipeline: `pipeline/build_artifacts.py` (py-mmcif `DictionaryApi`) → committed
  `app/public/data/{dictionary,graph}.json`. Pinned `mmcif_pdbx_v50.dic` v5.415. 607 cats / 6801
  items / 625 edges.
- Part A graph explorer (`/`): React Flow radial/ego view, sidebar, MiniSearch. Working.
- Mol* foundation: pure `MolstarViewer` wrapper + `queries.ts` + `spec.ts` + `useMolstarViewer`
  hook, adapted/generalised from `~/dev/fend_tubulinxyz`. Working.
- Inspector v0 (`/inspector`): STOPGAP (column-summary tree + intellisense + 3D). NOT the target.

## Stack & versions

Next 14.2.35, React 18, Tailwind 3, `@xyflow/react` ^12, `molstar` 5.10.1, zustand, minisearch,
`@dagrejs/dagre`. `next.config.mjs` has `transpilePackages: ["molstar"]`. Python pipeline: py3.11
venv at `pipeline/.venv`, `mmcif` 1.1.1. Node 18.

## Where things live (app/src)

- `lib/store.ts` — zustand store for the dictionary explorer (data load, adjacency, search, visible set).
- `lib/data.ts`, `lib/types.ts` — artifact loading + types.
- `lib/layout.ts` — radial/ego graph layout (dagre fallback also present).
- `components/GraphExplorer.tsx`, `CategoryNode.tsx`, `Sidebar.tsx`, `SearchBar.tsx`, `NavBar.tsx` — Part A.
- `lib/cif.ts` — Mol* CIF/BinaryCIF parse → category/field views (reusable for the rework).
- `lib/molstar/{viewer,spec,queries}.ts`, `hooks/useMolstarViewer.ts`, `components/MolstarViewer.tsx` — Mol* foundation.
- `components/CifInspector.tsx`, `app/inspector/page.tsx` — inspector v0 (to be reworked).

## Immediate next task — inspector rework

The user explicitly redirected this. Do NOT rebuild the v0 column-summary tree.

Target (Phase 1): a syntax-highlighted / "linted" view of the file's REAL content, collapsible by
SEMANTIC hierarchy — for `atom_site`, fold atoms under residues, residues under chains; other
categories fold at the loop/row level. Editor-like, virtualized for huge files. Keep v0's
dictionary hover-definition. Phase 2: per-row 3D linkage (hover a row → `executeQuery` →
`highlightLoci`/`focusLoci`; the Mol* foundation already supports this).

First decision to settle before coding (see ROADMAP "Open design questions"): almost certainly a
STRUCTURED RE-RENDER of the parsed rows styled to look like source — NOT CodeMirror-style folding
of raw text — because the chain>residue>atom nesting requires parsed grouping (the flat `atom_site`
loop has no nesting in the source). Also decide `auth_*` vs `label_*` hierarchy keys, and which
categories beyond `atom_site` get bespoke folds. Confirm the approach with the user first.

Reuse: `lib/cif.ts` parsing, the dictionary join in `CifInspector.tsx`/`Sidebar.tsx`, and the Mol*
`MolstarViewer` already wired in `components/MolstarViewer.tsx`.

## Notes

- `~/dev/fend_tubulinxyz` is the user's tubulin viewer and the SOURCE of our Mol* patterns
  (already mined; foundation adapted from its `core/MolstarViewer.ts`, `spec.tsx`, `core/queries.ts`).
  Its `MolstarInstance` (2200 lines) + Redux + tubulin presets/palettes were intentionally NOT ported.
- The repo is `git init`-ed but has NO commits yet (the user hasn't asked to commit). Consider
  committing a clean baseline at the start of next session if the user wants.
