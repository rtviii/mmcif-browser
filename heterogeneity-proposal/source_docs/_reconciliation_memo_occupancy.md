# Grouped occupancy: making the occupancy specification portable

*Third companion to `_reconciliation-memo.md` and `_reconciliation_memo_eval.md`. The memo
argues one encoding satisfies both sides; the eval stress-tests it and names two holes it
inherits — cross-branch occupancy locking and the DAG. This doc takes the axis the refinement
groups actually care about — **occupancy** — and does three things: (1) reframes grouped
occupancy as the middle of three symmetric constraint layers, so it is a pattern the
reconciliation already uses twice rather than a bolt-on; (2) extends the encoding, coverage-
driven, so the occupancy-group **specification** becomes first-class and portable, closing the
cross-branch and DAG holes as explicit tier-3 spec; and (3) grounds its hard case in Paul Adams'
May-2026 working-group deck — solving the EDO example the deck flags as needing "more information
to define occupancy relationships," then walking one step past the deck to a case its own linear
equations still cannot express. It also folds in the conformational/compositional "kind" tag the eval flagged as the
buy-back to a true superset. Everything here stands on the memo, the eval, and the primary
refinement-program documentation cited at the end.*

---

## Why the deposited file loses the occupancy specification

A refined crystal structure carries two different things about occupancy, and the deposited
mmCIF keeps only one of them.

- The **numbers** — each atom's fitted `_atom_site.occupancy`. These survive deposition.
- The **specification** — *which* alternates were tied together, whether their occupancies were
  constrained to sum to one (complete) or left free (incomplete), whether a group's total was
  refined or held fixed, and any relation locking one group's occupancy to another's. This lives
  in the refinement program's keyword file (Refmac `occupancy group …`, a Phenix
  `constrained_group` block, a SHELXL `SUMP` line) and is **thrown away** at deposition.

The consequence is the whole reason the refinement groups are cautious. From a deposited file
today you cannot tell whether two alternates at 0.5/0.5 were *constrained* to be complementary
or merely *happen* to have landed there; you cannot tell that a ligand's two poses were refined
to sum to the ligand's own refined occupancy rather than to one; you cannot recover a
cross-copy occupancy lock at all. The numbers are a fitted snapshot; the relationships that
produced them — and that any re-refinement must reproduce — are gone.

This is exactly what Dorothee's reply invited when it said the useful direction is "to make
these relationships more explicit and portable." Grouped occupancy is not a new feature to
invent; it is a specification that already exists in every refinement run and has nowhere to
live in the archive. The hierarchy we already proposed is the natural home for it.

---

## Three constraint layers, one pattern

The reconciliation already has a shape, used twice. A piece of meaning has a **frugal,
tree-implicit default** that costs nothing on ordinary files, and an **explicit-list escape
hatch** for the rare case the default cannot reach. Membership works this way (residue range by
default; a `label_atom_id` atom list when a residue must split below the altloc letter).
Exclusivity works this way (siblings sharing a `coexistence_group_id` are mutually exclusive for
free; a `_pdbx_state_coexistence` NOT row only for a cross-branch clash the tree does not imply).

Grouped occupancy is the **third instance of the same pattern**, sitting between the other two:

```
LAYER                  frugal, tree-implicit default            explicit-list escape hatch
────────────────────────────────────────────────────────────────────────────────────────────
exclusivity            shared coexistence_group_id              _pdbx_state_coexistence (NOT)      [have]
occupancy              completeness flag => children sum        _pdbx_occupancy_constraint         [new]
                       to parent                                (equation list)
membership granularity residue range                           label_atom_id atom list            [have]
```

Reading it as a layer, not a bolt-on, is what makes the additions small and the story coherent:
the default carries the common case at near-zero cost and maps straight onto what refinement
programs already do; the escape hatch carries the DAG and the cross-branch lock — the eval's
irreducible core — as an explicit, portable equation, used only when the tree genuinely cannot
speak.

---

## The occupancy encoding delta

Coverage-driven: each addition below is justified by a specific case later in this doc, and
nothing is added that an existing column already carries.

### New columns on `_pdbx_heterogeneity_hierarchy`

Three optional columns, all defaulting to `.`, keeping every occupancy fact in the one category
that already describes the tree:

