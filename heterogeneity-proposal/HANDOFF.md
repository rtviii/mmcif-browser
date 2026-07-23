# Heterogeneity proposal — playbook / handoff

Branch `grouped_occupancy_proposal`. `npx tsc --noEmit` and `npx next build` are clean;
`check_examples.py` passes 64/64. Nothing is committed to git — working tree only, by the user's
standing instruction.

**Read "The two-pocket case was not a DAG" first — it changed the proposal, not just the page.**
The flagship "hard case" turned out to be tree-shaped: it was encoded with the wrong parent, and the
escape hatch was rescuing a problem the encoding had manufactured. The schema moved with it
(coefficients are gone), and the argument in Part V moved too. Then read "NEXT" for what is left.

---

## The two-pocket case was not a DAG

`constructed_two_pocket` was the page's hard case: two pockets whose occupancies are coupled, sold
as a directed acyclic graph that a single-parent tree cannot hold, rescued by a `linear`
`_pdbx_occupancy_constraint` row with coefficients `+1, -1, -1`. The user, reading the CIF after
being convinced by the diagram, asked where the DAG actually was. It was not there.

The file was isomorphic to `7HHS_apo_bound`, which the page presents two sections *earlier* as the
case the tree handles for free:

```
7HHS      pose_1 ligand_pose bound   0.13     0.13 + 0.09 = 0.22 = O(bound)
          pose_2 ligand_pose bound   0.09     <- parent is `bound`

two_pocket EDO2  bot_pocket  base    0.30     0.30 + 0.20 = 0.50 = O(EDO1)
           EDO3  bot_pocket  base    0.20     <- parent was `base`, not `EDO1`
```

Write `EDO1` where it wrote `base`, flip `incomplete` to `complete`, and the coupling follows from
the parent link. Verified with the real parser: flat gives **6** states including the forbidden
`Ligand + EDO2`; nested gives **3** (`check_states.mts`, below). `DagDiagram` had been drawing the
`EDO1 -> EDO2/EDO3` edges all along — the picture showed the tree that dissolves the problem, above
a file that declined to use it.

**This also took out `_extension-proposal.md`'s Delta A**, whose *only* motivating case (`:43`) is
"the two-pocket case, where a bottom-pocket occupant relates upward to both top-pocket occupants."
It does not. No case in this repo needs a second parent. The hierarchy stays a tree — now by
evidence, not by compromise. Part V says so, and says one deposited counterexample would overturn it.

Nothing in the `.dic` ever licensed the flat encoding: `parent_alt_groups_id` is defined purely as
"the parent network in the hierarchy", with no requirement that a parent be a chemical container.

