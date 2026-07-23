# Consolidating the proposal: the minimal core and the one escape hatch that earns its place

This is a working document, not a rewrite of the page. It traces the two hardest sections of
the current proposal — the exclusion list and the graph-the-tree-cannot-hold — forward from
where they start to overreach, and proposes the smallest scheme that actually settles the
two-pocket EDO case. The test throughout is a single question: can the format say how likely a
particular combination of alternates is? Everything the current proposal adds beyond the tree is
aimed at that question, and none of it answers it. One small table does.

## What the current proposal carries, and what this reconsiders

The proposal has a frugal spine everyone agrees on: a membership table naming which atoms make
up each network, a hierarchy table placing each network in a tree and an occupancy group, and an
optional NOT list for the rare cross-branch clash. On top of that spine it adds, for the
occupancy story, an equation category (`_pdbx_occupancy_constraint` and its term table) and four
columns on the hierarchy (`occupancy_completeness`, `occupancy_refine_flag`, `occupancy_value`,
`state_kind`).

The spine is kept here unchanged. What this document reconsiders is everything above the spine,
because the case it was built for — the EDO site — is not solved by it.

## The two-pocket case, counted

State the case the way it actually bites. A ligand site has two pockets. The top pocket holds a
fragment ligand or a small ethylene glycol, EDO1. The bottom pocket holds one of two other
glycols, EDO2 or EDO3, or nothing. In the interesting version all six combinations occur, each
with its own frequency.

Six combinations that add to one is five independent numbers to pin down.

What does the deposited file give you? Each atom carries one occupancy. The ligand's atoms say
0.50, EDO1's say 0.50 (and those two are one fact, since they fill one pocket), EDO2's say 0.30,
EDO3's say 0.20. That is three facts: how often the ligand is present, how often EDO2 is
present, how often EDO3 is present.

Three facts, five unknowns. Two numbers are simply missing, and the coordinate table has nowhere
to put them: EDO2's atoms carry the single number 0.30 whether that 0.30 sits mostly with the
ligand up top or mostly with EDO1 up top. The file cannot tell those apart.

Now look at what each proposed mechanism supplies against that shortfall.

| mechanism | what it asserts | new numbers it supplies |
|---|---|---|
| the atom occupancies | how often each component is present | three (already in the file) |
| tree, bottom pocket under base | the two pockets are independent | fixes the two by multiplying — a specific guess |
| tree, bottom pocket under EDO1 | the ligand never co-occurs with the bottom pocket | fixes the two at zero — a different guess |
| a DAG edge (bottom pocket answers to both) | the bottom pocket occurs under both tops | none |
| a linear occupancy constraint | an equation among the three numbers above | none |
| a list of combinations, each with an occupancy | the frequency of each real combination | five — the case is determined |

Two rows in that table are the whole argument.

The DAG edge carries no number. Saying EDO2 answers to both EDO1 and the ligand is true and adds
nothing quantitative; it cannot say 0.25 of EDO2 sits under EDO1 and 0.05 under the ligand. The
extension proposal half-concedes this — it notes that the split of EDO2's population between its
two parents is "one further sum_to relationship" — but a sum_to has no per-branch value, so to
say how much sits under each parent you must name the two sub-populations, and once they are
named you have written the combinations out and the DAG did no work.

The linear constraint carries no number either. Every term in it is a marginal, a sum over atom
occupancies already in the file. So the equation relates numbers the file already has. It is
arithmetically checkable and adds no degree of freedom. That is why it cannot remove an
impossible combination from any reading of the file: an equation about how often EDO2 appears has
no authority over which combinations EDO2 appears in.

The clinching demonstration is one table. Here are three physically different sites:

| combination | independent pockets | bottom only under EDO1 | the differential case |
|---|---|---|---|
| ligand + EDO2 | 0.15 | 0 | 0.05 |
| ligand + EDO3 | 0.10 | 0 | 0.15 |
| ligand alone | 0.25 | 0.50 | 0.30 |
| EDO1 + EDO2 | 0.15 | 0.30 | 0.25 |
| EDO1 + EDO3 | 0.10 | 0.20 | 0.05 |
| EDO1 alone | 0.25 | 0 | 0.20 |

All three deposit byte-identical atom occupancies: ligand 0.50, EDO1 0.50, EDO2 0.30, EDO3 0.20.
All three also satisfy the equation "occupancy of EDO1 equals occupancy of EDO2 plus occupancy of
EDO3," so the linear constraint row is true in every one of them and distinguishes none. The only
thing that separates these three sites is a number per combination. That is the missing capability,
and it is the one the deck asked for when it listed "existence of single species" as unresolved.

