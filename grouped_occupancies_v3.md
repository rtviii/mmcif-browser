# Grouped occupancies, v3 — states and bundles

A mechanism for correlated occupancy: explicit lists of **states**, grouped into **bundles**.

Everything above this layer plays exactly as described in the website proposal — `_pdbx_alt_groups` (the networks: which atoms move together), `_pdbx_heterogeneity_hierarchy` (which networks are mutually exclusive at one site), and the sparse `NOT` table (`_pdbx_state_coexistence`). The only new thing is the state/bundle pair. 

## Names

- should we possibly rename `_pdbx_state_coexistence` to something like  `_pdbx_forbidden_states`   (it only ever serves the `NOT` now anyway?)

## The two new categories

**`_pdbx_het_state`** — one row per *combination that actually occurs*. A state is a complete
joint assignment: multiple networks present together. Its fields:

- `.id`          — the state's identifier
- `.bundle_id`   — which bundle this state belongs to (see below)
- `.occupancy`   — the **joint** occupancy of the whole combination: the fraction of the ensemble
                   in exactly this state. It is *not* the occupancy of any one member. A single
                   network's occupancy — the number `atom_site` carries — is recovered by summing
                   the occupancies of every state that contains it.
- `.details`     — free text, optional

**`_pdbx_het_state_members`** — the membership join, one row per (state, alt_group) pair, because an
mmCIF cell holds a single value and a state is a set of networks. Its fields:

- `.state_id`      — the state (foreign key into `_pdbx_het_state.id`)
- `.alt_group_id`  — a network in that state (foreign key into `_pdbx_alt_groups`)

**`bundle_id`** is the unit of correlation. Networks whose occupancies are entangled — where knowing
one changes the distribution of another — share a bundle, and the bundle's states enumerate their
joint distribution. Networks in different bundles are independent of each other; their occupancies
multiply and are never enumerated together. The bundle is the mechanism that stops the joint from
spanning the whole structure (see "Does this blow up").


## Example 1 — the two-pocket EDO case (states and a bundle)

Two adjacent pockets in one site. The top pocket holds either a phenol ligand (IPH) or an ethylene
glycol; the bottom pocket holds one of two ethylene glycols or nothing. What the bottom pocket does depends on what sits above it — so the two pockets are one correlated bundle, and the file must say which top occupant goes with which bottom occupant, in what proportion.

```
        TOP = Ligand (.50)                       TOP = EDO1 (.50)
        /       |       \                        /       |       \
     .05      .15      .30                     .25      .05      .20
      |        |        |                        |        |        |
    EDO2     EDO3    (none)                    EDO2     EDO3    (none)   <- BOTTOM

  six states, one bundle, occupancies sum to 1.00

  marginals = what atom_site carries = the column sums over all six states:
    Ligand  .05+.15+.30 = .50        EDO2   .05+.25 = .30
    EDO1    .25+.05+.20 = .50        EDO3   .15+.05 = .20
```

The _marginals alone_ (.50 / .50 / .30 / .20) are what survives in the deposition _today_, and they are consistent with infinitely many different pairings (occupancies are free to adjust). The six joint numbers are the information that is otherwise lost. They are what the" state" table records:

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
Ligand top_pocket
EDO1   top_pocket
EDO2   bot_pocket
EDO3   bot_pocket
#
loop_
_pdbx_het_state.id
_pdbx_het_state.bundle_id
_pdbx_het_state.occupancy
_pdbx_het_state.details
1 edo_site 0.05 'Ligand + EDO2 -- rare, the phenol ring crowds the lower pocket'
2 edo_site 0.15 'Ligand + EDO3'
3 edo_site 0.30 'Ligand, lower pocket empty'
4 edo_site 0.25 'EDO1 + EDO2 -- the majority species'
5 edo_site 0.05 'EDO1 + EDO3'
6 edo_site 0.20 'EDO1, lower pocket empty'
#
loop_
_pdbx_het_state_members.state_id
_pdbx_het_state_members.alt_group_id
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

