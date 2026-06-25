# mmcif-browser

A navigable explorer for the PDBx/mmCIF dictionary, plus (planned) an inspector for
real mmCIF/BinaryCIF structure files. Built because `mmcif.wwpdb.org` is unusable.

The wwPDB resource site is generated from a single self-describing DDL2 dictionary file,
so there is nothing to scrape: we parse that one file into structured JSON and build the UI
on top of it.

## Architecture

One TypeScript app at runtime; Python only as an offline build step. No server, no database.

```
pipeline/   Python, build-time only
  data/mmcif_pdbx_v50.dic   pinned, committed copy of the dictionary (v5.415)
  build_artifacts.py        py-mmcif DictionaryApi -> app/public/data/{dictionary,graph}.json
app/        Next.js (React + TypeScript) — the whole runtime
  public/data/dictionary.json   categories, items, types, groups (the "database", ~3.4 MB)
  public/data/graph.json        category nodes + relational (foreign-key) edges (~270 KB)
  src/lib/      types, data loader, zustand store, radial graph layout
  src/components/  GraphExplorer (React Flow), Sidebar, SearchBar, CategoryNode
```

Why these choices:

- The dictionary changes a few times a year, so parsing is a build step, not a service. The
  artifacts are committed and reproducible; we never trust the live site at runtime.
- `dictionary.json` is small enough to load client-side and search in-browser (MiniSearch), so
  no backend and no DB are needed.
- The relational graph is hub-and-spoke (categories cluster around key items like `entity.id`),
  so the explorer uses a radial / ego layout centered on the focused category.

## Regenerate the data artifacts

Only needed when the pinned dictionary changes.

```bash
cd pipeline
python3.11 -m venv .venv
.venv/bin/python -m pip install mmcif
.venv/bin/python build_artifacts.py   # writes app/public/data/{dictionary,graph}.json
```

To bump the dictionary version, replace `pipeline/data/mmcif_pdbx_v50.dic` (download from
`https://mmcif.wwpdb.org/dictionaries/ascii/mmcif_pdbx_v50.dic`) and re-run. The build records
the source URL, sha256 and dictionary version into the artifacts' `meta` block and fails loudly
if category/item counts look wrong.

The parser is DDL2-generic, so other dictionaries (em, ihm, ma, ddl, ...) can be added later by
pointing it at a different `.dic`.

## Run the app

```bash
cd app
npm install
npm run dev      # http://localhost:3000
```

## Pages

- `/` — Dictionary: graph explorer + sidebar + search.
- `/inspector` — CIF inspector (v0 stopgap, being reworked — see `ROADMAP.md`).

The inspector currently parses the uploaded/fetched file with Mol*'s CIF reader (`src/lib/cif.ts`),
renders a tree of categories whose rows are each category's columns with one sample value +
dictionary intellisense, and shows the file in an embedded Mol* 3D viewer. The intended design is
different: a folded, "linted" view of the file's actual content (collapse atoms under a residue,
residues under a chain, …), with later per-row 3D linkage. See `ROADMAP.md`. Fetch-by-PDB-ID pulls
from `files.rcsb.org`.

### Mol* integration (`src/lib/molstar/`, `src/hooks/useMolstarViewer.ts`)

The 3D side uses Mol* 5.x via a small, generic foundation adapted from the patterns in
`~/dev/fend_tubulinxyz` (generalised — no tubulin presets/palettes):

- `lib/molstar/viewer.ts` — `MolstarViewer`, a pure wrapper class (no React/state) owning the
  plugin lifecycle and low-level ops: `load`/`loadFromUrl`, `highlightLoci`/`focusLoci`,
  `subscribeToHover`/`subscribeToClick` (→ `{chainId, authSeqId, compId}`), selection,
  `projectToScreen`, `resetCamera`, `dispose`.
- `lib/molstar/spec.ts` — default plugin spec with the surrounding UI chrome hidden.
- `lib/molstar/queries.ts` — MolScript query builders (chain / residue / entity / surroundings) +
  `executeQuery` → loci; the bridge from "an id" to "something to highlight".
- `hooks/useMolstarViewer.ts` — binds a `MolstarViewer` to a container ref with StrictMode-safe
  deferred disposal.
- `components/MolstarViewer.tsx` — thin React boundary; lazy-loaded (`ssr:false`).

This foundation exposes the highlight/focus/hover/click primitives that interactive features
(tree↔3D selection sync, a chains/entities panel, custom coloring) build on.

## Status / roadmap

See `ROADMAP.md` for the full record of what's done and what's next. In short: the data pipeline,
the dictionary graph explorer (`/`), and the generic Mol* foundation are done; the inspector
(`/inspector`) is a v0 stopgap being reworked into a folded, linted source view of the file's
content with later 3D linkage.