**Note the verifier trap.** A previous audit raised a nearby claim ("DagDiagram's two parents are
EDO1 and Ligand") and *refuted* it on the grounds that the top pocket is `complete`, so
O(Ligand) + O(EDO1) = 1 licenses the edge. That reasoning is correct — and it is the same reasoning
that makes the whole DAG redundant. The verifier licensed the edge without noticing it dissolved the
case. Adversarial verification checked whether the diagram was *consistent*, not whether the section
had a reason to exist.

---

## The schema moved: Delta B adopted

`_pdbx_occupancy_constraint` + `_pdbx_occupancy_constraint_term` (coefficients, `target_value`, four
`type` values) are **gone**, replaced by `_pdbx_occupancy_relationship` + `_..._member` — typed ties
over network names, `sum_to | equal`, no arithmetic in the file. This is `_extension-proposal.md`
Delta B, which had been sitting in the source docs as the losing side of an unresolved vote; the
user resolved it. Deltas A/C/D are **not** adopted.

- `enforced` (`constraint | restraint | annotation`) carried over intact — it is the field that
  separates a number tied to a relation from one that merely satisfies it.
- **Drafting inconsistency resolved:** Delta B says `equal` has "(two) members" and no target; the
  occupancy memo (`:334`) uses one member + a `target`. Took the memo's shape, so `target` stays
  meaningful for both types. Flagged here because it is a schema decision made in passing.
- The audit's `coefficient` mandatory-vs-default defect evaporated with the item.
- Counts: het is now **+5 categories / +25 items** over base (was +27) — 612 cats / 6826 items.

---

## Status in one paragraph

The encoding works, and it is now **smaller than it was**: a tree, a completeness flag, a sparse NOT
list, and one typed tie for the single case the tree genuinely cannot reach. The parser
(`lib/molstar/het.ts`) and the `/proposal` page hold every real case tested — the correlated EF-hand,
the sub-residue split, the nested-occupancy arithmetic, the one real exclusion — on coordinates copied
verbatim from deposited entries, with `check_examples.py` asserting every geometric claim. The forked
dictionary defines everything the page and the example files use. What changed this session is that
the flagship "hard case" turned out not to be hard, which removed a DAG, a coefficient language, and
an open design vote from the proposal; the honest frontier is now the product wall alone. What keeps
it from "finished" is mostly not code: the schema has to be ratified against the per-atom prototype,
and the escape hatch's one example is constructed for want of a deposited pair. Six audit defects
remain in the tree (four are closed), and **no gate reads prose** — which is the standing hazard on
this page, since prose accuracy is its entire value.

---

## The previous session — the content/polish pass

The document was restructured from "notes by people who already had the argument" into something a
stranger can read top to bottom. The through-line is now: *what the PDB can encode today* (a plain
inventory) → *what those columns record and what they leave out* → *seven cases of increasing
difficulty where they run out* → *the proposal* → *each case worked* → *what is still open*.

**The dictionary was behind the page — this was the real find.** `mmcif_pdbx_v50_het_ext.dic`
declared 3 categories / 17 items, but the example files and the page use **5 categories / 27 items**.
Missing: `occupancy_completeness`, `occupancy_refine_flag`, `occupancy_value`, `state_kind` on the
hierarchy, and the whole of `_pdbx_occupancy_constraint` + `_pdbx_occupancy_constraint_term`. So the
tooltips would have been dead for exactly the columns the occupancy section is about. All 27 are now
defined, with types, mandatory codes, enumerations (with per-value details) and `_item_linked` parent
links, written from the authoritative spec in
`source_docs/_reconciliation_memo_occupancy.md:78-153` (+ the eval memo:162 for `state_kind`) — not
from inference. (Superseded in part: the two constraint categories were replaced by Delta B's
relationship pair, so the count is now 5 cats / 25 items — 612 cats / 6826 items in the het variant.)
**Verify with the snippet in "Verification notes" after any .dic change.**

What else landed:

- **Prose sweep.** Every phrase that only parses if you read the source docs is gone: "the diffuse
  folks" (→ "a prototype annotation of 5E1N", no attribution, by the user's decision), "the
  requirements", "the baseline before any heterogeneity machinery", "who pays", "every later example
  is a delta against this". Grep-verified clean across `app/src`, `app/public/examples`, and
  `scripts/`.
- **Sections deleted:** "Requirements, and the one hard constraint" (operational — its one objective
  fact, that `_atom_site` gains no column, is now a property stated in the Part III intro); "The
  existing prototype, and the column it adds" + its `PrototypeGln8` table (→ one `<Aside>` in the
  sub-residue section, keeping the 28-triples evidence); "One pattern, three layers" + `LayersDiagram`.
- **Part II is now one section.** "Where the letter stops" was never a separate idea — it is where the
  paragraph about the letter ends up. The `today` / "What mmCIF provides today" title duplication went
  with it.
- **New: the prologue inventory** (`MethodsInventory`) — every existing mechanism for encoding
  heterogeneity, each checked against `mmcif_pdbx_v50.dic` before being asserted. **New: the
  escalator** (`Escalator`) — seven cases, hardest last, each linking to the figure that shows it;
  the seventh is the product wall, so the list ends on the honest frontier.
- **Occupancy section moved** to the end of Part IV, tagged `experimental`, reordered problem-first
  (`OccupancySpec` shows the two files a reader cannot tell apart, *then* the columns that fix it).
- **The example prose left the CIF comments.** Headers are now provenance stubs (~2 lines); the
  explanation lives in each figure's new `brief` block. 148 comment lines removed, **zero coordinate
  lines touched** — that invariant is the gate, check it with the `git diff` snippet below.
- **`ThreeAnswers` labels genericised** to X/Y and P/Q — Ligand/EDO1 arrived ~700 lines before that
  nomenclature existed. The graph section now says "the two-site case from Part I, with its real
  names".

### Names that exist link out; names we propose do not