- **`occupancy_completeness`** ∈ `complete | incomplete | single | .` — the sum rule for *this
  row's sibling set under its parent*.
  - `complete` — the siblings sharing this `coexistence_group_id` sum to their parent's
    occupancy (to `1` at the root). This is the ordinary "closed" occupancy group.
  - `incomplete` — the siblings sum to strictly less than the parent (`0 < Σ < occ(parent)`);
    the remainder is an unmodelled or absent alternative.
  - `single` — a lone partial group with no sibling and no sum rule (a ligand present in 30 % of
    copies with no modelled complement). Distinct from `incomplete`, which has a sibling.
  - `.` — unspecified.

  It carries the **sum rule only, never exclusivity**. Exclusivity stays in
  `coexistence_group_id`; folding the two together would re-blur the very axis the reconciliation
  cleaned up (and re-import the deck's ambiguity). Siblings in one group must agree on this value.
  (Dictionary-hygiene alternative: hoist `occupancy_completeness` into a tiny
  `_pdbx_coexistence_group` category keyed by `parent_alt_groups_id` + `coexistence_group_id`;
  per-row here is recommended for parity with `_pdbx_alt_groups`.)

- **`occupancy_refine_flag`** ∈ `refined | fixed | .` — whether *this network's own* occupancy
  was a refined parameter or held fixed during refinement. This is the single bit that separates
  a fixed parent (tier-2, every program can do it) from a refinable parent (tier-3, no program
  can) — see the tier map below.

- **`occupancy_value`** ∈ float in `[0,1]` | `.` — the value used when `fixed` (a metal parent at
  `1.0`, a ligand deliberately held at `0.5`, a special-position atom). `.` when the value is
  refined or simply derivable by summing `_atom_site.occupancy` over the network. Redundant with
  the atom rows on purpose: it resolves the case where a summed number coincides with a
  meaningful value by accident.

### The optional `_pdbx_occupancy_constraint` category (the escape hatch)

Absent from ordinary files; it appears only for the relations a tree cannot hold — the
cross-branch lock and the DAG. A head row states the relation and its scalars; a child term
table supplies the variable-length left-hand side one atom-network per row, so every field stays
atomic (no comma-separated lists, which the dictionary dislikes):

```
loop_
_pdbx_occupancy_constraint.id
_pdbx_occupancy_constraint.type            # sum_to_parent | sum_to_value | equals_group | linear
_pdbx_occupancy_constraint.target_group_id # RHS group (sum_to_parent, equals_group); else .
_pdbx_occupancy_constraint.target_value    # RHS constant (sum_to_value, linear); else .
_pdbx_occupancy_constraint.enforced        # constraint | restraint | annotation
_pdbx_occupancy_constraint.details
#
loop_
_pdbx_occupancy_constraint_term.constraint_id  # -> _pdbx_occupancy_constraint.id
_pdbx_occupancy_constraint_term.alt_group_id   # -> _pdbx_alt_groups.alt_group_id
_pdbx_occupancy_constraint_term.coefficient    # LHS coefficient (default 1.0)
```

The `type` values, in one reading:

- `sum_to_parent` — `Σ(coeff·occ(term)) = occ(target_group_id)`. The nested case stated
  explicitly. Usually unnecessary — the completeness flag already implies it for tree nesting —
  but available for a program that prefers the equation form.
- `sum_to_value` — `Σ(coeff·occ(term)) = target_value`. A flat complete (value `1`) or a group
  pinned to a constant total, written out.
- `equals_group` — `occ(single term) = occ(target_group_id)`. The **cross-branch lock**.
- `linear` — `Σ(coeff·occ(term)) = target_value`. The general row, shaped exactly like a SHELXL
  `SUMP` restraint. The **DAG** lands here: the EDO coupling `O(EDO1) = O(EDO2) + O(EDO3)` is one
  row with coefficients `+1, -1, -1` and `target_value 0`. Note that `equals_group` is just the
  degenerate two-term `linear` (`+1, -1`, target `0`), so an implementer needs only the one
  `linear` code path.

`enforced` ∈ `constraint | restraint | annotation` is load-bearing, not decoration. It records
whether the depositing program treated the relation as a hard constraint (Refmac `complete`), a
soft restraint with a sigma (SHELXL `SUMP`), or an assertion no program fit at all (a tier-3
relation, recorded so the *next* program can). Dropping it would collapse the distinction that
makes this a portable specification rather than a transcription of one program's script — and it
is the field that lets a reader recover whether the deposited numbers were constrained to the
relation or merely satisfy it by coincidence.

### Three corrections folded in

Relative to the first sketch of this idea, three things were wrong and are fixed above:

1. A completeness flag must **not** also mean "and mutually exclusive." Exclusivity already lives
   in `coexistence_group_id`. The flag is the sum rule alone.
2. A binary complete/incomplete is not enough. It cannot tell a `0.3` ligand *with* a hidden
   complementary state from a `0.3` ligand that genuinely has none — the exact ambiguity Part 2
   of the public page is about. Hence `single`, and the `fixed` + `occupancy_value` pairing for
   the held-constant case.
3. Without `enforced`, the specification is not portable. It is the difference between "these
   numbers were constrained" and "these numbers happen to add up."

Membership granularity needs **no** new machinery — `label_atom_id` in `_pdbx_alt_groups`
already is the atom-list escape hatch; nothing here duplicates it. And higher-arity exclusivity
("any pair may co-occur, never all three") is an *exclusivity*-layer concern that belongs to
`_pdbx_state_coexistence` as a forbidden-tuple reading; it must not leak into this occupancy
category.

---

## What refinement programs actually do

The additions are shaped to map onto existing occupancy-group machinery wherever such machinery
exists, and to name the exact point where it does not.

### The Refmac round-trip

Refmac is the sharpest target because it is the one program that names the complete/incomplete
distinction explicitly. Each proposed field maps to a keyword or is flagged as a genuine gap:

```
proposed field / value                         Refmac keyword it round-trips to             gap?
────────────────────────────────────────────────────────────────────────────────────────────────
_pdbx_alt_groups network (chain,seq-range,alt) occupancy group id N chain .. residue from..to ..  none
siblings, completeness = complete              occupancy group alts complete   <ids>  (Σ = 1)      none
completeness = incomplete                      occupancy group alts incomplete <ids>  (0 < Σ < 1)  none
completeness = single (lone partial)           one group + occupancy refine, no complete line      none
occupancy_refine_flag = refined                group is a free parameter under occupancy refine    none
occupancy_refine_flag = fixed + occupancy_value group defined but omitted from occupancy refine     none
occupancy_constraint sum_to_parent (refinable) — no keyword —                                       TIER 3
occupancy_constraint equals_group              — no keyword (only external-restraint abuse) —       TIER 3
occupancy_constraint linear (the DAG)          — no keyword (SHELXL SUMP is closest, to a constant) TIER 3
```

The three layers that map cleanly — flat exclusivity, flat occupancy, granularity — do so
losslessly. The three that do not are precisely the ones the eval already flagged as beyond
every program. The encoding therefore **over-provisions relative to fitting**: it can record a
relation no current program can refine. That is the escape hatch working as intended, not a
defect — the specification outlives the tool.

### Tiers 1/2/3, and the gap that is confirmed, not assumed

The memo's three adoption tiers now have a precise, verified boundary:

- **Tier 1 — ignore.** A program that knows none of the new categories reads the same
  `_atom_site` and refines as today. Nothing breaks.
- **Tier 2 — flat.** Read the hierarchy and apply the occupancy-group constraints already
  supported: each `coexistence_group_id` is one group summing to its parent's occupancy *treated
  as a constant*. This is exactly Refmac `occupancy group alts complete/incomplete`, a Phenix
  `constrained_group`, a SHELXL two-component free-variable pair, a BUSTER `OccGroup`. No new
  code.
- **Tier 3 — nested and cross-branch.** Tie a child group's sum to a *refinable* parent
  occupancy (parent `0.5`, children `0.25 + 0.25`, all co-refined), or lock two groups across
  branches, or state a DAG equation.

The tier-3 claim is now checked against primary documentation for all five mainstream programs,
and it holds: **none** of Refmac5, Servalcat (which delegates occupancy handling to Refmac),
phenix.refine, SHELXL, or BUSTER can tie a child group's refinable sum to a refinable parent.
phenix.refine's own documentation states there is no support for parent/child occupancy
hierarchies or for linking two constrained groups; each group is independent. SHELXL can nest
only against a *fixed* parent (its site-occupancy coding multiplies a constant by one free
variable — it cannot form the product of two refinable variables), and `SUMP` restrains a linear
combination only to a *constant* target. So tier 3 is real, it is what the 12 June meeting
identified as the Phenix blocker, and the honest framing is that we record it so the pipeline can
grow into it — not that any program consumes it today.

### The ragged-ensemble problem is real, and adjacent

The same thread named a second-order problem worth stating so "the format is ready" does not
overstate the pipeline. When altloc branches carry different numbers of states, there is no
global frame: qFit constrains occupancies to sum to one *per residue position* while allowing
different conformer counts at different positions, and releases even that in the final
refinement. A dangling alternate — a label with no partner — is unpinned by data and drifts; the
standard workarounds are ugly (a phantom residue at zero occupancy held by a harmonic coordinate
tether, or forcing every residue to carry the same number of states, manufacturing false
redundancy). Our grouping makes the *intent* legible — `single` and `incomplete` say plainly that
a branch is legitimately partial rather than mis-modelled, which is information a refinement
program can use instead of a phantom — but it provides no restraint substrate of its own. That
gap is owned by the refinement programs; naming it keeps us honest about how ready the pipeline
is versus how ready the format is.

---

## Case coverage

Eight cases span the occupancy axis. Most need only the flag; the escape hatch earns its place
in exactly three (rows 4, 7, 8), and even there the reason differs — which is the point of the
table's last two columns.

```
#  case                                    carried by                         layer            tier
──────────────────────────────────────────────────────────────────────────────────────────────────
1  single-residue rotamer, Σ=1 in residue  label_alt_id + occupancy            implicit         1
2  flat complete (apo + bound = 1)          shared coex-group, complete         flag             2
3  flat incomplete / lone ligand at 0.3     completeness = single (or incomplete) flag           2
4  nested refinable (0.5 -> 0.25 + 0.25)    complete under a refined parent      flag            3
5  fixed parent (metal 1.0, ligands vary)   parent fixed + value; children complete flag         2
6  two independent groups, one parent       two coex-groups + label_atom_id      flag + granularity 2
7  cross-branch lock  O(X) = O(Y)           _pdbx_occupancy_constraint equals_group  equation    3
8  the DAG  O(EDO1) = O(EDO2) + O(EDO3)      _pdbx_occupancy_constraint linear    equation        3
```

Two clarifications the table makes visible:

**Tier-3-ness is not the same as needing the escape hatch.** Row 4 is tier-3 (no program
co-refines a child sum against a refinable parent) yet it is *tree-shaped* — the completeness
flag on the children plus `refine_flag = refined` on the parent says everything; no equation row
is required. The escape hatch is needed only when the relation is **not** a parent-child edge of
the tree: a lock between different branches (row 7) or a genuine two-parent coupling (row 8).
Rows 4, 7, 8 are all tier-3, but only 7 and 8 need `_pdbx_occupancy_constraint`.

**The interesting cases, worked.**

*Row 4 — nested refinable (Case C from the memo, now with the flags).* Apo/bound at the top,
the bound ligand in two poses beneath:

```
loop_
_pdbx_heterogeneity_hierarchy.alt_group_id
_pdbx_heterogeneity_hierarchy.coexistence_group_id
_pdbx_heterogeneity_hierarchy.parent_alt_groups_id
_pdbx_heterogeneity_hierarchy.occupancy_completeness
_pdbx_heterogeneity_hierarchy.occupancy_refine_flag
_pdbx_heterogeneity_hierarchy.occupancy_value
_pdbx_heterogeneity_hierarchy.state_kind
base  .             .     .        .       1.0 .
apo   protein_state base  complete refined .   compositional
bound protein_state base  complete refined .   compositional
lig_a ligand_pose   bound complete refined .   conformational
lig_b ligand_pose   bound complete refined .   conformational
```

`apo + bound = 1` (complete under the root). `lig_a + lig_b = occ(bound)` (complete under
`bound`), and because `bound` is itself `refined`, that lower sum tracks a refinable parent — the
tier-3 relation, stated entirely in flags. A tier-2 program reads the same rows and refines the
two poses against `bound` held constant; nothing breaks, it just does less.

*Row 5 — fixed parent.* A metal always present, its coordination varying across spheres. The
parent is held constant — here `base`, carrying the full-occupancy metal, marked `fixed` with
`occupancy_value 1.0`; the spheres are a complete group summing to that constant `1.0`, an
ordinary Refmac `complete` group — tier-2, no new refinement behaviour:

```
loop_
_pdbx_heterogeneity_hierarchy.alt_group_id
_pdbx_heterogeneity_hierarchy.coexistence_group_id
_pdbx_heterogeneity_hierarchy.parent_alt_groups_id
_pdbx_heterogeneity_hierarchy.occupancy_completeness
_pdbx_heterogeneity_hierarchy.occupancy_refine_flag
_pdbx_heterogeneity_hierarchy.occupancy_value
_pdbx_heterogeneity_hierarchy.state_kind
base     .            .    .        fixed    1.0 .
sphere_a coord_sphere base complete refined .   conformational
sphere_b coord_sphere base complete refined .   conformational
```

*Row 7 — cross-branch lock.* Two networks in different branches restrained to equal occupancy
(two NCS-related copies of a partial ligand, say). No tree edge connects them; the tree cannot
say it. One `equals_group` row does:

```
loop_
_pdbx_occupancy_constraint.id
_pdbx_occupancy_constraint.type
_pdbx_occupancy_constraint.target_group_id
_pdbx_occupancy_constraint.target_value
_pdbx_occupancy_constraint.enforced
_pdbx_occupancy_constraint.details
1 equals_group siteY . annotation 'NCS-related copies restrained to equal occupancy'
#
loop_
_pdbx_occupancy_constraint_term.constraint_id
_pdbx_occupancy_constraint_term.alt_group_id
_pdbx_occupancy_constraint_term.coefficient
1 siteX 1.0
```

*Row 8 — the DAG.* The eval's EDO frontier: `EDO2`/`EDO3` in one pocket couple upward to both
`EDO1` and the `Ligand` in the other, so a node has two parents. The tree keeps one edge (nest
`EDO2`/`EDO3` under `EDO1`, which gives `O(EDO2) + O(EDO3) = O(EDO1)` for free) and the `linear`
row restores the coupling the tree dropped:

```
loop_
_pdbx_occupancy_constraint.id
_pdbx_occupancy_constraint.type
_pdbx_occupancy_constraint.target_group_id
_pdbx_occupancy_constraint.target_value
_pdbx_occupancy_constraint.enforced
_pdbx_occupancy_constraint.details
1 linear . 0.0 annotation 'second-pocket coupling: O(EDO1) - O(EDO2) - O(EDO3) = 0'
#
loop_
_pdbx_occupancy_constraint_term.constraint_id
_pdbx_occupancy_constraint_term.alt_group_id
_pdbx_occupancy_constraint_term.coefficient
1 EDO1  1.0
1 EDO2 -1.0
1 EDO3 -1.0
```

The tree gives the frugal reading; the equation gives the faithful one. No program fits it today
(`enforced = annotation`), but it is now written down, portably, instead of lost — which is the
whole ask.

---

## The conformational/compositional kind tag

The eval named one axis on which Stephanie's published paper is strictly stronger and we
regress: the paper puts compositional heterogeneity (`bound`/`unbound`/`unknown`) in its own
column so the two heterogeneity types can be data-mined apart, and it has an `unknown` stance for
"present but not asserting which compositional state." Our tree dissolves that — `apo` and
`bound` are just nodes.

Buying it back costs one optional column, and it is already used in the blocks above:
`_pdbx_heterogeneity_hierarchy.state_kind` ∈ `conformational | compositional | unknown | .`.

- It restores the data-mining query — "every atom modelled in a bound state across the PDB" is
  now `state_kind = compositional` on the relevant nodes, without walking and interpreting each
  file's tree.
- `unknown` restores the paper's third stance: an atom that is present but whose compositional
  state we are not asserting. In a bare tree such an atom is indistinguishable from `base`, which
  conflates "not heterogeneous" with "heterogeneous but unassigned." The tag separates them.

It is orthogonal to occupancy — a `state_kind` says nothing about a sum rule — which is why it is
a plain node label and not part of `_pdbx_occupancy_constraint`. With it, the reconciliation is a
superset of the paper on this axis rather than a different point on the curve.

---

## The deck's own hard case, and one step past it

The May-2026 working-group deck (Paul Adams) is built entirely on one real site — three ethylene
glycols (`EDO1`/`EDO2`/`EDO3`) and a fragment ligand across two pockets — and walks it through
three interpretations to show the working-group tables are ambiguous. Its last slides are, in
effect, a specification request. The *Interpretation 3* slides list the occupancy relationships
as explicit **linear equations**; the closing *What is Needed?* slide draws the intended
structure as a **DAG** (`EDO2`/`EDO3` each pointing up to both `EDO1` and `Ligand`), states
plainly that "more information is needed to define occupancy relationships," and asks "Does that
make sense?"; the *Conclusions* warn that the intent "dictates how ... occupancies are handled in
refinement — with potentially major consequences for code." This section answers that request
with `_pdbx_occupancy_constraint` (Part 1), then walks one step past the deck to the case its
linear equations still cannot express (Part 2).

Worth naming first: the deck's own reading of the hierarchy is exactly the layer split argued
above. *What is Needed?* says the tree carries the interactions — "branching indicates a common
site; connections indicate interactions; interactions are inherited" — but occupancy "needs more
information." That is precisely our division of labour: exclusivity and common-site live in the
tree (`coexistence_group_id`), and the occupancy relationships live in a separate explicit
mechanism. The category below is that mechanism.

### Part 1 — solve one: the deck's linear equations, made portable

The site has two pockets, each with two alternative occupants:

```
FIGURE — the deck's EDO site (An Example -> What is Needed?)

   top pocket    (resid 501):   EDO1  |  Ligand      exclusive; O(EDO1) + O(Ligand) = 1
   bottom pocket (resid 502):   EDO2  |  EDO3         exclusive; O(EDO2) + O(EDO3) = 0.5
                                                      (the pocket is empty the other half of the time)

   the coupling a tree cannot carry (the DAG on "What is Needed?"):
      the bottom pocket is ordered only when the top holds EDO1, not Ligand, so
             O(EDO1) = O(EDO2) + O(EDO3)          <- EDO2, EDO3 answer to EDO1 across pockets

   the deck lists this as a linear occupancy equation and says outright:
   "more information is needed to define occupancy relationships."  That information is one row.
```

Two honest notes before the encoding. First, the deck lists *several* candidate couplings at
once — `O(EDO1)=O(EDO2)+O(EDO3)` and `O(Ligand)=O(EDO2)+O(EDO3)` alongside both pocket sums — and
they cannot all hold simultaneously (they force `O(EDO1)=O(Ligand)=1` against `O(EDO1)+O(Ligand)=1`).
That mutual inconsistency *is* the deck's point: the tables do not say which relationship is
intended. A real file must commit to a consistent subset, and the constraint category is exactly
where that commitment is recorded — so the ambiguity the deck flags becomes a written choice.
Second, the alternative the deck explores — *Interpretation 2*, binding co-occurring species by
shared altloc letters and duplicating the shared molecule into copies — is shown needing two
copies, then three, and still leaving "the presence of single species undefined." Hold that; it
is Part 2.

The consistent scenario encoded here: `EDO1` (0.5) or `Ligand` (0.5) in the top pocket; when it
is `EDO1`, the bottom pocket holds `EDO2` (0.3) or `EDO3` (0.2), otherwise it is empty. So
`O(EDO2)+O(EDO3) = 0.5 = O(EDO1)` — the cross-pocket linear DAG.

```
loop_
_pdbx_alt_groups.id
_pdbx_alt_groups.alt_group_id
_pdbx_alt_groups.auth_asym_id
_pdbx_alt_groups.auth_seq_id_start
_pdbx_alt_groups.auth_seq_id_end
_pdbx_alt_groups.label_alt_id
_pdbx_alt_groups.label_atom_id
1 Ligand A 501 501 A .    # top pocket, alt A
2 EDO1   A 501 501 B .    # top pocket, alt B (exclusive with Ligand)
3 EDO2   A 502 502 C .    # bottom pocket, alt C
4 EDO3   A 502 502 D .    # bottom pocket, alt D (exclusive with EDO2)
#
loop_
_pdbx_heterogeneity_hierarchy.alt_group_id
_pdbx_heterogeneity_hierarchy.coexistence_group_id
_pdbx_heterogeneity_hierarchy.parent_alt_groups_id
_pdbx_heterogeneity_hierarchy.occupancy_completeness
_pdbx_heterogeneity_hierarchy.occupancy_refine_flag
_pdbx_heterogeneity_hierarchy.occupancy_value
_pdbx_heterogeneity_hierarchy.state_kind
base   .          .    .          .       1.0 .
Ligand top_pocket base complete   refined .   compositional
EDO1   top_pocket base complete   refined .   compositional
EDO2   bot_pocket base incomplete refined .   compositional
EDO3   bot_pocket base incomplete refined .   compositional
#
loop_
_pdbx_occupancy_constraint.id
_pdbx_occupancy_constraint.type
_pdbx_occupancy_constraint.target_group_id
_pdbx_occupancy_constraint.target_value
_pdbx_occupancy_constraint.enforced
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

The tree carries what the deck says it should: the two exclusive pairs are two coexistence groups
(top `complete`, summing to 1; bottom `incomplete`, summing to 0.5 with the empty half
unmodelled). The one thing the tree cannot carry — the cross-pocket coupling — is the single
`linear` row, which is verbatim the equation on the deck's *What is Needed?* slide
(`0.5 - 0.3 - 0.2 = 0`). No mainstream program fits it (`enforced = annotation`, tier-3), but it
is now written down and portable instead of living in a slide. The same pattern recurs at metal
sites (the memo's Case D, where a shared ion answers to two coordination spheres); the EDO site is
just the deck's chosen instance of it.

That is the demonstration: the deck's own author names this as the missing capability, and the
extension supplies exactly it — the occupancy relationships as portable linear equations.

### Part 2 — expose the next: the product the linear equations cannot reach

Every equation the deck writes, and every row `_pdbx_occupancy_constraint` can hold, is **linear**
— a weighted sum of group occupancies set equal to a constant or another sum. The step past the
deck is the case where the true relationship is not linear at all.

Change the physics: two **independent** partial occupants — two fragments in two sub-sites that
bind without influencing each other — and an ordered **water** that bridges them, present only
when *both* are bound (it needs a donor from each):

```
   sub-site 1:  frag1 present (0.5)   |  absent (0.5)     coexistence_group = site1
   sub-site 2:  frag2 present (0.6)   |  absent (0.4)     coexistence_group = site2   (independent of site1)
   bridging water W:  ordered only when frag1 AND frag2 are both present

   O(W) = O(frag1) x O(frag2) = 0.5 x 0.6 = 0.30
```

This is a **product**, and no linear-equation-over-groups language expresses it — not Stephanie's,
not ours, not the deck's equations. There is no choice of constant coefficients `a, b, c` for
which `a·O(frag1) + b·O(frag2) + c` equals `O(frag1)·O(frag2)` for all values; an affine form is
not a product. The `linear` row that absorbed the DAG in Part 1 cannot reach here.

The only way to stay linear is to **enumerate the joint states** — four mutually exclusive
whole-site species, the water in one of them:

```
   enumerated:  both (0.30)   only-1 (0.20)   only-2 (0.30)   neither (0.20)     Σ = 1
   water in "both" only  =>  O(W) = 0.30    (correct, but...)
```

And this is precisely the wall the deck already hit from the other side. Its *Interpretation 2* is
this enumeration: bind co-occurring species by altloc, duplicate the shared molecule — two copies
of each small molecule (slide), then three, and still "the presence of single species is
undefined." Two costs make it a wall, not a workaround:

- **It is exponential.** Two independent binary events give four species; `N` give `2^N`. This is
  the "manufactured false redundancy" the qFit/Phenix thread named — forcing every element to
  carry every combination — and the deck watched it grow from two copies to three with no natural
  stopping point.
- **It does not even preserve the independence it is faking.** To *enforce* the factorization
  `O(both) = O(frag1)·O(frag2)` you would need a nonlinear (product) constraint among the
  enumerated occupancies; leave it out and a refinement fits the four freely, discarding the
  independence. Either way the product is inescapable.

So the honest frontier past this extension is not the DAG — the DAG is linear, and the escape
hatch (and the deck's own equations) hold it. It is the **mixture of exclusive (simplex, linear)
and independent (product, nonlinear) couplings in one system.** A pure linear-constraint-over-
groups formalism — every proposal on the table, plus the deck's equations — must either enumerate
the joint species (exponential) or adopt a nonlinear constraint language none of them has. This is
one wall wearing three faces: the deck's own unresolved "existence of single species," the eval's
"enumerate the single species" item (§1.2), and the Phenix "false redundancy" complaint. Naming it
as one thing is the move for the next meeting: every "can your format express this coupling"
question with teeth is either linear — and now answered, in the deck's own terms — or a product,
and then it is nobody's format yet, for a reason worth stating out loud.

---

## Honest gaps, updated

What this extension closes, relative to the eval's list:

- **Cross-branch occupancy locking** — was named out of scope in the memo's "Honest gaps"; now
  expressible as an `equals_group` row (tier-3 spec; no program fits it, but it is portable).
- **The DAG** — was the eval's irreducible core (§1.1); now expressible as a `linear` row. The
  tree still gives the frugal projection; the equation restores the coupling it drops.
- **Occupancy specification loss** — the motivating problem; now carried by the completeness /
  refine / value flags and the constraint category, so re-refinement can reconstruct the setup
  instead of guessing it from fitted numbers.
- **The conformational/compositional regression** — bought back with the `state_kind` tag.

What remains genuinely open, stated plainly so no one is surprised:

- **The product wall** (Part 2). Independence is nonlinear; the linear formalism can only fake it
  by exponential enumeration. This is the real frontier, shared by every proposal — including the
  deck's own equations — and the deck reached it from the other side (its *Interpretation 2* copies
  growing two, three, ... with "the presence of single species undefined"). It is not closed here.
- **Tier-3 has no consumer yet.** The nested-refinable, lock, and DAG relations are recorded but
  fit by no mainstream program; "the format is ready" must not be read as "the pipeline is
  ready."
- **The ragged-ensemble substrate.** The flags make partial branches legible, but the drift of
  dangling alternates is still the refinement programs' problem, worked around with phantom
  residues today.
- **Higher-arity exclusivity** stays an exclusivity-layer gap (a forbidden-tuple reading of
  `_pdbx_state_coexistence`), deliberately kept out of this occupancy category.

---

## References

Primary documentation the round-trip and tier claims rest on:

- Refmac keywords — occupancy groups, `alts complete`/`incomplete`, `occupancy refine`:
  <https://www2.mrc-lmb.cam.ac.uk/groups/murshudov/content/refmac/refmac_keywords.html>
- Servalcat (a Refmac5 controller; passes Refmac occupancy keywords through):
  <https://servalcat.readthedocs.io/en/latest/overview.html>;
  GEMMI/Servalcat restraining Refmac5: <https://pmc.ncbi.nlm.nih.gov/articles/PMC10167671/>
- phenix.refine occupancy — `individual` vs `constrained_group`, and the absence of any
  parent/child hierarchy or cross-group link:
  <https://www.phenix-online.org/documentation/reference/refinement.html>;
  harmonic restraints that tether atoms to initial coordinates:
  <https://phenix-online.org/documentation/faqs/refine.html>
- SHELXL disorder — free-variable site-occupancy coding and the `SUMP` linear restraint
  (Müller tutorial): <https://web.mit.edu/pmueller/www/ACA2007/WK01/Disorder.pdf>;
  instruction reference: <https://shelx.uni-goettingen.de/shelxl_html.php>
- BUSTER `pdb2occ` / `OccGroup` (two-alternate summed occupancy restrained to 1.0):
  <https://www.globalphasing.com/buster/manual/autobuster/manual/autoBUSTER7.html>
- qFit 3 (per-residue Σ = 1, variable conformer counts, ragged ensembles):
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC7737783/>
- The encoding paper (Stephanie et al., *IUCrJ* 2024):
  <https://doi.org/10.1107/S2052252524005098>
- Paul Adams, *Heterogeneity Discussion* (mmCIF working group, May 2026) — the EDO example, the
  three interpretations, the occupancy-constraint equations, and the *What is Needed?* DAG.
  (Working-group deck; `Heterogeneity-mmCIFwg-May-2026.pdf`, not public.)
