# Encoding structural heterogeneity in mmCIF — proposal v1

*A single, consolidated reading of the heterogeneity-encoding work. It synthesizes the
conceptual primer, the public explainer (`index.qmd`), the reconciliation memo and its two
companions (the eval and the occupancy memo), the standalone extension proposal, the May-2026
mmCIF working-group deck (Paul Adams), and the encoding Slack thread. All of those now live in
`source_docs/`; this document supersedes none of them, it folds them into one narrative and marks,
at the end, exactly what is still open. It is meant to be read top to bottom by someone who has not
followed the thread.*

---

## 1. The problem, in one fact

A macromolecular crystal is not one molecule. It is on the order of 10^13 copies packed in a
lattice, and the copies are not identical: a side chain points one way here and another there, a
ligand fills a pocket in some copies and is absent in others, a loop is ordered in some and mobile
in others. Diffraction measures the whole ensemble at once, so the electron density is an **average**
over all the copies. A deposited model therefore describes a distribution over shapes, not a single
conformation.

mmCIF encodes that distribution with two per-atom quantities in `_atom_site`: an **alternate-location
letter** (`label_alt_id` = `A`, `B`, …) marking which alternate an atom belongs to, and an
**occupancy** — the fraction of copies in which that alternate is present. This carries the
*marginals* of the distribution: for each item, how often it appears. It does not carry the *joint*:
**what appears together.**

That gap is the entire problem, and it is a single idea. Take two adjacent pockets — a top pocket
holding either a ligand or an ethylene glycol (`EDO1`), a bottom pocket holding either `EDO2` or
`EDO3`. The density and occupancies give per-item fractions (`Ligand 50 / EDO1 50 / EDO2 50 /
EDO3 50`). Three physically different crystals produce byte-for-byte identical files:

```
   (A) INDEPENDENT           (B) CORRELATED            (C) CORRELATED (other way)
   Ligand+EDO2 : 25%          Ligand+EDO2 : 50%          Ligand+EDO3 : 50%
   Ligand+EDO3 : 25%          Ligand+EDO3 :  0%          Ligand+EDO2 :  0%
   EDO1  +EDO2 : 25%          EDO1  +EDO3 : 50%          EDO1  +EDO2 : 50%
   EDO1  +EDO3 : 25%          (others      0%)           (others      0%)
   ───────────────           ───────────────           ───────────────
   marginals:  Ligand 50 / EDO1 50 / EDO2 50 / EDO3 50   ← IDENTICAL in all three
```

The three are different statements about what the molecule does; the file cannot tell them apart.
Everything a heterogeneity extension must add is some slice of that joint distribution.

The altloc letter is not enough to recover it. The dictionary guarantees only something *local*: the
letter marks that an atom has alternates and bounds the scope of one alternate — the enforced meaning
is a clash rule, *A goes with A and with blank, never with B*, over a small region. It says nothing
about whether `A` at residue 30 and `A` at residue 200 are the same physical state or a coincidence
of labelling. The long-range correlations between separated heterogeneous sites are exactly what the
convention cannot carry, and exactly what an extension exists to add.

The working group states the goal in two halves (Adams deck): **convey** heterogeneity to consumers
of mmCIF files, and let software **compute** on heterogeneous models — and the definition a program
computes against "needs to be unambiguous, with a common understanding across software systems."

## 2. Why it is contested: three constituencies, one sacred table

A solution is a negotiation, not a formality, because three classes of software read the same file
and need different things.

- **Refinement programs** (Refmac, Phenix, SHELXL, BUSTER) re-fit the model against the data. For
  them a heterogeneity description dictates which parameters are coupled — whether two occupancies
  must sum to one, whether a child group's occupancy is tied to a parent's. They need intent that is
  unambiguous and machine-actionable. Today they implement only the simplest coupling (alternates
  within one group sum to one); anything richer is ahead of what they consume.
- **Consumers, libraries, viewers** (gemmi, PyMOL, Coot, Chimera, data-mining pipelines) read and
  display but do not re-fit. They are more tolerant — a viewer can ignore a relationship it does not
  understand and still draw atoms — and their one hard requirement is **non-invasiveness**: a naive
  reader must still get a valid structure.