Every `<Cat>` / `<It>` whose category already exists in PDBx/mmCIF is an `<a>` to its definition on
the wwPDB dictionary browser (`https://mmcif.wwpdb.org/dictionaries/mmcif_pdbx_v50.dic/Categories/<cat>.html`,
`.../Items/_<cat>.<field>.html`); the five proposed categories are plain spans. **Whether a name is a
link is therefore the answer to "does this exist today, or are you asking for it?"** — which is the
page's central question, so the convention is load-bearing rather than decorative, and it is stated
in the `CategoryReference` footer.

`MmcifChip` gained an optional `href` (inline variant only) — the hover tooltip still fires, so the
link is an escape hatch, not the primary read. The Inspector is unaffected (it passes no `href`).

The split is driven by `PROPOSED_CATEGORIES` in `ProposalPage.tsx`. It is hand-maintained but
**gated**: `check_page.py` asserts it matches the fork's `_category.id` list exactly, and
cross-checks every linked name against the *base* dictionary artifact — so a category added to the
fork without being listed would fail rather than silently emit a 404. All 14 URLs the page currently
emits were confirmed 200.

### The three new interaction pieces (all in `components/proposal/`)

- **`FigureContext.tsx`** — `FigureApi` + `<Tok>`. A figure publishes the handlers its own chips use;
  a `<Tok net="bound">0.22</Tok>` / `<Tok res="A/6-7">` / `<Tok atom="A/8/H">` in its `brief` calls
  them. **An unresolvable Tok renders as inert code, never a dead link** — so the prose degrades
  safely if an example is recarved. Occupancies need no token kind of their own: an occupancy *is* its
  network.
- **Altloc chips** (`AltLocControls` in `StageFigure`) — derived from raw `_atom_site.label_alt_id`,
  so the unannotated files are interactive for the first time. Reuses `buildAltGroupExpression`; one
  selector per (chain, letter) over that letter's residue span, which is safe because the expression's
  atom-test filters by letter anyway. On the deposited `5E1N_ca_site` this **makes the section's
  argument by interaction** — click B, it lights up in both stretches; A and C exist in only one. The
  `note` prop is gone: a file with no alternates gets no strip.
  **An altloc chip shows an occupancy only when every row carrying that letter agrees on one** —
  on 5E1N they do not, and claiming a single number there would be a lie.
- **Dictionary tooltips** — `Cat` / `It` wrap `MmcifChip variant="inline"` (which gained an optional
  `className`, since this page's palette is slate, not the Inspector's teal/indigo). `useHetDictionary`
  loads the het variant on mount and **restores the previous variant on unmount**, so a reader coming
  from the Inspector finds their selector where they left it. Cold entry sets `variant` *before*
  `init()`, so init's own fetch gets the right one and still seeds the graph canvas that
  `CifInspector` / `GraphExplorer` expect (both call `init()` guarded on `loaded` — marking the store
  loaded without seeding would leave the graph blank). `ColumnList` reads each FK target from
  `Item.parents`, so it cannot drift from the `.dic`.

---

## NEXT — the audit fix list

Ten defects, confirmed. Method: four independent audits (feedback-coverage, code-correctness,
prose-accuracy, dictionary-correctness) produced 14 candidates; each was then attacked by three
skeptics with distinct lenses (does-it-reproduce / is-the-auditor-wrong / is-it-in-scope), refute-by-
default, majority required to survive. 10 survived, 4 were killed. **The 4 killed are listed at the
bottom — do not rediscover them.** Three of the ten were then re-verified by hand (marked ✓✓).

**Status: 4 of the 10 are closed. 6 remain, listed below.** Closed in the Part IV session:

- ~~"No distance cutoff reconstructs that"~~ — **DONE.** Deleted from both sites. The `_struct_conn`
  paragraph now makes the defensible point instead: the deposit *records* these bonds, and — the part
  that was never said — `_struct_conn` is **prior art for our key**, since it already points into
  `_atom_site` by (chain, seq, atom, altloc) via `pdbx_ptnr1_label_alt_id`. If the stronger claim is
  ever wanted it must lean on the cases a cutoff gets *wrong*: Glu67 OE2 at 2.836 Å and Asp131 OD2 at
  3.195 Å are deposited as `metalc` and a 2.7 Å cutoff misses both.
- ~~`residues 19–31`~~ — **DONE.** `A/20-31` on the page and in `ca_site()`'s header.
- ~~"the two-site case from Part I, with its real names"~~ — **DONE.** The sentence and its section
  are gone; see the two-pocket finding above.
