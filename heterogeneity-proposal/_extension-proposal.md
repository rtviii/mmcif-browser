# Proposal: extend the reconciliation for topology and occupancy

*Standalone proposal. It does not modify `_reconciliation-memo.md` or
`_reconciliation_memo_occupancy.md`; it is a recommendation for how their next revision could
evolve, in light of two clarifications. First, the only hard non-invasiveness constraint is that
`_atom_site` stays untouched — the number of side tables and rows is not itself a cost, so the
design should be optimised for full specification and machine-readability, not byte count. Second,
occupancy relationships should be recorded as relational, typed ties over state names, not as
algebraic equations. The proposal also adopts the directed-acyclic-graph (DAG) topology that the
2026 working-group analysis identified as the intended structure.*

---

## Governing principle, restated

`_atom_site` is the one sacred table: adding a mandatory per-atom column there forces every reader
and every refinement program to change how it parses coordinates, which is the objection the
library/consumer constituency will not move on. Everything else — additional categories, additional
rows, an extra join to resolve — is cheap by comparison and does not break a naive reader.

Two consequences follow, and they are what this proposal turns on:

1. There is no reason to project a richer relational structure down to a tree to save space. If the
   intended topology is a DAG, encode a DAG.
2. There is no reason to compress occupancy semantics into a terse flag if a fuller, more explicit
   table reads more clearly and validates more easily.

## What carries over unchanged

The reconciliation's spine is kept: `_pdbx_alt_groups` for membership (which atoms constitute each
named state, by residue range and altloc, with the optional `label_atom_id` atom-level escape
hatch); mutual exclusivity from a shared coexistence group; the optional `_pdbx_state_coexistence`
NOT list for cross-branch clashes; the `state_kind` tag (`conformational | compositional |
unknown`); the three-tier adoption model (ignore / flat occupancy groups / nested); and the
round-trip onto Refmac occupancy-group semantics. The four deltas below sit on top of that.

---

## Delta A — let the hierarchy be a DAG

The single-parent column `parent_alt_groups_id` forces a tree: every state has exactly one parent.
The intended structure is often not a tree — a state can co-occur with, and therefore be a child
of, more than one parent (the two-pocket case, where a bottom-pocket occupant relates upward to
both top-pocket occupants). A tree can only project such a structure, discarding one edge.

Replace the single-parent column with a small **edges** table, so a state may declare any number of
parents:

```
loop_
_pdbx_heterogeneity_edge.child_id      # -> a state
_pdbx_heterogeneity_edge.parent_id     # -> a state, or 'base'
```