- **Standards and archive** (wwPDB, the PDBx/mmCIF dictionary maintainers) own long-term coherence.
  They require unambiguous semantics, automatic validatability, and backward compatibility, and are
  wary of additions that admit several readings or cannot be checked.

These pull apart along three seams: expressiveness vs non-invasiveness (the most direct encoding is a
new per-atom column in `atom_site`, which the library side rejects); precision vs simplicity
(refinement wants the occupancy relationships spelled out, standards want the smallest unambiguous
vocabulary and pressed to drop `AND`/`OR`); and recording vs fitting (a relationship can be deposited
long before any program fits it).

From this follows the **one governing principle** the whole design turns on: `_atom_site` is the sole
sacred table. Adding a mandatory per-atom column there forces every reader and every refinement
program to change how it parses coordinates — the objection the library constituency will not move
on. Everything else — extra categories, extra rows, an extra join to resolve — is cheap by comparison
and does not break a naive reader. Two consequences: there is no reason to project a richer relational
structure down to a tree just to save space (if the intended topology is a graph, encode a graph),
and no reason to compress occupancy semantics into a terse flag when a fuller explicit table reads
more clearly and validates more easily.

## 3. What is already in mmCIF

The extension changes none of this; it points into it.

- **`_atom_site`** — one row per atom per alternate position. The columns that matter here:
  `label_atom_id` (atom name, e.g. `OD1`), `label_comp_id` (residue/component, `ASP`),
  `label_asym_id`/`auth_asym_id` (chain, internal vs author), `label_seq_id`/`auth_seq_id` (residue
  number, internal vs author), `label_alt_id` (the alternate letter), and `occupancy`.
- **`_atom_site.label_alt_id`** — the hinge. Local guarantee only, as above.
- **`_atom_site.occupancy`** — presence fraction; by convention the alternates of one atom sum to 1,
  beyond that a per-event marginal.
- **`_struct_conn`** — the sparse bond/contact table (disulfides, covalent links, hydrogen bonds, and
  metal coordination via `conn_type_id = metalc`). Partners are named by full atom key including
  altloc, so a bond can be alternate-specific. Most bonds are *not* here — intra-residue connectivity
  is reconstructed from the Chemical Component Dictionary, and only non-template, structure-specific
  connections are written down. This matters only at metal sites (Section 6, case D).
- **`_atom_sites_alt` / `_atom_sites_alt_ens` / `_atom_sites_alt_gen`** — a dormant legacy mechanism
  that already groups altloc letters into named "ensembles." Worth knowing because someone will ask
  "why not this?" The answer: it groups by altloc letter globally, with no residue or atom scoping, no
  parent/child, no occupancy relationship — so it inherits the overloaded-letter problem and cannot
  express nesting or non-local exclusivity. It is the closest existing thing and exactly what the
  proposal supersedes.

## 4. The proposed categories

Three new categories carry the spine, plus one optional constraint category for the hard occupancy
relations. `_atom_site` is untouched throughout.