- ~~`coefficient` mandatory-and-defaulted~~ — **VOID.** The item no longer exists (Delta B).

### 1. User-visible breakage

**The dictionary race — the whole tooltip layer can go dead.** `ProposalPage.tsx:134` +
`store.ts:197–201`. `setVariant` writes `variant` only *after* its await, so `variant` records the
last **completed** load, never intent — and its early-return guard
(`if (get().loaded && get().variant === variant) return`) reads it as if it were intent. Inspector →
/proposal → Inspector → /proposal, faster than the het fetch (which parses a ~3.5 MB JSON and runs a
full MiniSearch `addAll`, so the window is hundreds of ms), and you land on /proposal with the **base**
dictionary: every `<Cat name="pdbx_alt_groups">`, `pdbx_heterogeneity_hierarchy`,
`pdbx_state_coexistence`, `pdbx_occupancy_constraint` and their `<It>`s hover to nothing. `restoreTo`
is null by then, so the page cannot self-recover (the NavBar selector still can, manually).
**Fix in the store, not the page** — NavBar's selector calls `setVariant` too and is subject to the
same clobbering. Track a module-level `requested` variant plus a seq counter; guard on `requested`;
drop the write when `seq !== variantSeq`. Then compute `restoreTo` from the requested variant.

**`figureApi.ready` is true before the structure exists — early Tok clicks silently vanish.**
`StageFigure.tsx:523`. `ready: !!viewer` flips when `viewer.init()` resolves, but `focusResidue` /
`focusAtom` need `getCurrentStructure()`, which stays undefined until the *separate* `viewer.load()`
effect finishes. Glossary link → figure opens → click a `<Tok>` in the brief → nothing happens, with
no feedback. **Fix:** `pickAltLoc:369–386` already does this right; the asymmetry is unintentional.
Move the `if (!struct) return` guard *past* the source-panel snap in `focusResidue`/`focusAtom` so the
CIF still scrolls, and/or wire MolstarViewer's already-implemented-but-unused `onLoaded` into a
`loaded` state and make it `ready: !!viewer && loaded`.

### 2. Factual errors, on a page whose entire job is technical credibility

**~~✓✓ `ptnr1/2_label_alt_id` does not exist.~~ — DONE, but the audit's REASONING WAS WRONG. Read
this before trusting the ✓✓ marks.** The page now cites the `pdbx_`-prefixed form everywhere
(`ProposalPage.tsx:426-427`, `:589`), which was the audit's recommended fix. But its justification —
"the unprefixed spelling is real but belongs to a *different* category, `_pdbx_struct_conn_angle`" —
is false. **Both** spellings exist in `_struct_conn` (`mmcif_pdbx_v50.dic:48902` and `:68906`), and
the hand re-verification (✓✓) did not catch it.

The real distinction is better than the audit's, and is now the reason the page gives:

- `_struct_conn.ptnr1_label_alt_id` → "a pointer to **`_atom_sites_alt.id`**" — the dormant legacy
  category this proposal supersedes.
- `_struct_conn.pdbx_ptnr1_label_alt_id` → "a pointer to **`_atom_site.label_alt_id`**" — the modern
  key, and what the archive and our carved `5E1N_ca_site.cif` actually write.

So the `pdbx_` form is right because it points into `_atom_site` by the same key `_pdbx_alt_groups`
uses — which is the prior-art argument the `#networks` brief now makes. The audit's second claim
(that the `MethodsInventory` row repeats the error) was also wrong: that row names no column at all.

**Lesson: two of this list's ✓✓ hand-verified items were checkable against the base `.dic` in one
grep, and one of them was still wrong.** Verify against the dictionary, not against a memo.

**✓✓ `occupancy_value`'s range rejects 1.0.** `mmcif_pdbx_v50_het_ext.dic:307`. The single
`(max=1.0, min=0.0)` `_item_range` row is the **open** interval in DDL1; including an endpoint needs a
row where `max == min`. Verified against the base dictionary: **370 `_item_range` loops, zero of them
single-row** (291 are 2-row, 79 are the 3-row closed-interval form). Three of our own examples write
`1.0` — `5E1N_arg74_clash.cif:112`, `constructed_two_pocket.cif:96`, `7HHS_apo_bound_occ.cif:206` — and
the memo's headline "metal parent at 1.0" is rejected by our own dictionary.
**Fix:** the 3-row base-dict spelling, `1.0 1.0 / 1.0 0.0 / 0.0 0.0`. Note `build_artifacts.py`
**drops `_item_range` entirely**, so no downstream artifact would ever have caught this — the .dic is
the only place it is visible.