Two things to notice. First, the "empty bottom pocket" states (3 and 6) are spelled by *omission* —
a state simply lists the networks that are present, and a bottom-pocket occupant that is absent is
just not listed. Second, the hierarchy table here carries only `coexistence_group_id`: it says
Ligand and EDO1 are mutually exclusive in the top pocket, EDO2 and EDO3 in the bottom. 

## example 2 — bridged water 

Another toy scenario: Ser45 and Thr82 point across a small cavity, and an ordered water sits between them needing a hydrogen-bond donor from each — so the water is present only when both side chains point in. The two side chains are otherwise independent of one another.

```
              Ser45 in (.60)                    Ser45 out (.40)
               /         \                       /          \
         Thr82 in     Thr82 out            Thr82 in     Thr82 out
          /     \          |                   |             |
      + wat   no wat       |                   |             |
       .24      .06       .30                 .20           .20

  five states, one bundle, occupancies sum to 1.00

  marginals:  Ser45 in  .24+.06+.30 = .60      Thr82 in  .24+.06+.20 = .50
              water     .24
```

The two side chains genuinely are independent: .60 × .50 = .30, and states 1 and 2 together are .24 + .06 = .30 exactly. What is *not* independent is the water, which is ordered in 80% of the both-in copies rather than all of them. That last fact — a partial, conditional ordering sitting on top of an otherwise clean product.

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
ser45_in  ser45_rot
ser45_out ser45_rot
thr82_in  thr82_rot
thr82_out thr82_rot
wat301    .
#
loop_
_pdbx_het_state.id
_pdbx_het_state.bundle_id
_pdbx_het_state.occupancy
_pdbx_het_state.details
1 bridge 0.24 'both side chains in; the bridging water is ordered'
2 bridge 0.06 'both in, but the water is not ordered'
3 bridge 0.30 'Ser45 in, Thr82 out; no donor pair, no water'
4 bridge 0.20 'Ser45 out, Thr82 in; no donor pair, no water'
5 bridge 0.20 'both out'
#
loop_
_pdbx_het_state_members.state_id
_pdbx_het_state_members.alt_group_id
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

## Example 3 — the water clash (when you do *not* build a bundle)

Calmodulin (PDB 5E1N), Arg74 modelled in three rotamers and a partial water beside it. Deposited
coordinates, verbatim.

```
   Arg74 rotamer         nearest approach to water 468
   -------------         -----------------------------
   arg74_B  (occ .35)  --X-->  2.14 A   steric clash  -> forbidden
   arg74_C  (occ .27)  ----->  3.97 A   fine
   arg74_D  (occ .38)  ----->  4.80 A   fine
   wat468_E (occ .54)

   one forbidden cell, and no joint populations to record  ->  one NOT row, no bundle
```

This looks like it could be a bundle — a rotamer switch and a water — but it is not, and the
distinction is the whole point of keeping both mechanisms. The rotamer and the water are otherwise
independent: nothing says the water's presence is correlated with C versus D, and we have no joint
populations to write. The single fact worth recording is that one pairing — rotamer B and the water —
is sterically impossible. That is a zero in the joint, a support constraint, not a distribution. One
`forbidden_states` row states it and costs nothing:

```
loop_
_pdbx_alt_groups.id
_pdbx_alt_groups.alt_group_id
_pdbx_alt_groups.auth_asym_id
_pdbx_alt_groups.auth_seq_id_start
_pdbx_alt_groups.auth_seq_id_end
_pdbx_alt_groups.label_alt_id
_pdbx_alt_groups.label_atom_id
1 arg74_B  A 74  74  B .
2 arg74_C  A 74  74  C .
3 arg74_D  A 74  74  D .
4 wat468_E A 468 468 E .
#
loop_
_pdbx_forbidden_states.id
_pdbx_forbidden_states.rule
_pdbx_forbidden_states.heterogeneity_id
_pdbx_forbidden_states.heterogeneity_ids
1 NOT arg74_B wat468_E
#
```