- **`_pdbx_alt_groups` — membership.** Names a *network*: a set of atoms that together constitute one
  state, by pointing into `_atom_site` via existing keys. Columns: `id` (row key), `alt_group_id`
  (the state's name), `auth_asym_id`, `auth_seq_id_start`, `auth_seq_id_end`, `label_alt_id`, and an
  optional `label_atom_id`. One network spans several rows (non-contiguous membership). Residue-range
  is the default granularity; when `label_atom_id` is `.` the row claims every atom in the range, when
  it names an atom the row claims just that atom. That optional column is the atom-level escape hatch —
  a network table with it is exactly as expressive as a per-atom state label, with `_atom_site` left
  alone.
- **`_pdbx_heterogeneity_hierarchy` — the tree and the occupancy grouping.** For each network:
  `alt_group_id`, `coexistence_group_id` (which mutually-exclusive set it belongs to among its
  siblings — the same object a crystallographer calls an *occupancy group*), and
  `parent_alt_groups_id` (its parent network; `.` for a root). Optionally the occupancy columns of
  Section 5 and the `state_kind` tag.
- **`_pdbx_state_coexistence` — optional exclusions.** A sparse `NOT`-only list, present only for the
  rare cross-branch clash the tree does not already imply. Columns: `id`, `rule` (always `NOT`),
  `heterogeneity_id`, `heterogeneity_ids`. Absent from most files. `AND`/`OR` are deliberately dropped —
  the deck showed they admit several readings.
- **`_pdbx_occupancy_constraint` (+ `_pdbx_occupancy_constraint_term`) — optional occupancy relations.**
  The escape hatch for occupancy ties a single group cannot express: the cross-branch lock and the DAG
  (Section 7). Absent from ordinary files.

Two reading rules tie the spine together. First, **alternatives sharing one `coexistence_group_id` are
mutually exclusive for free, and that exclusivity is inherited by their descendants** — so
`_pdbx_state_coexistence` is needed only when networks in *different* branches clash anyway. Second,
the always-present single-conformer part of the structure is the implicit root network **`base`**: it
has occupancy 1, it is the root of the hierarchy, and it needs no `_pdbx_alt_groups` rows because its
membership is "every atom not claimed by another network." Only alternate networks are listed.

A whole, valid data block for the simplest non-trivial case — two serines that flip together as one
network — reads (atoms abbreviated):

```
loop_
_pdbx_alt_groups.id
_pdbx_alt_groups.alt_group_id       # the network's name = the state identity
_pdbx_alt_groups.auth_asym_id
_pdbx_alt_groups.auth_seq_id_start
_pdbx_alt_groups.auth_seq_id_end
_pdbx_alt_groups.label_alt_id       # which altloc letter these atoms carry
_pdbx_alt_groups.label_atom_id      # '.' = all atoms in the range; else one atom name
1 net_1 A 34 34 A .
2 net_1 A 89 89 A .
3 net_2 A 34 34 B .
4 net_2 A 89 89 B .
#
loop_
_pdbx_heterogeneity_hierarchy.alt_group_id
_pdbx_heterogeneity_hierarchy.coexistence_group_id  # the mutually-exclusive set (occupancy group)
_pdbx_heterogeneity_hierarchy.parent_alt_groups_id  # parent network ('.' = root)
base  .       .
net_1 rotamer base
net_2 rotamer base
```

`_pdbx_alt_groups` says the SER34/SER89 atoms with `label_alt_id A` are network `net_1` and the `B`
atoms are `net_2`; the hierarchy says both are children of `base` sharing occupancy group `rotamer`,
so they are the two mutually-exclusive whole-structure states. `_atom_site` was not touched.

## 5. One pattern, three layers

The design has a single shape, used three times: a piece of meaning gets a **frugal, tree-implicit
default** that costs nothing on ordinary files, plus an **explicit-list escape hatch** for the rare
case the default cannot reach.

```
LAYER                    frugal default                       escape hatch
──────────────────────────────────────────────────────────────────────────────────────
exclusivity              shared coexistence_group_id          _pdbx_state_coexistence (NOT)
occupancy                completeness flag ⇒ children sum      _pdbx_occupancy_constraint (equations)
membership granularity   residue range                        label_atom_id atom list
```

Reading it as a layer rather than a bolt-on is what keeps the additions small and the story coherent:
the default carries the common case at near-zero cost and maps straight onto what refinement programs
already do; the escape hatch carries the genuinely hard relations, used only when the tree cannot
speak. Membership already had its two layers (residue range / `label_atom_id`) and exclusivity already
had its two (shared group / `NOT` row). The occupancy layer completes the symmetry.

The occupancy default is three optional columns on `_pdbx_heterogeneity_hierarchy`, all defaulting to
`.`:

- **`occupancy_completeness`** ∈ `complete | incomplete | single | .` — the sum rule for *this row's
  sibling set under its parent*. `complete`: the siblings sum to the parent's occupancy (to 1 at the
  root) — the ordinary closed occupancy group. `incomplete`: they sum to strictly less, the remainder
  an unmodelled alternative. `single`: a lone partial group with no sibling and no sum rule (a ligand
  in 30% of copies with no modelled complement). It carries the sum rule *only, never exclusivity* —
  exclusivity stays in `coexistence_group_id`; folding them together would re-blur the axis the design
  just cleaned up.