**`'base'` dangles both hierarchy foreign keys.** All annotated example files (`base` row + `base` as
a literal parent value). The dict declares `alt_group_id` *and* `parent_alt_groups_id` as pointers to
`_pdbx_alt_groups.alt_group_id` and states that roots use `'.'` — but the examples materialize `base`
as a real hierarchy row *and* as a literal parent value, and no `_pdbx_alt_groups` row ever defines
it. Any FK-resolving consumer drops every root. (`het.ts` does not: `parseHeterogeneity` treats
`"base"` and `"."` alike and skips the membership-less row. So this is invisible in our own viewer,
which is exactly why it needs fixing before anyone else reads a file.)
**Pick one:** drop the base row and write `'.'` on roots (matches the dict text as written), or add a
`base` row to `_pdbx_alt_groups` in each example, amend the description, and set
`occupancy_refine_flag 'fixed'` so its `occupancy_value 1.0` is licensed by its own description.

**~~✓✓ The 5E1N brief says "residues 19–31".~~ — DONE.** `A/20-31` in the Tok and the visible text,
and in `ca_site()`'s `write_cif` header where it was copied from.
**The blind spot it exposed is now closed in code.** The in-session token check reported "ALL TOKENS
RESOLVE" because it accepted a range if *any* residue in it existed, so `A/19-31` passed on the
strength of 20–31. `check_page.py` (see below) checks **both endpoints**, and re-caught this exact
defect on its first run — the page still had `A/19-31` even after the carver was fixed.

**~~"the two-site case from Part I, with its real names" — it is not.~~ — DONE, by deletion.** The
sentence and the section that held it are gone; the file it described is now the `#nesting` worked
negative. `ThreeAnswers` in Part I keeps its generic X/Y · P/Q labels and no longer claims any file
matches them.

### 3. Polish

**"several residues apart"** — `ProposalPage.tsx:1025`. The two 5E1N stretches (20–24, 25–31) are
**peptide-bonded**; `check_examples.py`'s own clash report names ASP24.O–GLY25.N at 2.21 Å. The point
being made (different letter sets, nothing to match on) survives intact; only the geometry claim is
wrong. **Fix:** "two stretches of one chain that move together and are refined as separate occupancy
groups".

**~~`coefficient` is mandatory *and* has a default of 1.0~~ — VOID.** The item was deleted with the
constraint categories (Delta B). Nothing to fix.

### Killed by the verifiers — and one of them should not have been

Each was raised by an audit and refuted. Recorded so the next session does not spend the tokens
again — **except #3, which the Part IV session overturned.**

1. *"Item 18 (the `_atom_site`-column rationale) was asked to shrink to a footnote but ships as a
   two-paragraph collapsible."* — Refuted: the user's ask was to delete the **section and table**; the
   `<Aside>` is what they asked for. Still stands.
2. *"'no fixed a, b, c works' is false for the given numbers."* — Refuted: pre-existing at HEAD,
   unchanged, and true under the intended quantifier. Still stands.
3. *"DagDiagram's two parents are EDO1 and Ligand; the prose says EDO1 and base."* — **The refutation
   was correct and the conclusion was wrong.** The verifier argued the top pocket is `complete`, so
   O(Ligand) + O(EDO1) = 1 licenses the edge — which is true, and is *precisely* the fact that makes
   the second parent redundant and the whole DAG section false (see the top of this file). The
   verifier checked whether the diagram was internally consistent, never whether the section had a
   reason to exist. `DagDiagram` is now deleted.
4. *"'effectively unused in the archive' for `_atom_sites_alt` is unsourced."* — Refuted: pre-existing
   at HEAD, and supported in `_reconciliation-memo.md:51-57` and `proposal_v1.md:106-109`. Still
   stands.

### Then, still not code

- **Two constructed figures now, not one.** `constructed_two_pocket` (+ `_flat`) is the worked
  negative and is fine as built — it illustrates an encoding choice, so real coordinates buy it
  little. `constructed_ncs_lock` is the one worth replacing: **a deposited entry with two NCS-related
  copies of a partial-occupancy ligand at identical occupancy** would make the escape-hatch case rest
  on real data. Note it can never be *fully* real — the tie itself is what deposition discards — but
  the coordinates and the matching occupancies can be. The user opted to construct it rather than
  hunt; if they name an entry, `carve_examples.py:ncs_lock()` is where it swaps in.