A state with two parents contributes two rows; a root points at `base`. This is the DAG the
working-group "what is needed" analysis draws, encoded directly rather than approximated. (Lower-
churn alternative, if a new category is unwelcome: keep `parent_alt_groups_id` but permit multiple
`_pdbx_heterogeneity_hierarchy` rows per state, one per parent. The edges table is cleaner because
it does not duplicate a state's other columns across its parent rows.)

An edge asserts **topology** only — co-occurrence and nesting, and the inheritance of exclusivity
down the graph. It deliberately says nothing about magnitudes; those are Delta B.

## Delta B — record occupancy relationships as typed ties, not equations

An earlier sketch encoded occupancy relationships as linear equations with per-term coefficients.
That reads as algebra embedded in a relational format, and it is more general than the real cases
need. Every occupancy relationship that actually occurs is one of two shapes: **a set of states
whose occupancies sum to another state's**, or **two states constrained equal**. Both are
expressible as data — a typed relationship over state names, with no coefficients:

```
loop_
_pdbx_occupancy_relationship.id
_pdbx_occupancy_relationship.type       # sum_to | equal
_pdbx_occupancy_relationship.target     # -> the state the members sum to / are equal to
_pdbx_occupancy_relationship.enforced   # constraint | restraint | annotation
_pdbx_occupancy_relationship.details
#
loop_
_pdbx_occupancy_relationship_member.relationship_id   # -> _pdbx_occupancy_relationship.id
_pdbx_occupancy_relationship_member.state_id           # -> a state
```

- `sum_to` — the member states' occupancies sum to the `target` state's. The cross-pocket coupling
  `O(EDO1) = O(EDO2) + O(EDO3)` becomes one relationship with members `{EDO2, EDO3}` and target
  `EDO1`. No coefficients, no arithmetic in the file — a set and a target, exactly the shape of a
  refinement "occupancy group."
- `equal` — the (two) members are constrained to equal occupancy. The cross-branch lock.

The within-group "these alternatives sum to their parent" case does **not** need this table; it
stays a completeness flag on the coexistence group (below), because it is the ubiquitous default
and a flag is the clearest way to say it. The relationship table is for the ties a single group
cannot express — the cross-group couplings, which are exactly the "more information is needed"
items the working-group analysis flagged.

`enforced` records whether the depositing program treated the tie as a hard constraint, a soft
restraint, or an assertion no program fits yet — the field that makes the specification portable
rather than a transcription of one program's script.

## Delta C — independence is the default

If two states (or groups) carry **no** relationship between them, they are **independent**: the
joint probability of any combination is the product of the marginals, and a consumer computes it on
demand by multiplying. Nothing is recorded. This is the common case — most heterogeneous sites in a
structure are unrelated — and it costs zero rows. Correlations are the marked case; independence is
the unmarked default. Stating this explicitly in the dictionary is what makes a file's silence
meaningful rather than ambiguous.

## Delta D — nonlinear (product) coupling is out of scope, stated plainly

The relationship vocabulary is linear: sums and equalities. A feature whose occupancy is a genuine
**product** of independent events — an ordered water present only when two independent side chains
are both "in", so `O(water) = O(sc1) x O(sc2)` — cannot be written as a sum-based relationship, and
is left as an ordinary free or fixed occupancy, exactly as every refinement program leaves it
today. This is named, not solved: no constituency has asked to constrain such a species, and none
can fit it. Recording the honest boundary prevents the "the format is complete" overclaim.

---

## The revised category set

```
_atom_site                          UNCHANGED (the sole hard constraint)
_pdbx_alt_groups                    membership: atoms -> named state   (unchanged)
_pdbx_heterogeneity_state           the states: state_id, coexistence_group_id,
                                    occupancy_value, occupancy_refine_flag, state_kind
_pdbx_coexistence_group             coexistence_group_id, completeness (complete|incomplete|single)
_pdbx_heterogeneity_edge            the DAG: child_id, parent_id            (Delta A)
_pdbx_occupancy_relationship (+_member)  cross-group ties: sum_to|equal     (Delta B)
_pdbx_state_coexistence             optional NOT list for cross-branch clashes  (unchanged)
```

`_pdbx_heterogeneity_state` is the old `_pdbx_heterogeneity_hierarchy` with the parent column
removed (it moved to `_pdbx_heterogeneity_edge`) and the occupancy metadata retained;
`_pdbx_coexistence_group` hoists the completeness flag out of the per-state rows so siblings cannot
disagree.

## Worked example: the two-pocket (EDO) site

Top pocket (residue 501): `EDO1` (0.5) or `Ligand` (0.5), exclusive, complete. Bottom pocket
(residue 502): `EDO2` (0.3) or `EDO3` (0.2), exclusive, and occupied **only** in copies that have
`EDO1` up top — so `O(EDO2) + O(EDO3) = 0.5 = O(EDO1)`, and the bottom pocket is empty the other
half of the time (incomplete). Occupancy values themselves live per-atom in `_atom_site`; the tables
below carry identity, topology, exclusivity, and the one cross-pocket tie.

```
loop_
_pdbx_alt_groups.id
_pdbx_alt_groups.alt_group_id
_pdbx_alt_groups.auth_asym_id
_pdbx_alt_groups.auth_seq_id_start
_pdbx_alt_groups.auth_seq_id_end
_pdbx_alt_groups.label_alt_id
_pdbx_alt_groups.label_atom_id
1 Ligand A 501 501 A .
2 EDO1   A 501 501 B .
3 EDO2   A 502 502 C .
4 EDO3   A 502 502 D .
#
loop_
_pdbx_heterogeneity_state.state_id
_pdbx_heterogeneity_state.coexistence_group_id
_pdbx_heterogeneity_state.occupancy_value
_pdbx_heterogeneity_state.occupancy_refine_flag
_pdbx_heterogeneity_state.state_kind
base   .          1.0 fixed   .
Ligand top_pocket .   refined compositional
EDO1   top_pocket .   refined compositional
EDO2   bot_pocket .   refined compositional
EDO3   bot_pocket .   refined compositional
#
loop_
_pdbx_coexistence_group.coexistence_group_id
_pdbx_coexistence_group.completeness
top_pocket complete
bot_pocket incomplete
#
loop_
_pdbx_heterogeneity_edge.child_id
_pdbx_heterogeneity_edge.parent_id
Ligand base
EDO1   base
EDO2   EDO1
EDO3   EDO1
#
loop_
_pdbx_occupancy_relationship.id
_pdbx_occupancy_relationship.type
_pdbx_occupancy_relationship.target
_pdbx_occupancy_relationship.enforced
_pdbx_occupancy_relationship.details
1 sum_to EDO1 annotation 'bottom pocket occupied only within the EDO1 population'
#
loop_
_pdbx_occupancy_relationship_member.relationship_id
_pdbx_occupancy_relationship_member.state_id
1 EDO2
1 EDO3
```

How it reads: `_pdbx_alt_groups` says which atoms are each state. `_pdbx_heterogeneity_state` +
`_pdbx_coexistence_group` say the two pockets are each a mutually-exclusive set, the top complete
(sums to 1), the bottom incomplete (sums to less, the rest empty). `_pdbx_heterogeneity_edge` says
the bottom occupants sit within the `EDO1` population. The one `sum_to` relationship pins the
magnitude the topology cannot: `O(EDO2) + O(EDO3) = O(EDO1)`. Independence is nowhere stated because
nothing here is independent; had the two pockets been unrelated, the edges to `EDO1` and the
relationship row would simply be absent, and a consumer would multiply marginals.

**The DAG variant.** If the bottom pocket were occupied within *both* top populations — some
Ligand-bearing copies also carrying `EDO2`/`EDO3` — then `EDO2` and `EDO3` each gain a second parent:

```
   ... additional edges:
   EDO2 Ligand
   EDO3 Ligand
```

Now `EDO2` has two parents (`EDO1` and `Ligand`): a genuine DAG, which the edges table holds without
strain. The split of the `EDO2` population between its two parents is then one further `sum_to`
relationship. This is the case a tree cannot represent and the reason Delta A is worth its table.

## What this buys, relative to the occupancy companion

- **Honest topology.** The DAG the analysis says is intended is encoded directly, not projected onto
  a tree and patched.
- **Relational, not algebraic.** Occupancy ties are typed relationships over state names
  (`sum_to`, `equal`) — the same mental model as a refinement occupancy group — with no coefficients
  or embedded equations.
- **Independence made cheap and explicit.** The common uncorrelated case costs nothing and is no
  longer ambiguous; silence means "independent" by dictionary rule.
- **The boundary named.** The product case is stated as out of scope in one sentence, so the format
  does not overclaim.
- **Refinement mapping preserved.** `complete`/`incomplete` still round-trip onto Refmac occupancy
  groups; `sum_to`/`equal`/nested ties remain tier-3 (recorded, not yet fit by any program), which
  is the same honest position as before.

## Open choices for the next revision

Three genuine decisions worth settling when this is folded in:

1. **Edges table vs multi-row parent.** A dedicated `_pdbx_heterogeneity_edge` category (clean, DAG-
   native) versus permitting multiple parent rows in the existing hierarchy category (no new
   category, but denormalised). Recommendation: the edges table.
2. **Completeness: flag vs relationship.** Keeping `complete`/`incomplete` as a flag on the
   coexistence group (terse, matches Refmac) versus expressing even the within-group sum as a
   `sum_to` relationship (uniform, one mechanism for all occupancy semantics). Recommendation: the
   flag, with the relationship table reserved for cross-group ties.
3. **Exclusivity: keep the NOT list, or fold `excludes` into relationships.** Whether cross-branch
   exclusions stay in `_pdbx_state_coexistence` or become another relationship type. Recommendation:
   keep them separate — logical exclusivity and numeric occupancy are different concerns and
   validate more cleanly apart.