Correlated sites with populations you actually know get a **bundle of states**; a stray forbidden combination between otherwise-independent sites, with no populations to record, gets a **`forbidden_states` row**. Never write both for the same combination — a full bundle already forbids by omission everything it does not list, so a `NOT` among a bundle's own members would be redundant. 

## a note on size — does this blow up?


Possibly only inside a bundle (unlikely even at the frontier), and never across the structure.

The cost of the state table is exponential in the number of mutually correlated switches *within a
single bundle*, and nothing else. Independent sites are separate bundles, and separate bundles add, they do not multiply. A ribosome with several hundred partial waters and alternate sidechains that do not talk to each other is several hundred bundles of one or two states apiece — linear in the number of partial sites, not two-to-the-power-of-anything. A genuine blow-up needs a *single* bundle of fifteen or twenty mutually entangled switches, and you cannot refine, measure, or otherwise determine a fifteen-way joint from one experiment. The encoding is therefore never asked to carry more than the data can support; which hopefully keeps local and small.

And the verbosity that alarms in plain text is close to free on disk. The state and member rows are the most repetitive content in the file — a bundle id repeated down a column, integer state ids in runs, a small enumerated set of network names. This is exactly what BinaryCIF's column encodings (run-length, delta, dictionary) collapse to almost nothing.

## Note — where the joint partitioning actually comes from

The schema holds any joint distribution perfectly. The data, in general, do not. I suspect that this is part of what Justin was pointing out wrt the ambiguity of what is more primary the top or the bottom pocket in the EDO example (it's not obvious). Or whether it makes sense at all to project an arbitrary biochemical hierarchy whose terms we got used to thinkin in onto the occupancies distribution borne out out of refinement (it doesn't).

The average density is a one-body quantity: at each site it carries that site's *marginal* occupancy and nothing more. The joint — which bottom occupant goes with which top occupant — is a correlation between sites, a many-body quantity. Maybe it can indeed be lifted from the diffuse scattering, but i'm again not sure about how much of it standard refinement discards nowadays. 

<!-- What that means, case by case:

- **Marginals** (`atom_site`): always come from refinement, stay untouched, non-negotiable.
- **Local, contact-welded couplings** (a water that can only bind one rotamer): the joint population *is* refinable today, as a constrained occupancy group or a shared free variable. But note th catch — the program refines the population of a coupling it was *told* to assume. It cannot discover the coupling, because a welded model and an independent model with the same marginals produce the identical average density. The assertion that they are coupled is stereochemistry, not the fit.
- **Separated-site joints** (the general bundle): not obtainable from Bragg data. They come from
  chemistry and sterics (support only — the forbidden cells, i.e. `forbidden_states`), from
  time-resolved crystallography (where reaction-intermediate populations are genuinely measured — the cleanest source by far), from cryo-EM 3D classification (class populations are natively
  state-with-population, though currently not routed into the atomic model and global rather than
  local), and eventually perhaps from diffuse scattering. -->

I don't think this underdetermination is necessarily a problem if our goal is to just provide a landing pad for the data that someone else computes: everything a state table adds over `atom_site` is *exactly* the part refinement cannot produce for separated sites anyway, needs to be computed and then stored -- whenever, if ever, that becomes the norm. If a program could produce the joint, it would be a computable function of the marginals and you would not store it — you would derive it. The joint has to be recorded because it is usually underdetermined by the data plus the model. The state table is only a record of correlation knowledge, filled by whoever holds it — the program forlocal couplings, chemistry for exclusions, time-resolved or cryo-EM for measured populations, etc.

I guess given all this, it's worth noting that there is at the very least a distinction between a fitted population and an asserted population (someone said "constrain this" during refinement or elsewhere) one thing we can already anticipate is that at least one more column can be added to `pdbx_het_state` that would record this provenance. Here i am again bumping against my lack of knowledge of refinemnet and stereochemistry to flesh this out more, but the fear is that there are actually a lot more distinctions between where the information defining the joints comes from (related to the number of methods different programs do produce it). I think this is the core of the machinery that should be discussed with the interest groups directly and i for now lack insight to define.