- `--doc-w` is 1120px (`globals.css`). Widened on request; at 13.5px that is ~110 characters a line,
  wide by typographic convention. One value, if it wants retuning.

---

## What the real data taught us

This is the part worth carrying forward. Using the team's annotated file and real deposited entries
changed the proposal, and surfaced its one genuine gap.

**The team's annotated 5E1N (`source_docs/5E1N_hierarchy_20250423.cif`) is the sharpest input.** Read
straight out of it, not from the memos:

- It takes the **per-atom route the proposal rejects** — a 22nd `_atom_site` column,
  `pdbx_heterogeneity_id`, one token per atom — and carries **no membership table**. This is the central
  schema conflict. NOTE: as of this session the page argues it in one <Aside> under
  `#subresidue`, not a section of its own — the user cut the standalone treatment as redundant.
- Its network *names* (`A8A`, `A6A_to_A7A`) already **are** the membership key — chain, residue/range,
  alt — encoded as opaque strings nothing can parse. The per-atom column exists only to do the join a
  parseable key would already have done. That is the proposal's argument, and it is made *by their own
  file*.
- **Gln8 validated the sub-residue claim on real data.** Amide H at `label_alt_id` = A →
  `pdbx_heterogeneity_id` = A → network `A6A_to_A7A` (occ 0.64); side chain at the *same* letter A → D →
  `A8A` (occ 0.56). Same residue, same letter, two networks — exactly the `label_atom_id` case. The
  "28 (chain, residue, altloc) triples" figure was recomputed from their file and confirmed.
- **One** `NOT` exclusion in the entire file (Arg74) — which is the evidence for keeping that category
  optional and sparse.
- The two coupled segments use **different letter sets** ({B,D} vs {A,B,C,D}) — the overloaded-letter
  problem, in real coordinates.

**The real PDBs (1EJG / 5E1N / 7HHS):**

- **7HHS is the strongest single validation:** the nesting arithmetic `0.13 + 0.09 = 0.22 = occ(bound)`
  holds in the *deposited* numbers, not a contrived set.
- **The old synthetic files were not just ugly, they were false** — two residues claimed hydrogen-bonded
  were 17.9 Å apart; a ligand sat 1.3 Å *inside* the residue it was meant to open; metal distances were
  1.6–1.8 Å against a real 2.1–2.6 Å. Real coordinates forced correctness, and `check_examples.py` now
  re-measures and asserts every geometric sentence the page utters. Run it after any example change.
- **Real data surfaced two parser bugs** in `lib/molstar/het.ts` that synthetic data hid: (1) the state
  enumerator forced every group to pick exactly one member, so the partial-occupancy water in
  `5E1N_arg74_clash` (0.54) left `arg74_B` in *no* legal state — a group summing to less than its parent
  is now "incomplete" and "none" is legal; (2) state probabilities now charge a state for the groups it
  leaves empty, so "ligand, bottom pocket empty" is 0.25, not 0.50. Both derived from occupancies alone.

**The gap the real data exposed, and could not fill** — *rewritten after the Part IV session; the
original entry drew the wrong conclusion from the right observation.* It said: the DAG / cross-pocket
linear-coupling case has no deposited counterpart, it is constructed here and in the source deck, and
finding a real coupled-occupancy pair would remove the last synthetic example.

The observation was correct and the inference was backwards. **The case had no deposited counterpart
because it is not a case.** It is a nesting written with the wrong parent (see the top of this file);
nobody found a real one because a real one would just be another 7HHS. The absence was evidence about
the encoding, and it was read as a gap in the archive.

What survives: the escape hatch's real case is the **cross-branch lock**, and *that* has no deposited
counterpart for a structural reason rather than a lucky one — the tie is precisely what deposition
discards, so no deposited file can ever carry it. A real entry can supply the coordinates and the
matching occupancies; the tie itself will always be `enforced = annotation` until a program fits it.

**Generalisable lesson: when a constructed example resists being made real, ask whether the case is
real before hunting harder for data.**

---

## Where it still needs people (not code)

