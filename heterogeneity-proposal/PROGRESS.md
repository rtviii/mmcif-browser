# Heterogeneity encoding — progress report

> **Superseded — dated snapshot (2026-07-09).** File lists and the ten-part structure below are stale:
> the synthetic `case_*.cif` / `stage_minimal.cif` files are gone, replaced by PDB-anchored carved
> examples, and the page is now fourteen sections. The living playbook is `HANDOFF.md`. Kept only as a
> record of the 2026-07-09 state.

*Status as of 2026-07-09. Branch `grouped_occupancy_proposal`. Everything below is committed to the
working tree but not yet to git (see "Working-tree state").*

## Where this stands

The written proposal has been consolidated into one document, and an interactive explainer of it now
lives in the mmCIF Browser. Both are complete and internally consistent; the last conceptual stage is
deliberately left open because it is the thing to design next, not a gap to paper over. Nothing is
committed to git yet, and the browser page has been typecheck-verified but not yet eyeballed in a
running app.

## What was produced

**The synthesis.** `proposal_v1.md` is a single, self-contained reading of the whole effort
(~5,100 words): the missing fact (marginals vs joint), the three constituencies and the one sacred
table, what mmCIF already has, the proposed categories, the one-pattern/three-layers structure, the
graded cases A–D, portable occupancy plus the three adoption tiers, the EDO/DAG hard case, the
DAG-native evolution, and a dedicated "unresolved tail." It supersedes none of the sources; it folds
them together.

**The sources**, all moved into `source_docs/`: the primer, the public explainer (`index.qmd`), the
reconciliation memo and its two companions (eval, occupancy), the standalone extension proposal, the
encoding-channel history (`encoding_chat.md`), the May-2026 working-group deck (the PDF), and the
5E1N demo CIF. These are the primary material `proposal_v1.md` draws on.

**The interactive explainer** at route `/proposal` in the app. A blog-style, ten-part build-up, each
part pairing prose with the exact mmCIF block on the left and a live 3D viewer on the right:

1. the minimal file (the spine) · 2. altlocs and occupancy · 3. where it breaks (same file, proposed
categories hidden) · 4. naming the networks · 5. the `label_atom_id` atom-level split · 6. nesting ·
7. the metal frontier plus the optional `NOT` list · 8. portable occupancy plus the tier table ·
9. the EDO two-pocket DAG plus `_pdbx_occupancy_constraint` · 10. the open frontier (diagrams only —
the product wall and the graph-spelling choice).

## The app implementation

Files, all new except the NavBar route:

- `app/src/app/proposal/page.tsx` — thin server wrapper.
- `app/src/components/proposal/ProposalPage.tsx` — the page: prose, the ten `StageFigure`s, the tier
  table, and three explanatory diagrams (marginals contingency-matrix, tree-vs-DAG, sum-vs-product).
- `app/src/components/proposal/StageFigure.tsx` — one stage: fetches the CIF, parses it, mounts the
  viewer (right) and the source panel (left), and owns the row → 3D resolver.
- `app/src/components/proposal/CifPanel.tsx` — a distilled, interactive source pane: syntax
  highlight, a settings gear (Table / Hide comments / Wrap), aligned table mode, and hover/click
  callbacks per loop row.
- `app/src/components/NavBar.tsx` — added `{ href: "/proposal", label: "Proposal" }`.

Three new demo CIFs under `app/public/examples/het/`:

- `stage_minimal.cif` — the Gly-Ala-Ser spine (Part 1).
- `case_c_nesting_occ.cif` — Case C annotated with the occupancy columns
  (`occupancy_completeness` / `occupancy_refine_flag` / `occupancy_value` / `state_kind`) (Part 8).
- `case_edo_dag.cif` — the two-pocket EDO site; the flat tree reads as independent (2×2 states) and
  the cross-pocket coupling rides in a `linear` `_pdbx_occupancy_constraint` (Part 9).

Parts 2–7 reuse the pre-existing demo files (`case_a_rotamer`, `case_b_network`, `case_b_plus_atom`,
`case_c_nesting`, `case_d_metal`).

Two implementation facts worth carrying forward. First, the heterogeneity parser
(`lib/molstar/het.ts`) reads `pdbx_alt_groups` / `pdbx_heterogeneity_hierarchy` /
`pdbx_state_coexistence` by field name and ignores unknown columns and categories — so the occupancy
columns (Part 8) and the whole `_pdbx_occupancy_constraint` category (Part 9) are carried in the CIF
and shown in the codeblock while the viewer keeps drawing the networks; this is the honest picture,
since that spec is exactly the tier-3 material no program consumes yet. Second, the source panel's
3D linkage resolves a clicked/hovered loop row through `buildLineToRowFull`: a het row maps to its
network (`highlightNetwork` / `focusNetwork`), an `atom_site` row maps to its residue
(`buildResidueQuery` → `executeQuery` → `highlightLoci` / `focusLoci`).

## Verification status

`npx tsc --noEmit` is clean. The three new CIFs pass a loop-column-count structural check. Per the
project workflow the page has not been driven in a browser; that check is the main outstanding
verification. When it happens, the things most worth watching:

- Part 9 (EDO) has the most novel geometry — four small molecules in two clusters plus a grey
  scaffold, built from alternate residues with different `comp_id`s at the same `auth_seq`. If
  anything renders oddly, it is here.
- The row → 3D linkage on Parts 4–9: hovering a `_pdbx_alt_groups` / hierarchy row should light up
  the matching network; clicking should fly to it. On Parts 1–2, hovering an `_atom_site` row
  highlights its residue.
- The settings gear's Table mode (aligned columns) across a few stages.

## The unresolved tail (what to design next)

From `proposal_v1.md`, in rough order of how fundamental:

- **The product wall.** Every relationship either spelling can hold is linear; genuine independence
  is multiplicative and sits outside all of them. This is the real frontier, shared by every proposal
  on the table, and Part 10 states it as one wall wearing three faces (the deck's "existence of single
  species," the eval's enumeration item, the Phenix "false redundancy" complaint).
- **How to spell the graph** — the open design choice. Either keep the single-parent tree and restore
  the dropped edge with a `linear` `_pdbx_occupancy_constraint` (what the page and demo files do), or
  make the hierarchy a graph with a `_pdbx_heterogeneity_edge` table and typed `sum_to` / `equal`
  ties (the extension proposal's recommendation). Both hold the EDO case; neither reaches past it.
- **Tier-3 has no consumer yet** — recorded, portable, but fit by no mainstream program.
- **The ragged-ensemble substrate** — dangling alternates drift; the flags make intent legible but
  provide no restraint substrate.
- **Higher-arity exclusivity** — pairwise `NOT` cannot say "any pair but never all three."
- **`name` vs `id`** — whether a human-readable name must match across loops (from the Slack).

Smaller app to-dos already noted in `../todo.md`: highlight rotamers inside networks; handle strand
breaks (e.g. in the B+ case); remove a stray "open" affordance on an already-initiated page.

## Working-tree state

Branch `grouped_occupancy_proposal`, nothing committed. New/changed:

- moved: the six tracked source docs → `source_docs/` (git-tracked renames); the three untracked
  sources (5E1N CIF, the PDF, `encoding_chat.md`) moved into `source_docs/` as well.
- new: `proposal_v1.md`, `PROGRESS.md`, `HANDOFF.md`; the `app/src/app/proposal/` and
  `app/src/components/proposal/` trees; the three new `app/public/examples/het/*.cif`.
- modified: `app/src/components/NavBar.tsx`; `../todo.md`.

A sensible next step is to commit this on the branch (it is currently one large uncommitted change).
