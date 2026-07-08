# Evaluating the reconciliation against Stephanie's proposal

*Companion to `_reconciliation-memo.md`. The reconciliation memo argues that one
encoding satisfies both the expressiveness side and the don't-touch-`atom_site` side.
This doc stress-tests that claim. Two sections, as discussed: first, where our proposal
still has holes — what it cannot **robustly yet frugally** express (Martin's phrase),
read against the encoding Slack, the IUCrJ paper, the May-2026 working-group deck,
Dorothee's reply, and Martin's comments; second, a category-by-category comparison of
Stephanie's proposal versus ours, asking honestly whether we are strictly superior or
merely trading off differently.*

---

## What "Stephanie's proposal" refers to here

It is worth being precise, because there are two versions and they are not the same
object. The comparison below keeps both in view rather than strawmanning one.

- **The published form** — the IUCrJ 2024 paper (*Comprehensive encoding of
  conformational and compositional protein structural ensembles through the mmCIF data
  structure*, [doi:10.1107/S2052252524005098](https://doi.org/10.1107/S2052252524005098)).
  Here heterogeneity lives **inside `atom_site`** as two new per-atom axes: a *leveled
  conformational-state* category (state 1 = base, state 2 = heterogeneity within state 1,
  and so on) and a separate *compositional-state* category whose values are `bound` /
  `unbound` / `unknown` per unique non-water component. The altloc folds into
  conformational-state-1; nesting is carried by the leveling (a level-2 class sums to the
  occupancy of its level-1 parent); states are REGEX-identifiable and carry a description.
  The paper's headline thesis is *separating conformational from compositional
  heterogeneity* so the two can be data-mined apart.

- **The working-group form** — the version the reconciliation actually responds to, and
  the one the May-2026 deck dissects: a per-atom `_atom_site.pdbx_heterogeneity_id`, a
  `_pdbx_heterogeneity_hierarchy` loop (`name, parent, id, details`), and a
  `_pdbx_state_coexistence` loop (`id, rule ∈ {AND, OR, NOT}, het_id, het_ids,
  description`). This is the form Ezra flagged as inducing a circular graph, that Martin
  asked to simplify, and that the deck shows is ambiguous.

**Ours** is the fourth reading from the memo: `atom_site` untouched; membership in
`_pdbx_alt_groups` (residue-range, with an optional `label_atom_id` escape hatch);
`_pdbx_heterogeneity_hierarchy` (`alt_group_id, coexistence_group_id,
parent_alt_groups_id`) carrying the tree and the occupancy grouping; and an **optional,
NOT-only** `_pdbx_state_coexistence` used only where two branches genuinely clash.

---

## Section 1 · Holes in our proposal

The reconciliation closes the easy ambiguities cheaply (see the last subsection). What it
does **not** close are a handful of genuinely hard things — and the sharpest way to see
them is to run our format against the documents that already exist, especially the one
example Stephanie chose to showcase.

### 1.1 The frontier hole: the real relationships form a DAG, our hierarchy is a tree

This is the deepest one, and it bites on Stephanie's own flagship example (the EDO /
fragment site in the deck and the paper's supporting material). Strip it to its logic:

```
FIGURE — the EDO site as the deck draws it

   site 1 (one pocket):   EDO1   xor   Ligand        (NOT EDO1 Ligand)
   site 2 (one pocket):   EDO2   xor   EDO3          (NOT EDO2 EDO3)

   but the two pockets are NOT independent — the deck lists couplings:
     EDO1 interacts-with EDO2,  EDO1 interacts-with EDO3
     Ligand interacts-with EDO2, Ligand interacts-with EDO3
     and possibly  O(EDO1) = O(EDO2)+O(EDO3),  O(Ligand) = O(EDO2)+O(EDO3)

   so EDO2 relates UPWARD to BOTH EDO1 and Ligand:

                         Base
                    ┌─────┴─────┐
                  EDO1        Ligand
                    │  ╲      ╱  │
                    │   ╲    ╱   │
                    │    ╲  ╱    │
                  EDO2    ╲╱    EDO3       <- EDO2 has TWO parents. Not a tree.
                          ╱╲
```

A hierarchy gives every node exactly one parent. Our format can express **either** of two
projections of this DAG, never both at once:

- Make `EDO2`/`EDO3` children of `EDO1`. Then nesting gives us
  `O(EDO2)+O(EDO3) = O(EDO1)` for free — but the file now asserts EDO2/EDO3 belong to the
  EDO1 branch and says nothing about their relationship to the Ligand.
- Make `site_1 = {EDO1, Ligand}` and `site_2 = {EDO2, EDO3}` two independent occupancy
  groups under `base` (the clean, frugal reading — exactly our Case B+). Then the two
  pockets are declared *independent*, and every cross-pocket coupling the deck lists is
  thrown away.

This is precisely Ezra's "circular graph" objection resurfacing, and it is the same thing
our own **Honest gaps** bullet calls *cross-branch occupancy locking*. The reconciliation
did not solve it; it inherited it. The honest statement is: **a tree-plus-pairwise-NOT
cannot frugally represent a coupling that is genuinely many-to-many across branches.** The
only representations that can are (a) a real DAG in the hierarchy — which Ezra rejected and
which breaks "one parent," or (b) an explicit constraint list (occupancy equations as
rows), which is no longer frugal and starts to look like re-encoding the refinement
restraint file in the deposition.

Frugal **or** robust, here — not both. That is the boundary Martin was pointing at.

*Update: the companion `_reconciliation_memo_occupancy.md` takes option (b) — the explicit
occupancy-equation list — and makes it portable rather than a re-encoded restraint file: a
`_pdbx_occupancy_constraint` `linear` row carries the DAG and `equals_group` the cross-branch
lock, as tier-3 spec no program fits yet. That moves this boundary from "inexpressible" to
"expressible but unfrugal and unfitted," and relocates the genuinely irreducible line to the
**product** (independent) coupling, which no linear equation list reaches either — see that
doc's closing example.*

### 1.2 The deck's ambiguity test, applied to us

The May-2026 deck's whole argument is that one set of tables admits three physical
interpretations, and it names what stays unclear: **occupancy relationships** and the
**existence of single species**. Run the same test on our format:

- *Within-group exclusivity* — **resolved.** Siblings sharing a `coexistence_group_id` are
  mutually exclusive by construction; we do not need the deck's `NOT` rows for this, and we
  dropped `OR`/`AND` entirely, which removes the "what does OR even mean" ambiguity the
  deck circled.
- *Parent/child occupancy* — **resolved.** Nesting states `O(children) = O(parent)`
  explicitly; the deck's "is `O(EDO1) = O(EDO2)+O(EDO3)`?" is answered *iff* the modeller
  chose to nest them (and accepted 1.1's cost).
- *Cross-branch occupancy* — **unresolved**, per 1.1.
- *Existence of single species* — **only partially.** Our format *implies* the legal whole
  molecule states as root-to-leaf paths through the tree, but it never **enumerates** them,
  and for any real DAG the tree-path reading is simply wrong (it will offer combinations
  that do not occur, or hide ones that do). The deck explicitly lists "existence of single
  species" as a thing the tables should but do not pin down; we improve on the
  AND/OR/NOT version but we do not produce the actual list of co-occurring species either.

So against the deck's own rubric we are **more robust than the working-group form** (the
AND/OR ambiguity is gone) but **not complete**: two of the four unclear items survive, and
they are the two that need a DAG.

### 1.3 We collapsed the conformational/compositional axis that the paper made explicit

This is the place we are arguably a **regression**, and it deserves to be stated plainly
rather than buried. The published paper's central design move is to put compositional
heterogeneity (`bound`/`unbound`/`unknown`) in its **own** per-atom column, orthogonal to
the conformational-state column, *specifically so the two can be disentangled by
data-mining* — that is the stated motivation, the "AlphaFold for ensembles" pitch.

Our format has no compositional axis at all. `apo` and `bound` are just nodes in the same
`_pdbx_heterogeneity_hierarchy` as a rotamer flip; nothing marks them as
*compositional* rather than *conformational*. This is frugal and it composes correctly,
but it means:

- a data-miner cannot ask "give me every atom modelled in a bound state across the PDB" by
  reading one column — they must walk each file's hierarchy and *know* which nodes are
  compositional;
- there is no equivalent of the paper's **`unknown`** value — the "this atom is present but
  we are not asserting which compositional state it is in" marker, which the paper notes is
  the common case for atoms far from a binding site. In ours such an atom is just `base`,
  which conflates "not heterogeneous" with "heterogeneous but unassigned."

If the project's north star is machine-mineable separation of the two heterogeneity types
(it is, in the paper's framing), folding them into one tree trades that away for frugality.
That is a real tradeoff, not a free win.

*Update: `_reconciliation_memo_occupancy.md` folds in the buy-back — an optional
`_pdbx_heterogeneity_hierarchy.state_kind` ∈ `conformational | compositional | unknown | .`
column — which restores the data-mineable split and the paper's `unknown` stance ("present but
unassigned," distinct from `base`) at one optional column, so this stops being a regression.*

### 1.4 Tier-3 nested occupancy is both new and unimplemented — the refinement risk

The reconciliation is honest that nested occupancy *refinement* is new. The Slack makes the
risk concrete and worth restating as a hole, not a footnote: per the 12 June meeting,
**Phenix today has no mechanism to represent inter-occupancy relationships in a hierarchy
— no way to describe a tree where a parent is 0.5 and the children are 0.25 each.** Our
Tier 3 is exactly that relationship. We record something no mainstream refinement program
can currently consume.

Worse, the same thread surfaces a second-order problem our format does not touch: **dangling
alt-loc labels drift in space without restraints** (a label `C` with no prior matching
residue has nothing pinning it), and the current workarounds are ugly — a phantom residue
at zero occupancy with a harmonic restraint, or forcing every residue to carry the same
number of states (manufacturing false redundancy). Our grouping names the relationship but
provides no restraint substrate; we make the *intent* legible without making the *fit*
tractable. That gap is owned by the refinement programs, but it is a hole in the sense that
"the format is ready" overstates how ready the pipeline is.

### 1.5 Smaller holes, named so they are not surprises

- **Higher-arity exclusions.** `NOT` is pairwise. "These three may co-occur in any pair but
  never all three at once" cannot be said with pair rows; it needs a forbidden-*tuple*
  reading the dictionary would have to spell out. Rare, but real.
- **Metal/`struct_conn` bookkeeping.** Detailed now in the memo's addendum: the membership
  loop and the `metalc` records are two independent pointers into `atom_site` that nothing
  forces to agree. Localised to Case D, but unautomated.
- **Escape-hatch verbosity.** At genuine atom granularity (Case B+), `label_atom_id` forces
  one row per atom. Stephanie's per-atom column is uniformly atom-granular at no extra
  verbosity; we pay rows for the rare case. Cheap in practice, but it is the price of not
  touching `atom_site`.
- **Example discipline is a process, not a format property.** Dorothee's reply killed the
  earlier whitepaper not on concept but on *internal inconsistency* — text, figure, and CIF
  encoding three different structures; a panel referenced that did not exist; a ligand
  placed in absent density. Our memo deliberately keeps text/figure/CIF aligned per case,
  but nothing about the format enforces that; the next person to extend it can reintroduce
  exactly the inconsistency that lost the refinement groups the first time. Worth a checklist
  in the repo, not just good intentions.

### 1.6 In proportion: what we did frugally fix

So the residual holes are read in context: the reconciliation **does** cheaply close the
ambiguities that were actually blocking. It removes the AND/OR semantics the deck found
un-interpretable (NOT-only, plus implicit exclusivity from the tree); it leaves `atom_site`
untouched, which is Martin's and gemmi's precondition; it makes within-group exclusivity and
parent/child occupancy explicit instead of inferred. What remains unfixed — the DAG, the
enumerated species, the compositional-axis separation, tier-3 implementation — are the
genuinely hard ones, and (the DAG and enumeration aside) they are **shared with Stephanie's
proposal**, not introduced by ours. The reconciliation's contribution is to shrink the
problem to its irreducible core, not to claim the core is solved.

---

## Section 2 · Category-by-category: Stephanie's proposal versus ours

The axis of comparison is "what mechanism carries each piece of meaning, and which form
carries it better." Verdicts are one of: **we are stronger**, **Stephanie is stronger**,
**tradeoff** (different, not better), or **tie / both fail**. The comparison is against the
working-group form except where the published-paper form differs materially, in which case
both are noted.

| Capability | Stephanie's proposal | Ours (reconciliation) | Verdict |
|---|---|---|---|
| **`atom_site` invasiveness** | New per-atom column(s): `pdbx_heterogeneity_id` (WG form); leveled conformational-state + compositional-state columns (paper). | `atom_site` untouched; reuses `label_alt_id`. | **We are stronger** — this was gemmi/Refmac's hard precondition. |
| **State-membership mechanism** | Per-atom label: every atom literally carries its state id. | Side table `_pdbx_alt_groups` selecting rows by (chain, seq-range, altloc). | **Tradeoff** — per-atom is direct and self-contained; side-table keeps coordinates clean but adds an indirection to resolve. |
| **Granularity** | Atom-level everywhere, uniformly, for free. | Residue-range by default; atom-level via the optional `label_atom_id` (one row per atom). | **Tradeoff** — they are uniformly fine-grained; we are coarse-by-default, fine-on-demand, which is more frugal in the common case and more verbose in the rare one. |
| **Hierarchy / nesting** | Leveling (paper) or `parent` pointer (WG form); nesting carried implicitly. | Explicit `parent_alt_groups_id`, with `coexistence_group_id` separating "tree position" from "occupancy group." | **We are stronger** — splitting parent from coexistence-group is what makes the exclusivity fall out cleanly. |
| **Mutual exclusivity** | Explicit `NOT` rows; plus `AND`/`OR` whose meaning the deck showed is ambiguous. | Implicit from a shared `coexistence_group_id`; explicit `NOT` kept only for cross-branch clashes. | **We are stronger on robustness** — dropping AND/OR removes the deck's core ambiguity; exclusivity is mostly free. |
| **Occupancy relationships** | Stated as refinement restraints in prose; the deck found the table cannot pin them. | Parent/child sum (`O(children)=O(parent)`) is explicit; within-group sum is explicit. | **We are stronger for tree-shaped couplings; tie (both fail) for cross-branch** (§1.1). |
| **Compositional vs conformational separation** | First-class: a dedicated compositional column with `bound`/`unbound`/`unknown`, designed for data-mining. | None — compositional states are ordinary hierarchy nodes. | **Stephanie is stronger** — this is her paper's whole thesis and we trade it for frugality (§1.3). |
| **The "absent / unknown" state** | The `unknown` value gives every atom a compositional stance, incl. "present but unassigned." | The absent ligand gets a *home* (the `apo` node); but no "present-but-unassigned" marker — such atoms are just `base`. | **Tradeoff** — we solve "absence has nowhere to attach"; they additionally express "present but agnostic," which we cannot. |
| **Cross-branch / many-to-many (DAG) coupling** | Cannot express (tree + pairwise rules). | Cannot express (tree + pairwise NOT). | **Tie — both fail.** The irreducible core. |
| **Connectivity / bonds (`struct_conn`)** | Not addressed; same hand-consistency issue would arise. | Not solved, but localised and documented (addendum): two pointers into `atom_site` to keep in sync at metal sites. | **We are marginally stronger** — same cost, but named and bounded rather than latent. |
| **Ambiguity / robustness (the deck's 3-interpretations test)** | Fails it (the deck's entire point). | Passes for exclusivity and parent/child occupancy; partial on "single-species existence." | **We are stronger**, though not complete. |
| **Software burden / backward compatibility** | New `atom_site` columns ⇒ every reader must change to parse a valid file; refinement must learn the new state semantics. | Three opt-in tiers: ignore (unchanged `atom_site` refines as today), flat (maps onto existing occupancy groups), nested (new). | **We are stronger** — graceful degradation; a naive reader still gets a valid structure. |
| **Frugality (bytes / new categories)** | One column is conceptually minimal but multiplies across every atom and forces a global format change. | Two small side loops + one optional usually-empty loop; sparse; zero cost on single-conformer files. | **We are stronger** in the common case; roughly even at full atom granularity. |

### The verdict in prose

We are **not strictly superior**, and claiming so would be the same overreach that sank the
first whitepaper. The honest summary is three buckets.

**Where we are clearly stronger:** non-invasiveness (`atom_site` untouched), robustness
against the deck's ambiguity (NOT-only, exclusivity-from-tree), graceful software
adoption (the three tiers), and frugality on ordinary files. These are exactly the axes the
*refinement and library* constituencies — Martin, gemmi, Phenix, the working group — pushed
on, which is why the reconciliation reads as satisfying both sides: it concedes the
expressiveness fight nowhere important while winning every implementation objection.

**Where Stephanie is stronger, and we genuinely trade off:** the explicit separation of
compositional from conformational heterogeneity, including the `unknown` stance. That
separation is the paper's reason for existing and the basis of its data-mining pitch, and we
dissolve it into a single tree. If that separation is a hard requirement, our format needs a
small addition (a per-node "kind" tag: conformational / compositional) before it is a true
superset — without it we are more frugal but strictly less expressive on that one axis. This
is the single most important thing to resolve before calling the reconciliation a superset
rather than a different point on the curve.

**Where neither wins:** the DAG of cross-branch couplings and the enumerated list of
co-occurring single species. Both proposals are trees with pairwise side-rules; both can
only project the DAG, not hold it. This is not a defect of either design so much as the
actual frontier — and it is the thing to walk into the next working-group meeting naming
explicitly, because every "can your format do X" question that has real teeth reduces to it.

A one-line characterization: **against the working-group form we are a robustness-and-cost
win at no real expressiveness loss; against the published paper we are a robustness-and-cost
win that currently gives back the one thing the paper most wanted — the conformational /
compositional split — which we should buy back with a single optional tag rather than
pretend we never lost.**