1. **Schema ratification.** The proposal (membership table, `_atom_site` untouched) versus the
   prototype (per-atom column). The `#subresidue` aside makes the case; the mmCIF WG has to accept
   it. A meeting, not a commit.
2. ~~**How to spell the graph.**~~ **RESOLVED, and the question dissolved rather than being decided.**
   The tie spelling is settled: typed `sum_to` / `equal` over network names, no coefficients (Delta B).
   And the *graph* half of the question went away with the two-pocket case — the structure it was
   supposed to justify was a tree all along, so there is no edges table to vote on. What survives is a
   claim, not a vote: **no case in this repo needs a second parent.** One deposited counterexample
   reopens it, which is a data question for the working group rather than a design one.
3. **Three annotated CIFs are missing from the repo.** Justin posted `3NYD_hierarchy.cif`,
   `3K0N_hierarchy.cif`, `6DMH_hierarchy.cif` to the encoding channel. **3NYD is the one to chase** — it
   has a chain-B translation, a large-scale correlated motion, a case *class* nothing on the page shows
   (every current example is local). 3K0N reportedly needed no coexistence table at all. Ask for them.
   **They are now also the best shot at falsifying the tree claim in item 2** — if any of them carries a
   genuine second parent, Delta A comes back.
3b. **A deposited NCS-locked pair** — two NCS-related copies of a partial-occupancy ligand at identical
   occupancy — would put `#locks` on real coordinates. See "Then, still not code" above.
4. **`name` vs `id`** — whether a human-readable network name must match across loops (open in the
   Slack). Small, but a schema decision.
5. **The product wall** — genuine multiplicative independence. Out of reach of this proposal and every
   other; acknowledged under `#open` rather than solved. Not a task, a stated frontier.

Do we have "a completely working system"? For everything except the product wall: yes, the encoding is
complete and validated on real data — and it is one category and one design vote lighter than it was,
because the case that motivated both turned out to be a tree. The single remaining frontier is
unsolved by everyone, not a defect to fix.

---

## Reference

### The example files

`app/public/examples/het/*.cif`, carved by `scripts/carve_examples.py`; coordinates verbatim from the
archive, annotation added. `check_examples.py` asserts every geometric claim — run it after any change.

| file | entry | what it carries |
|---|---|---|
| `1EJG_minimal` / `1EJG_rotamer` | 1EJG | the baseline; an isolated rotamer (Arg10, 0.67/0.33) |
| `5E1N_ca_site` | 5E1N | the Ca-203 EF-hand: two correlated segments, different letter sets ({B,D} vs {A,B,C,D}), each summing to 1.00, both coordinating the ion. Definitions clipped from the prototype annotation. Carries the deposited altloc-specific `metalc` bonds. Used unannotated (`#today`) and annotated (`#networks`). |
| `5E1N_gln8_split` | 5E1N | Gln8: amide H in the 6–7 network, side chain in its own — same residue, same letter A, two networks. The real `label_atom_id` case (28 such triples in the full file). |
| `7HHS_apo_bound` / `_occ` | 7HHS | apo 0.78 / bound 0.22, poses 0.13 and 0.09. `0.13 + 0.09 = 0.22 = occ(bound)` in deposited numbers. `_occ` adds the occupancy-spec columns. |
| `5E1N_arg74_clash` | 5E1N | the one real `NOT`: Arg74 alt B at 2.14 Å from water 468; alts C/D clear at 3.97/4.80 Å. Alternate-specific, uninferable from the tree. |
| `constructed_two_pocket_flat` / `constructed_two_pocket` | **constructed** | the `#nesting` worked negative: the same 40 atoms twice, differing in one column. `_flat` parents both pockets to `base` → 6 states, 3 of them false; the plain file parents the bottom pocket to `EDO1` → 3 states, no escape hatch. Was the "DAG" case; see the top of this file. |
| `constructed_ncs_lock` | **constructed** | the cross-branch lock: two 1EJG copies related by a proper NCS operator, one partial glycol each at 0.40, tied by one `_pdbx_occupancy_relationship` `equal` row. The only case on the page no parent link can carry. |

### Layout mechanics already in place (don't relearn these)

- **`.doc-grid` / `.bleed`** in `globals.css` is the full-bleed system: prose in a centred content
  column, a `.bleed` child spans full width, everything resolving against the grid's own width (not the
  viewport — that is what lets the contents rail sit beside it without pushing figures off-centre). **A
  figure must be a direct child of a `.doc-grid`**; a wrapper traps it in the content column. This is why
  `Section` sets body type on itself and does not wrap its children.