- **`occupancy_refine_flag`** ∈ `refined | fixed | .` — whether this network's own occupancy was a
  refined parameter or held fixed. This single bit separates a fixed parent (every program handles it)
  from a refinable parent (no program does — see tiers below).
- **`occupancy_value`** ∈ float | `.` — the value used when `fixed` (a metal parent at 1.0, a ligand
  deliberately held at 0.5). `.` when refined or derivable by summing `_atom_site.occupancy`.

Adoption is opt-in in three tiers, because `_atom_site` is unchanged and the categories are additive:

1. **Ignore.** A program that knows none of the categories reads the same `_atom_site` and refines as
   today. Nothing breaks.
2. **Flat.** Read the hierarchy and apply the occupancy-group constraints already supported — each
   `coexistence_group_id` is one group summing to its parent's occupancy *treated as a constant*. This
   is exactly Refmac `occupancy group alts complete/incomplete`, a Phenix `constrained_group`, a
   SHELXL free-variable pair, a BUSTER `OccGroup`. No new code.
3. **Nested / cross-branch.** Tie a child group's sum to a *refinable* parent occupancy (parent 0.5,
   children 0.25 + 0.25, co-refined), or lock two groups across branches, or state a DAG equation.

The tier-3 boundary is checked against primary documentation for all five mainstream programs and it
holds: none of Refmac5, Servalcat (which delegates occupancy to Refmac), phenix.refine, SHELXL, or
BUSTER can tie a child group's refinable sum to a refinable parent. Phenix's own docs state there is
no support for parent/child occupancy hierarchies or for linking two constrained groups; SHELXL nests
only against a *fixed* parent and `SUMP` restrains a linear combination only to a *constant*. So tier 3
is real — it is the Phenix blocker named in the 12 June meeting — and the honest framing is that the
format records it so the pipeline can grow into it, not that any program consumes it today.

## 6. The graded cases

The same progression the public explainer and the memo use, A through D, each shown in the single
reconciled encoding. From B onward the missing fact is always the same — *which alternates across the
structure co-occur* — and the answer is always the same three moves: name the networks in
`_pdbx_alt_groups`, nest them in `_pdbx_heterogeneity_hierarchy`, reach for `_pdbx_state_coexistence`
only when two branches genuinely clash.

**A — one residue, two rotamers.** A single Asp30 side chain in two positions (0.60 / 0.40). Both
alternatives live in one residue, so the altloc letter already relates only things that sit together;
nothing is underspecified. Existing `_atom_site` only; no new category. The new categories are opt-in
and earn their keep from B on.

**B — a correlated network across two residues.** Asp30 and His88 are far apart, hydrogen-bonded, and
flip together (50/50). The current file can place all four sets of atoms, but the only thing saying
"A goes with A" is the shared letter — an unenforced convention that breaks the moment a third nearby
residue has a different number of alternates. The fix is exactly the block in Section 4: two networks
in `_pdbx_alt_groups`, one occupancy group `rotamer` under `base`. Stephanie gets the co-occurrence
written down; gemmi/refinement gets it with `_atom_site` untouched, mapping onto an ordinary occupancy
group `net_1 + net_2 = 1`.

**B+ — when a residue must split below the altloc letter.** Lys78 has two *independent* two-state
choices at once: a backbone-loop choice (atoms N, CA, C, O, H) and a side-chain-rotamer choice (CB,
CG, CD, CE, NZ), both reusing letters `A`/`B` on the same residue 78. A residue-range key cannot tell
them apart — they share residue and letter. This is the one case that would otherwise force a per-atom
column, and it is what the `label_atom_id` escape hatch is for: the `_pdbx_alt_groups` rows name one
atom each, splitting residue 78 into `loop_A`/`loop_B` (backbone) and `rot_A`/`rot_B` (side chain),
two independent occupancy groups under `base`.

