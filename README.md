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

## Status / roadmap

- [x] Part 0: dictionary -> structured JSON pipeline (607 categories, 6801 items, 625 edges)
- [x] Part A: graph explorer — radial ego view, click/hover/expand, description sidebar, search
- [ ] Part A polish: overview ("all categories") mode, group filters, usage-coverage enrichment
- [ ] Part B: CIF inspector — upload mmCIF/BinaryCIF, foldable category blocks, intellisense
      driven by `dictionary.json` (parse client-side with Mol*'s CIF reader)