## The fix: a species list, and four rules

A species is one complete combination of alternates — one way the whole structure can actually
be, with an occupancy. The scheme is four rules and nothing else:

1. A species is a complete description of one copy of the structure. Every network present in
   that copy is listed; anything not listed is absent. The always-present single-conformer part,
   base, is present in every species and is never listed.
2. A network's atom occupancy equals the sum of the occupancies of every species that lists it.
3. The species in one correlated cluster sum to one.
4. Different clusters are independent. Their species are never enumerated together; a consumer
   that wants a cross-cluster combination multiplies.

Rule 2 is the hinge, and it answers the question that is hardest to hold in your head: how an
item's single deposited occupancy relates to the several combinations it takes part in. You do
not tag the atoms and you do not duplicate them. The atoms keep carrying the total; the species
list says how the total divides; rule 2 ties the two together and doubles as the validator that
catches a file whose combinations do not add up to its atoms.

Rule 1 quietly removes the need for a completeness flag. "A 0.30 ligand with a hidden
complementary state" versus "a 0.30 ligand with none" is no longer a flag to set — either there
is a species in which the ligand is absent, or there is not.

## The scheme, in full

Kept from the current proposal, unchanged:

- The membership table (`_pdbx_alt_groups`) — which atoms make up each network, by chain,
  residue range and altloc letter, with the optional `label_atom_id` for the sub-residue case.
- The hierarchy table (`_pdbx_heterogeneity_hierarchy`) at exactly three columns — the network,
  its coexistence (occupancy) group, and its parent.
- The exclusion list (`_pdbx_state_coexistence`), a sparse NOT-only list for the cross-branch
  clash the tree cannot imply.

Added, replacing the constraint machinery:

- A species table — an id, the cluster it belongs to, its occupancy, and a free-text detail.
- A species-member table — one row per (species, network) pair.

Dropped:

- `_pdbx_occupancy_constraint` and `_pdbx_occupancy_constraint_term`. Their equation types relate
  marginals already in the file, add no degree of freedom, and cannot express the differential
  case they were introduced for. The species list expresses it directly.
- `occupancy_completeness` — derivable; a species in which a site is empty either exists or does
  not, and the sum-to-one-or-less question is visible in the numbers.
- `occupancy_value` — redundant with the atom occupancy.
- `occupancy_refine_flag` — refinement provenance (was this number refined or held fixed). That
  is metadata about how the file was produced, not a relationship between components, and it
  belongs with refinement metadata rather than in the heterogeneity description.