```
loop_
_pdbx_alt_groups.id
_pdbx_alt_groups.alt_group_id
_pdbx_alt_groups.auth_asym_id
_pdbx_alt_groups.auth_seq_id_start
_pdbx_alt_groups.auth_seq_id_end
_pdbx_alt_groups.label_alt_id
_pdbx_alt_groups.label_atom_id
1  loop_A A 78 78 A N
2  loop_A A 78 78 A CA
# … C, O, H → loop_A ; the B backbone atoms → loop_B
11 rot_A  A 78 78 A CB
# … CG, CD, CE, NZ → rot_A ; the B side-chain atoms → rot_B
#
loop_
_pdbx_heterogeneity_hierarchy.alt_group_id
_pdbx_heterogeneity_hierarchy.coexistence_group_id
_pdbx_heterogeneity_hierarchy.parent_alt_groups_id
base   .       .
loop_A loop    base
loop_B loop    base
rot_A  rotamer base
rot_B  rotamer base
```

**C — compositional and conformational, with nesting.** Apo (70%) vs bound (30%); a gate residue
(Tyr120) opens only when bound; the bound ligand has two poses (0.20 and 0.10). The current file can
place the alternates but cannot state that the two ligand poses sum to the bound fraction (nesting),
that the closed gate goes with the absent ligand (coupling), or that apo/bound are the two whole-
molecule frames — and the absent 70% of the ligand has *no row at all*, so there is nowhere to attach
the coupling. The tree solves all of it, with the exclusion table empty:

```
loop_
_pdbx_heterogeneity_hierarchy.alt_group_id
_pdbx_heterogeneity_hierarchy.coexistence_group_id
_pdbx_heterogeneity_hierarchy.parent_alt_groups_id
_pdbx_heterogeneity_hierarchy.occupancy_completeness
_pdbx_heterogeneity_hierarchy.occupancy_refine_flag
_pdbx_heterogeneity_hierarchy.state_kind
base  .             .     .        .       .
apo   protein_state base  complete refined compositional
bound protein_state base  complete refined compositional
lig_a ligand_pose   bound complete refined conformational
lig_b ligand_pose   bound complete refined conformational
```

Reading the occupancy straight off: `apo + bound = 1` (complete under the root); `lig_a + lig_b =
occ(bound) = 0.30` (complete under `bound`). A ligand never co-occurs with apo, because its parent is
`bound` and `bound` excludes `apo` — no exclusion row needed. The one honest caveat: because `bound`
is itself refined, the lower sum tracks a refinable parent — the tier-3 relation. A tier-2 program
reads the same rows and refines the two poses against `bound` held constant; it just does less.

**D — multi-chain metal coordination (the frontier).** A calcium at a two-chain interface (real:
5E1N), coordinated by acidic residues from both chains each modelled in four alternates. A network
spans both chains *and* the metal, via `auth_asym_id` in `_pdbx_alt_groups`; the four coordination
spheres are one `coexistence_group_id`. This is the one case where `_pdbx_state_coexistence` earns its
place — branchy coordination can carry geometric clashes the grouping does not already imply, written
as explicit `NOT` rows — and the one case that drags `_struct_conn` in: the `metalc` bonds are
altloc-specific real data with nowhere else to live. The cost, named plainly, is that the metal must
be split into altlocs to join a sphere, and `_pdbx_alt_groups` and `_struct_conn` become two
independent pointers into the same `_atom_site` rows that nothing in the dictionary forces to agree —
a bookkeeping burden localised to this case, not a property of the bond.

## 7. The hard case: the deck's EDO site and the DAG