- **Figures collapse by default and mount Mol\* only on expand.** `useMolstarViewer` builds the plugin
  from a mount effect, so an unrendered viewer is genuinely absent — verified zero `<canvas>` on load.
  The CIF fetch is cached across collapse. Keep both properties.
- The contents rail is **outside** the scroll container (no sticky needed); below `xl` a horizontal
  strip replaces it. The glossary is a `<details>` in the rail.

### After any change to the .dic or the example files

```bash
# 1. the dictionary defines everything the examples use — this is what was broken before
cd /Users/rtviii/dev/mmcif-browser && python3 -c "
import json, subprocess
het = json.load(open('app/public/data/dictionary.het.json'))
used = subprocess.run(['bash','-c','grep -h \"^_pdbx\" app/public/examples/het/*.cif | sed \"s/ .*//\" | sort -u'],
                      capture_output=True, text=True).stdout.split()
print('unresolved:', [u for u in used if u not in het['items']] or 'NONE')"

# 2. rebuild artifacts after editing pipeline/data/*.dic (het must stay a superset of base)
cd pipeline && ./.venv/bin/python build_artifacts.py   # expect het = base + 5 cats / +25 items
                                                       # (612 cats / 6826 items vs 607 / 6801)
                                                       # NOTE: needs pipeline/.venv — mmcif is not
                                                       # on the system python

# 3. the geometry gate
cd heterogeneity-proposal/scripts && python3 check_examples.py    # expect 64/64

# 4. the page's own cross-references — Tok / Cat / It / Ref all resolve.
#    tsc and next build do NOT read prose; this is the gate that does. Both range ENDPOINTS are
#    checked (see the 19-31 story above). Also asserts PROPOSED_CATEGORIES matches the fork and
#    that no chip would link to a wwPDB page that does not exist.
cd heterogeneity-proposal/scripts && python3 check_page.py

# 5. what the parser actually enumerates, for the claims the prose makes about state lists
cd app && cp ../heterogeneity-proposal/scripts/check_states.mts ./__states.mts \
  && npx --yes tsx ./__states.mts ; rm -f ./__states.mts

# 6. THE invariant: recarving must never move a coordinate in a file that already existed
git diff -U0 app/public/examples/het/ | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' \
  | grep -E 'ATOM|HETATM'                            # expect NO output
```

### Verification notes

- Section numbers are gone — sections are named anchors now (`#today`, `#networks`, `#subresidue`,
  `#nesting`, `#exclusions`, `#locks`, `#occupancy`, `#open`). Older notes that say "§04" mean
  `#today`, "§08" was the prototype section (now the `<Aside>` under `#subresidue`), and **`#graph`
  is now `#locks`** — the section stopped being about a graph.
- **`check_states.mts` is the tool that would have caught the two-pocket error.** It runs the real
  `parseHeterogeneity` over the example files and prints the enumerated states. Reading the flat file
  give 6 states — 3 of them physically impossible — next to 7HHS giving 3 is what makes the encoding
  error undeniable rather than arguable. Any new claim about "the state list shows…" should be checked
  against it.
- **None of this has been driven in a browser** — the user's standing instruction is to make the
  change, typecheck, and let them look. Of the gates now in place, tsc/build check types, 64/64 checks
  geometry, `check_page.py` checks cross-references, and `check_states.mts` checks enumerated states.
  **Nothing checks whether an English sentence is true**, which is how all ten audit defects shipped
  green — and how the two-pocket error survived a four-dimension audit with adversarial verification.
- **Still unwatched: the chip → source-line snap.** It did not fire in the preview because that pane
  runs `document.visibilityState === "hidden"` and `requestAnimationFrame` is suspended there, and
  `snapTo` defers through rAF. The scroll arithmetic was replayed by hand and is correct (scrollTop 5239
  for `seg2_C`, target row 40px under the sticky header). One chip click in a normal tab confirms it.
- **The audit is replayable.** Script:
  `~/.claude/projects/-Users-rtviii-dev-mmcif-browser/*/workflows/scripts/audit-proposal-rewrite-*.js`
  — four audit dimensions + 3-skeptic adversarial verification. Re-run it after the fix list to check
  nothing regressed, or extend the dimensions if a new class of claim gets added to the page.