- `state_kind` (conformational / compositional / unknown) — a real idea but a separable one. It
  is a data-mining label orthogonal to positioning, exclusion and occupancy, and it is the one
  dropped item with a genuine constituency (it is the thesis of Stephanie's paper). It should be
  decided on its own as one optional tag, not carried as part of solving the occupancy case. Park
  it, do not silently delete it.

The size trade:

| | categories | items | expresses differential occupancy |
|---|---|---|---|
| current proposal | five | 27 | no |
| this scheme | five | about 17 | yes |

The constraint pair (nine items, and inert — it relates numbers already present) is swapped for
the species pair (four items, load-bearing). The item count drops and the capability goes up.

## Worked examples

### The EDO site, differential

Story: the ligand's ring crowds the bottom pocket, so when the ligand is up top the bottom pocket
is usually empty and, when filled, prefers the pose leaning away (EDO3); when the small glycol
EDO1 is up top the bottom pocket is usually filled and prefers EDO2.

```
            Ligand (.50)                          EDO1 (.50)
           /     |     \                         /     |     \
        .05     .15    .30                    .25     .05    .20
         /       |       \                     /       |       \
      EDO2     EDO3     none               EDO2      EDO3     none

      EDO2 total:  .05 + .25 = .30     the single number the atoms carry
      EDO3 total:  .15 + .05 = .20     the single number the atoms carry
```

This picture is the deck's own drawing. The topology was never the problem. The problem is where
the numbers sit: the atom table puts them on the nodes, and a DAG edge has nowhere to put one at
all. Put a number on each path and the case is fully specified. The DAG was the right picture
with the numbers in the wrong place.

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
_pdbx_heterogeneity_hierarchy.alt_group_id
_pdbx_heterogeneity_hierarchy.coexistence_group_id
_pdbx_heterogeneity_hierarchy.parent_alt_groups_id
Ligand top_pocket .
EDO1   top_pocket .
EDO2   bot_pocket .
EDO3   bot_pocket .
#
loop_
_pdbx_het_species.id
_pdbx_het_species.cluster_id
_pdbx_het_species.occupancy
_pdbx_het_species.details
1 edo_site 0.05 'ligand up top, EDO2 below (rare; the ring crowds the pocket)'
2 edo_site 0.15 'ligand up top, EDO3 below'
3 edo_site 0.30 'ligand up top, bottom pocket empty'
4 edo_site 0.25 'EDO1 up top, EDO2 below (the majority species)'
5 edo_site 0.05 'EDO1 up top, EDO3 below'
6 edo_site 0.20 'EDO1 up top, bottom pocket empty'
#
loop_
_pdbx_het_species_member.species_id
_pdbx_het_species_member.alt_group_id
1 Ligand
1 EDO2
2 Ligand
2 EDO3
3 Ligand
4 EDO1
4 EDO2
5 EDO1
5 EDO3
6 EDO1
#
```

Species 3 and 6 list a single network. An empty pocket costs no row: absence is just not being
listed. The two hierarchy rows and the six species rows are both present and both true — see "Two
views" below for why that redundancy is deliberate and how it is kept honest.

### A bridged water — the case a product supposedly cannot express

Ser45 and Thr82 point across a small cavity; an ordered water sits between them and needs a
hydrogen-bond donor from each, so it is present only when both point in. The two side chains are
otherwise independent.

```
              Ser45 in (.60)                    Ser45 out (.40)
               /         \                       /          \
         Thr82 in     Thr82 out            Thr82 in     Thr82 out
          /     \          |                   |             |
      + wat   no wat       |                   |             |
       .24      .06       .30                 .20           .20

      Ser45 in:  .24 + .06 + .30 = .60
      Thr82 in:  .24 + .06 + .20 = .50
      water:     .24
```

```
loop_
_pdbx_alt_groups.id
_pdbx_alt_groups.alt_group_id
_pdbx_alt_groups.auth_asym_id
_pdbx_alt_groups.auth_seq_id_start
_pdbx_alt_groups.auth_seq_id_end
_pdbx_alt_groups.label_alt_id
_pdbx_alt_groups.label_atom_id
1 ser45_in  A 45  45  A .
2 ser45_out A 45  45  B .
3 thr82_in  A 82  82  A .
4 thr82_out A 82  82  B .
5 wat301    A 301 301 A .
#
loop_
_pdbx_heterogeneity_hierarchy.alt_group_id
_pdbx_heterogeneity_hierarchy.coexistence_group_id
_pdbx_heterogeneity_hierarchy.parent_alt_groups_id
ser45_in  ser45_rot .
ser45_out ser45_rot .
thr82_in  thr82_rot .
thr82_out thr82_rot .
wat301    .         .
#
loop_
_pdbx_het_species.id
_pdbx_het_species.cluster_id
_pdbx_het_species.occupancy
_pdbx_het_species.details
1 bridge 0.24 'both side chains in; the bridging water is ordered'
2 bridge 0.06 'both in, but the water is not ordered'
3 bridge 0.30 'Ser45 in, Thr82 out; no donor pair, no water'
4 bridge 0.20 'Ser45 out, Thr82 in; no donor pair, no water'
5 bridge 0.20 'both out'
#
loop_
_pdbx_het_species_member.species_id
_pdbx_het_species_member.alt_group_id
1 ser45_in
1 thr82_in
1 wat301
2 ser45_in
2 thr82_in
3 ser45_in
3 thr82_out
4 ser45_out
4 thr82_in
5 ser45_out
5 thr82_out
#
```

Five rows. The current proposal calls this site the product wall — the water's occupancy is a
product of two independent events, and no sum of group occupancies equals a product. The species
list sidesteps the wall entirely, because it never writes an equation: it writes the answer, 0.24,
as a plain number. It even captures what a product cannot — the water is ordered in 80% of the
both-in copies, not all of them (species 1 versus species 2), which is realistic and which neither
a product nor any equation can state. The wall is an artifact of insisting the format speak in
equations over per-component numbers; drop that insistence and there is no wall.

It is also linear in size, not exponential. Three sites, five species. The two-copies-then-three
explosion the deck hit came from duplicating atoms to carry a joint state; here one set of
coordinates sits in as many species as it needs to.

### 7HHS — where you do not reach for the species list

Real deposited numbers. The pocket is apo at 0.78 or bound at 0.22; the bound ligand is modelled
in two poses at 0.13 and 0.09.

```
            base
           /    \
      apo(.78)  bound(.22)
                  /     \
          pose_1(.13)  pose_2(.09)
```

```
loop_
_pdbx_heterogeneity_hierarchy.alt_group_id
_pdbx_heterogeneity_hierarchy.coexistence_group_id
_pdbx_heterogeneity_hierarchy.parent_alt_groups_id
apo    pocket      base
bound  pocket      base
pose_1 ligand_pose bound
pose_2 ligand_pose bound
#
```

No species list. The tree plus the deposited numbers already give three combinations and their
occupancies with nothing left over: apo at 0.78, bound-with-pose_1 at 0.13, bound-with-pose_2 at
0.09. This is the discipline of the whole scheme — the species list is only for a correlated
cluster whose numbers do not determine themselves, and on the evidence that is rare. Justin's four
exhaustively annotated files needed one NOT row each, or none, and no species list at all.

### A node with its own sub-choice — altlocs and nesting together

If a network at one of these positions has a further internal choice, it splits three ways.

If the sub-choice is just another conformer at the same site, it is another altloc letter, hence
another network, hence a larger site. EDO2 in two conformers makes the bottom pocket a four-option
site instead of three. No new machinery.

If the sub-choice is nested and independent of the cluster — EDO2's hydroxyl leaning up or down,
unrelated to what is up top — it is its own small cluster living inside EDO2, and it costs no
species rows:

```
   the EDO cluster, unchanged: still six species

   a separate cluster inside EDO2:
              EDO2 (.30)
              /        \
        OH_up(.18)   OH_dn(.12)
```

```
loop_
_pdbx_alt_groups.id
_pdbx_alt_groups.alt_group_id
_pdbx_alt_groups.auth_asym_id
_pdbx_alt_groups.auth_seq_id_start
_pdbx_alt_groups.auth_seq_id_end
_pdbx_alt_groups.label_alt_id
_pdbx_alt_groups.label_atom_id
5 OH_up A 502 502 C O2
6 OH_dn A 502 502 E O2
#
loop_
_pdbx_heterogeneity_hierarchy.alt_group_id
_pdbx_heterogeneity_hierarchy.coexistence_group_id
_pdbx_heterogeneity_hierarchy.parent_alt_groups_id
OH_up edo2_oh EDO2
OH_dn edo2_oh EDO2
#
```

A reader wanting "ligand up top, EDO2 below, hydroxyl up" multiplies, by rule 4: 0.05 times
0.18/0.30. If instead the hydroxyl's lean is correlated with what is up top, it joins the cluster
and the species count grows — which is unavoidable, because the information genuinely is there.

Two things fall out of this. First, where you put the rows is itself the assertion: inside the
cluster means correlated, its own cluster means independent, so the file's silence is meaningful.
Second, `OH_up` was carved by atom name, below the altloc letter — the sub-residue case already on
the page — and the species list did not care. Membership granularity and joint occupancy are
orthogonal axes that compose without ever interacting.

## Scale — the part that inverts the worry

The fear is that these tables overtake the atom table on a large structure. Measured against the
worst real case we have, they do not come close.

The team's exhaustively annotated 5E1N is the densest thing available — 52% of its residues carry
alternates, a four-way model at atomic resolution:

| | count |
|---|---|
| atom rows | 6,066 |
| residues | 330 |
| residues with alternates | 171 (52%) |
| distinct networks | 148 |
| membership rows | 180 |
| hierarchy rows | 148 |
| annotation as a share of the atom table | 5.4% |

That is the worst real case, fully annotated, and the annotation is a twentieth of the file.

There are three cost regimes, and only one is multiplicative:

- Independent sites cost one row per network and no species rows.
- A nested cascade, however deep, costs one row per network and no species rows — because nesting
  determines the numbers by itself, exactly like 7HHS. A deep cascade (a water under a rotamer,
  under a domain motion, under a subunit rotation) is a tree, and it is the cheapest thing in the
  scheme: depth is linear, and no species table appears.
- Only partial correlation that is not nesting costs species rows, and only within its own cluster.

The thing that would truly explode — many mutually correlated sites — does not arise, because
things that always move together are one network. Justin says this outright about 3NYD: he grouped
every section sharing one translation into a single group rather than splitting by contiguous
backbone. A large correlated motion is one network with many membership rows; the correlation is
expressed by sharing a name, which is free. The species list is only ever for partial correlation.

Two levels of that cascade example are also simply out of scope, and this is worth saying plainly
rather than letting someone discover it. A TLS group is not an alternate — it is a B-factor
parameterization and produces no networks. A subunit rotation in cryoEM is not an altloc —
ratcheting and tRNA states are separated by 3D classification into distinct maps and deposited as
separate entries. The format's scope is alternates within one model.

The ribosome napkin, using 5E1N's measured ratios:

| | 5E1N, measured | ribosome at 5E1N's density | ribosome, realistic at 2.0 Å |
|---|---|---|---|
| atom rows | 6,066 | 150,000 | 150,000 |
| residues with alternates | 171 (52%) | 6,030 (52%) | 1,160 (10%) |
| networks | 148 | 5,200 | 1,000 |
| membership + hierarchy rows | 328 | 11,500 | 2,230 |
| species + member rows | 0 | not applicable | about 1,050 (estimated) |
| annotation as a share of atom rows | 5.4% | 7.7% | 2.2% |

The middle column is deliberately absurd — nobody resolves alternates on half a ribosome's
residues. Even so it is under 8%. The annotation never overtakes the atom table, and it is not
close. The one estimated cell is the species count, flagged honestly; every annotated file we
actually have needed at most one correlated pair, so the estimate is likely high.

On a binary encoding: BinaryCIF already exists, and these tables are the most compressible thing
in the file — a few hundred distinct short strings over the rows, ideal for dictionary and
run-length encoding. But the atom table compresses too, so binary changes the absolute size and
not the ratio, and the ratio is what anyone would object to. Better to leave it out of the
argument; reaching for it concedes a size problem the measurement says does not exist.

## Two design decisions this settles

Two views, tied by the atom rule. In a correlated cluster the hierarchy rows and the species list
are both present. This is deliberate, not an oversight. The hierarchy is the refinement view — two
ordinary occupancy groups a tier-2 program can already fit today, treating each pocket as summing
to a constant. The species list is the population view — the joint frequencies a reader or a
re-refinement needs. The atom occupancies are the hinge between them, and rule 2 is the validator:
a file whose species do not sum, per network, to its atom occupancies is caught. The redundancy is
the price of giving a refinement program a table it can use instead of nothing; it is bounded, and
it is checkable.

The NOT list survives, as the frugal form. A forbidden combination can be written as a species
list that omits it, but that is not always the cheap way to say it. At the Arg74 site — one
arginine rotamer clashing with one partial-occupancy water — the marginals plus a single "these
two never co-occur" determine everything, so one NOT row beats five species rows. NOT is for "this
combination is impossible"; the species list is for "this combination happens, at this frequency."
This also answers the standing question of whether the exclusion table is redundant and could be
dropped: it is not, and Arg74 is the proof — a rotamer and a solvent site sit in different
branches, no tree edge relates them, and nothing but an explicit row can forbid the clash.

## Corrections owed to the current page

Naming these so they can be fixed when the page is next touched. This is a list, not an
instruction to edit now.

The graph-the-tree-cannot-hold section presents the DAG as the thing that carries the EDO
coupling. It does not: a DAG edge carries no occupancy number, so it cannot distinguish the three
sites in the table above, which is the exact thing the case is about. The honest statement is that
the topology is fine — it is the deck's own picture — but the number lives on the path, not the
edge, and neither a DAG edge nor a linear constraint is where a per-combination number can go.

The same section's constructed example asserts that the linear constraint row "restores the edge
the tree drops." In the file as written (a flat, complete top pocket) that row is arithmetically
true and changes no reading of the state list; in the differential case it is true in all three
distinct sites and so distinguishes none. Either way it does not do what the sentence claims. The
defensible replacement is the species list, which does.

The open-problems section frames the frontier as the product wall. The sharper and more
defensible line is: the format can say a combination is impossible, but without the species list
it cannot say a combination is 30% likely. The bridged-water example shows a product expressed as
a plain number, so the wall is not where the proposal currently draws it.

## What is still open

- The category and column names here (`_pdbx_het_species`, `cluster_id`, and the rest) are
  placeholders for the working group to settle.
- The species-count estimate in the ribosome table is the one unmeasured number in this
  document. The evidence points to it being small, but it is a guess.
- `state_kind` is parked, not resolved. If the compositional-versus-conformational split matters
  to the paper's constituency it comes back as one optional tag, decided on its own.
- Minor spelling on the NOT list: its constant rule column and its singular/plural id pair are
  inherited from a form the proposal otherwise rejects, and could be cleaned up when convenient.
- None of this is ratified, and no refinement program fits the nested case today. The scheme
  makes the intent recordable and portable; it does not make it fittable.