The May-2026 working-group deck is built on one real site — three ethylene glycols
(`EDO1`/`EDO2`/`EDO3`) and a fragment ligand across two pockets — and walks it through three
interpretations to show the working-group tables (`_pdbx_heterogeneity_hierarchy` +
`_pdbx_state_coexistence` with `AND`/`OR`/`NOT`) admit several physical readings. Its closing slides
are, in effect, a specification request. *What is Needed?* draws the intended structure as a **DAG** —
`EDO2` and `EDO3` each pointing up to **both** `EDO1` and the `Ligand`, edges crossing — says the tree
carries the interactions ("branching indicates a common site; connections indicate interactions;
interactions are inherited") but that "more information is needed to define occupancy relationships,"
and asks "Does that make sense?" *Conclusions* warns the intent "dictates how interactions and
occupancies are handled in refinement — with potentially major consequences for code."

That request splits cleanly along the layer division of Section 5. The tree carries what the deck says
it should — the two exclusive pairs are two coexistence groups (top pocket complete, summing to 1;
bottom pocket incomplete, summing to 0.5 with the empty half unmodelled). The one thing the tree
cannot carry is the cross-pocket coupling, where the bottom pocket is ordered only when the top holds
`EDO1`, so `O(EDO1) = O(EDO2) + O(EDO3)`. A hierarchy gives every node one parent; this coupling makes
`EDO2` answer upward to two. The format expresses it by keeping the frugal tree projection (nest
`EDO2`/`EDO3` under `EDO1`, which gives `O(EDO2)+O(EDO3)=O(EDO1)` for free) and restoring the dropped
coupling with one explicit equation:

```
loop_
_pdbx_occupancy_constraint.id
_pdbx_occupancy_constraint.type            # sum_to_parent | sum_to_value | equals_group | linear
_pdbx_occupancy_constraint.target_group_id
_pdbx_occupancy_constraint.target_value
_pdbx_occupancy_constraint.enforced        # constraint | restraint | annotation
_pdbx_occupancy_constraint.details
1 linear . 0.0 annotation 'What is Needed slide: O(EDO1) = O(EDO2) + O(EDO3)'
#
loop_
_pdbx_occupancy_constraint_term.constraint_id
_pdbx_occupancy_constraint_term.alt_group_id
_pdbx_occupancy_constraint_term.coefficient
1 EDO1  1.0
1 EDO2 -1.0
1 EDO3 -1.0
```

The `type` vocabulary is small: `sum_to_parent` (nested case, usually implied by the completeness flag
already); `sum_to_value` (a group pinned to a constant total); `equals_group` (the cross-branch lock,
`O(X) = O(Y)`); and `linear` (the general row, shaped exactly like a SHELXL `SUMP` restraint — the DAG
lands here). `equals_group` is just the degenerate two-term `linear`, so an implementer needs only the
one code path. The `enforced` field is load-bearing, not decoration: it records whether the depositing
program treated the relation as a hard constraint, a soft restraint, or an assertion no program fit at
all — the difference between "these numbers were constrained" and "these numbers happen to add up,"
which is what makes the specification portable rather than a transcription of one program's script.

This is the demonstration the deck asked for: its own author names the missing capability, and the
extension supplies exactly it — the occupancy relationships as portable linear equations, written down
instead of living in a slide. No mainstream program fits the row today (`enforced = annotation`,
tier-3), but it is now recorded.

One tag closes the last regression against Stephanie's published paper. The paper's central move is to
put compositional heterogeneity (`bound`/`unbound`/`unknown`) in its own axis so the two heterogeneity
types can be data-mined apart; a bare tree dissolves that, since `apo` and `bound` become ordinary
nodes. An optional `_pdbx_heterogeneity_hierarchy.state_kind` ∈ `conformational | compositional |
unknown | .` buys it back at one column: it restores the data-mining query ("every atom modelled in a
bound state across the PDB" becomes `state_kind = compositional`) and the paper's `unknown` stance —
"present but not asserting which compositional state," distinct from `base`, which otherwise conflates
"not heterogeneous" with "heterogeneous but unassigned."

## 8. A proposed evolution: DAG-native topology and typed ties

The standalone extension proposal (`source_docs/_extension-proposal.md`, the most recent document)
takes the same governing principle one step further. Its argument: if `_atom_site` is the only hard
constraint, then the number of side tables and rows is not itself a cost, so the design should be
optimised for full specification and machine-readability rather than byte count — which means encoding
the DAG *directly* rather than projecting it onto a tree and patching with an equation. Four deltas:

- **Let the hierarchy be a DAG.** Replace the single-parent `parent_alt_groups_id` with a small edges
  table, `_pdbx_heterogeneity_edge` (`child_id`, `parent_id`), so a state may declare any number of
  parents. A root points at `base`; the two-parent `EDO2` contributes two rows. An edge asserts
  topology only — co-occurrence, nesting, inheritance of exclusivity — and says nothing about
  magnitudes.
- **Record occupancy relationships as typed ties, not equations.** Every real occupancy relationship
  is one of two shapes: a set of states whose occupancies sum to another's, or two states constrained
  equal. Express them as `_pdbx_occupancy_relationship` with `type ∈ {sum_to, equal}` and a target,
  plus a member table — the cross-pocket coupling becomes members `{EDO2, EDO3}`, target `EDO1`, with
  no coefficients or arithmetic in the file (the same mental model as a refinement occupancy group).
- **Independence is the default.** Two states with no recorded relationship are independent — the joint
  is the product of marginals, computed on demand, nothing stored. Correlation is the marked case;
  independence is the unmarked default, stated as a dictionary rule so a file's silence is meaningful.
- **Nonlinear (product) coupling is out of scope, stated plainly** — see Section 9.

This is a genuine alternative spelling of the same design, not a replacement wholesale: the
`_pdbx_alt_groups` spine, the coexistence groups, the optional `NOT` list, the `state_kind` tag, the
three tiers, and the Refmac round-trip all carry over unchanged. What differs is how the graph and the
magnitudes are written — `edges + typed ties` versus `tree + linear equation` — and that is one of the
open choices in Section 10. The edges-table form is DAG-native and reads more cleanly; the tree-plus-
equation form is closer to what the browser and demo files already implement and keeps a single
`linear` code path. Both hold the EDO case; neither reaches past it.

## 9. The unresolved tail

The reconciliation shrinks the problem to its irreducible core; it does not claim the core is solved.
What remains genuinely open, in rough order of how fundamental it is:

**The product wall — the real frontier.** Every relationship the tables can hold, in either spelling,
is *linear* — a weighted sum of group occupancies set equal to a constant or another sum. Genuine
statistical independence is *multiplicative* and lies outside it. Change the EDO physics slightly: two
independent partial occupants (frag1 at 0.5, frag2 at 0.6, binding without influencing each other) and
an ordered water present only when *both* are bound. Then `O(water) = O(frag1) × O(frag2) = 0.30`, a
product. No linear-equation-over-groups language expresses it — there is no choice of constant
coefficients for which an affine form equals a product. The only way to stay linear is to *enumerate
the joint states* (four mutually-exclusive whole-site species, the water in one), which is exponential
in the number of independent events (`2^N` species for `N` switches) and does not even preserve the
independence it is faking. This is the same wall the deck hit from the other side — its *Interpretation
2* duplicates the shared molecule into two copies, then three, and still leaves "the presence of single
species undefined." It is one wall wearing three faces: the deck's unresolved "existence of single
species," the eval's "enumerate the single species," and the Phenix "false redundancy" complaint. The
honest frontier past this extension is not the DAG (the DAG is linear and the escape hatch holds it) —
it is the **mixture of exclusive (simplex, linear) and independent (product, nonlinear) couplings in
one system.** No proposal on the table reaches it; naming it as one thing is the move for the next
meeting.

**Tier-3 has no consumer yet.** The nested-refinable, cross-branch-lock, and DAG relations are
recorded but fit by no mainstream program. "The format is ready" must not be read as "the pipeline is
ready." Recording them so the next program can grow into them is the whole point of `enforced =
annotation`, but the gap is real.

**The ragged-ensemble substrate.** When altloc branches carry different numbers of states there is no
global frame: qFit constrains occupancies to sum to one per residue position while allowing different
conformer counts elsewhere. A dangling alternate — a label with no partner — is unpinned by data and
drifts; the standard workarounds are ugly (a phantom residue at zero occupancy held by a harmonic
tether, or forcing every residue to carry the same number of states, manufacturing false redundancy).
The `single`/`incomplete` flags make a partial branch *legible* — they say plainly it is legitimately
partial rather than mis-modelled — but the format provides no restraint substrate of its own. That gap
is owned by the refinement programs.

**Higher-arity exclusivity.** `NOT` is pairwise. "These three may co-occur in any pair but never all
three at once" cannot be said with pair rows; it needs a forbidden-*tuple* reading the dictionary would
have to spell out. Rare, but real, and deliberately kept in the exclusivity layer
(`_pdbx_state_coexistence`) rather than leaked into the occupancy category.

**Metal / `struct_conn` bookkeeping.** The two-independent-pointers problem of case D (membership loop
and `metalc` records must be kept consistent by hand) is localised and documented, not automated.

Alongside those substantive gaps sit the **open design choices** — decisions to settle when this is
folded into a next revision, several of which the interactive explainer is built to help weigh:

1. **How to encode the DAG.** Edges table (`_pdbx_heterogeneity_edge`, DAG-native) versus tree-plus-
   `linear`-equation (project the graph, restore the dropped coupling) versus permitting multiple
   parent rows in the existing hierarchy (no new category, but denormalised). The extension proposal
   recommends the edges table; the occupancy memo and the current browser implement tree-plus-equation.
2. **How to encode magnitudes.** Typed ties (`sum_to`/`equal` over state names, no coefficients) versus
   the coefficient-bearing equation list (`linear`/`equals_group` with a term table). Typed ties read
   more cleanly for the cases that actually occur; the equation list is more general and maps directly
   onto `SUMP`. They are two spellings of the same content.
3. **Completeness: flag versus relationship.** Keep `complete`/`incomplete` as a flag on the coexistence
   group (terse, matches Refmac) versus expressing even the within-group sum as a relationship row
   (uniform, one mechanism for all occupancy semantics). Recommendation so far: the flag, with the
   relationship/equation table reserved for cross-group ties.
4. **Exclusivity: keep the NOT list, or fold `excludes` into relationships.** Recommendation so far:
   keep them separate — logical exclusivity and numeric occupancy are different concerns and validate
   more cleanly apart.
5. **`name` versus `id`.** From the Slack: if both the hierarchy and an exclusivity loop are used,
   should the human-readable `name` be required to match across them? Stephanie wants yes; whether
   mmCIF cleanly allows that coupling is unresolved.
6. **Completeness/consistency as process, not format.** Dorothee's reply killed the earlier whitepaper
   not on concept but on internal inconsistency — text, figure, and CIF encoding three different
   structures, a panel referenced that did not exist, a ligand in absent density. Nothing about the
   format enforces that alignment; a checklist in the repo is worth more than good intentions. This is
   also why the examples must be physically defensible and internally consistent before they go back to
   the refinement groups.

Adjacent to all of this, and not a format question, is **validation and deposition**: what these files
look like passing through OneDep, and what better validation for ensemble models requires. The working
group flagged it as needed but not blocking.

## 10. Where this leaves us

Against the working-group form of Stephanie's proposal, this design is a robustness-and-cost win at no
real expressiveness loss: `_atom_site` untouched, `AND`/`OR` dropped so the deck's core ambiguity is
gone, exclusivity mostly free from the tree, graceful three-tier adoption, and zero cost on ordinary
files. Against the published paper it is a robustness-and-cost win that gives back one thing the paper
most wanted — the conformational/compositional split — which the `state_kind` tag buys back rather than
pretends was never lost. Where neither wins is the DAG of cross-branch couplings and the enumerated list
of co-occurring species; both proposals are trees with pairwise side-rules, and the constraint/edges
escape hatch moves that boundary from "inexpressible" to "expressible but unfrugal and unfitted." The
genuinely irreducible line sits one step further out, at the product coupling of Section 9.

The next stage — the one the interactive explainer is meant to help think through before committing —
is exactly the pair of choices in Section 9: which spelling of the graph and magnitudes to standardize
on, and how to state honestly, in the dictionary, that the product case is nobody's format yet.
