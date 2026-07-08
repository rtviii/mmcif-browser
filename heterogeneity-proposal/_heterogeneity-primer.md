# Structural heterogeneity in mmCIF: what is underspecified, and why it is contested

*An orientation to the problem this proposal addresses. It explains what structural
heterogeneity is, the single fact that current coordinate files fail to capture, and why a
solution is contested — different classes of software need different things from the same file.
No prior familiarity with the proposal is assumed.*

---

## A structure is an average over a mixture

A macromolecular crystal is not one molecule. It is on the order of 10^13 copies of the molecule
packed in a lattice, and those copies are not identical. A side chain may point one way in some
and another way in others; a ligand may occupy a pocket in some copies and be absent in others; a
loop may be ordered in some and mobile in others. The diffraction experiment measures the entire
ensemble at once, so the electron-density map is an **average** over all the copies.

A deposited model therefore has to describe a distribution over shapes, not a single
conformation. mmCIF does this with **alternate locations** (altlocs): an atom carries a letter
(`A`, `B`, ...) marking which alternate it belongs to, and an **occupancy** — the fraction of
copies in which that alternate is present.

```
FIGURE 1 — one site, many copies, different contents

     copy #1        copy #2        copy #3        copy #4     ... (x 10^13)
   +---------+    +---------+    +---------+    +---------+
   | TOP:    |    | TOP:    |    | TOP:    |    | TOP:    |
   | Ligand  |    | Ligand  |    |  EDO1   |    |  EDO1   |
   | BOT:    |    | BOT:    |    | BOT:    |    | BOT:    |
   |  EDO2   |    |  EDO3   |    |  EDO2   |    |  EDO3   |
   +---------+    +---------+    +---------+    +---------+

   The crystal is a mixture of copies like these. The data is the average over all of them.
```

## What altlocs capture, and what they do not

The altloc letter carries exactly one guarantee, and it is **local**: within a small region,
alternate `A` of one atom is taken to go with alternate `A` of an immediate neighbour, never with
`B`. That is enough for a single side chain modelled in two rotamers.

It is not enough for anything larger. The letter says nothing about whether alternate `A` at
residue 30 and alternate `A` at residue 200 are the same physical state or merely a coincidence of
labelling. Across a whole structure, the **correlations between separated heterogeneous sites** are
precisely the information the altloc convention cannot carry — and that is the information a
heterogeneity extension exists to add.

## The one fact that is missing: what co-occurs

This is the crux, and it is a single idea. A coordinate file records, for each alternate, **how
often it appears** — its occupancy. It does not record **what appears together**.

Consider the two adjacent pockets of Figure 1: a top pocket holding either a ligand or an ethylene
glycol (`EDO1`), and a bottom pocket holding either `EDO2` or `EDO3`. What the density and the
occupancies give are **marginals** — per-item fractions:

```
   TOP pocket:   Ligand 50%   |   EDO1 50%
   BOT pocket:   EDO2   50%   |   EDO3 50%
```

That is all per-atom occupancy can express. It does not say which top occupant pairs with which
bottom occupant. And three physically different crystals produce the **identical** marginals:

```
FIGURE 2 — same marginals, three different physical answers

   (A) INDEPENDENT          (B) CORRELATED           (C) CORRELATED (other way)
   Ligand+EDO2 : 25%         Ligand+EDO2 : 50%         Ligand+EDO3 : 50%
   Ligand+EDO3 : 25%         Ligand+EDO3 :  0%         Ligand+EDO2 :  0%
   EDO1  +EDO2 : 25%         EDO1  +EDO3 : 50%         EDO1  +EDO2 : 50%
   EDO1  +EDO3 : 25%         (others      0%)          (others      0%)
   -----------------         -----------------         -----------------
   marginals:  Ligand 50 / EDO1 50 / EDO2 50 / EDO3 50    <-- IDENTICAL in all three
```

The coordinates and occupancies written to the file are **byte-for-byte identical** for A, B, and
C. They are three different statements about what the molecule actually does. The gap between them
— the **joint** distribution (what co-occurs), which the marginals do not determine — is the whole
problem. Everything a heterogeneity description must add is some slice of that joint.

Stated once more, plainly: the file stores averages; the missing information is correlation.

## Why the existing tables are ambiguous

A first attempt at an extension adds two tables: a **hierarchy** (each state and its parent) and a
**coexistence** table (rules such as `NOT`, `OR` between states). The difficulty is that these
tables, as first drafted, do not disambiguate the three readings above:

```
FIGURE 3 — the tables underdetermine the physics

   The tables can say:                     The tables do not say:
     the four occupants exist                is the TOP pocket correlated with the BOTTOM?
     Ligand NOT EDO1  (same pocket)          given a copy with Ligand up top,
     EDO2   NOT EDO3  (same pocket)            what is down in the bottom?
     "they interact"  (an OR rule)           the actual occupancy relationships

   Same tables  ->  read as (A) or (B) or (C).  A program cannot tell which was meant.
```

A 2026 working-group analysis made this concrete by taking one such file and showing it admits
several distinct physical interpretations, and named what stays unresolved: the **occupancy
relationships** between states, and the **existence of the single species** that actually co-occur
(what one real copy looks like). These are the joint-distribution facts of the previous section,
surfacing as an ambiguity in the encoding.

## Two kinds of relationship: sums and products

When correlations *are* recorded, they come in two mathematically different kinds, and the
distinction decides what any format can and cannot do.

A **linear** relationship is one where occupancies add:

```
FIGURE 4 — a linear (additive) relationship

   O(EDO1) = O(EDO2) + O(EDO3)

   meaning: "the bottom pocket is occupied only in the copies that have EDO1 up top."
   numbers: O(EDO1)=0.5,  O(EDO2)=0.3,  O(EDO3)=0.2      0.3 + 0.2 = 0.5   (consistent)
            (the other half of the copies have Ligand up top and an empty bottom pocket)
```

A linear relationship is a **sum of group occupancies set equal to another**. It is recordable as
data: a set of groups, and the target they sum to. This is the form refinement programs already
think in when they define "occupancy groups."

A **product** relationship arises from genuine statistical independence, and appears when a third
feature requires a **conjunction**:

```
FIGURE 5 — a product (multiplicative) relationship

   two independent switches, and an ordered water present only when BOTH are "in":
      switch-1 "in": 50%      switch-2 "in": 60%      (independent)
      water present = both in = 0.5 x 0.6 = 0.30      <-- a PRODUCT

   can a SUM build 0.30 from 0.5 and 0.6?
      0.5 + 0.6 = 1.1     0.6 - 0.5 = 0.1     no combination of adding gives 0.30
   a product requires multiplication; a sum cannot express it.
```

The two are not interchangeable. Every relationship a table of sums can hold is linear; genuine
independence is multiplicative and lies outside it. In practice, independence carries a mitigation:
if two sites are independent, the joint is fully determined by the marginals, so nothing extra need
be recorded at all — a consumer that wants a joint number multiplies. The genuinely hard residue is
only the conjunction case (the bridging water), which today is left unconstrained by every program.

## What a complete description requires

The intended structure of relationships is often not a tree but a **directed acyclic graph** (DAG):
a state can relate upward to more than one parent.

```
FIGURE 6 — topology versus arithmetic

        Base
       /    \
     EDO1   Ligand
      | \   / |
      |  \ /  |
      | EDO2 EDO3          EDO2 and EDO3 each relate up to BOTH EDO1 and Ligand -> a DAG

   The DAG says WHO relates to WHOM (topology).
   It does NOT say the NUMBERS: is O(EDO2) half of O(EDO1)? all of it? tied to Ligand?
   The branches are silent on the arithmetic.
```

A DAG fixes the shape of the relationships; it does not fix their magnitudes. A complete,
unambiguous description therefore needs **two** things together: the **topology** (which states
relate, allowing multiple parents) and the **occupancy arithmetic** (the sums that tie the numbers).
Either alone leaves the file underspecified — which is why simply allowing a richer graph does not,
by itself, resolve the ambiguity.

## Why this is contested: three constituencies

A solution is not merely a technical exercise, because three classes of software consume the same
file and need different, sometimes opposing, things from it.

- **Refinement programs** (for example Refmac, Phenix, SHELXL, BUSTER) re-fit the model against the
  data, adjusting coordinates, B-factors, and occupancies. For them a heterogeneity description is
  not decoration: it dictates which parameters are coupled during optimization — whether two
  alternates' occupancies must sum to one, whether a child group's occupancy is tied to a parent's.
  They require the intent to be **unambiguous and machine-actionable**. Today they implement only
  the simplest coupling ("alternates within one group sum to one"); anything richer is ahead of
  what they consume, so a description must be precise enough that, once implemented, every program
  computes the same result.

- **Consumers, libraries, and visualization** (for example gemmi, PyMOL, Coot, Chimera, and
  data-mining pipelines) read, display, or index structures but do not re-fit them. They are more
  tolerant: a viewer can ignore a relationship it does not understand and still draw the atoms.
  Their governing requirement is **non-invasiveness** — a naive reader must still obtain a valid
  structure, which in practice means the coordinate table (`atom_site`) should not acquire mandatory
  new columns that every parser is forced to handle.

- **Standards and archive** (the wwPDB and the mmCIF/PDBx dictionary maintainers) own the format's
  long-term coherence. They require **unambiguous semantics** (one file, one meaning),
  **validatability** (a deposited file can be checked for internal consistency), and **backward
  compatibility** (existing tools keep working). They are wary of additions that admit several
  readings or that cannot be checked automatically.

These pull against one another along predictable seams:

```
   expressiveness  vs  non-invasiveness
       the most direct way to attach a state identity to an atom is a new per-atom column in
       atom_site; that is exactly what the library/consumer side rejects, because it forces
       every parser to change.

   precision  vs  simplicity
       refinement needs the occupancy relationships spelled out in full; the standards side
       wants the smallest, least ambiguous vocabulary, and pressed to drop logical operators
       (AND/OR) that were shown to admit multiple interpretations.

   recording  vs  fitting
       a relationship can be recorded in a deposited file long before any program can fit it.
       the archive can accept that; refinement developers need assurance that the recorded
       intent is something they can eventually implement without contradiction.
```

## Summary

A heterogeneous structure is a distribution over shapes, and a coordinate file records the
marginals of that distribution — how often each alternate appears — but not the joint — what
appears together. Alternate-location letters capture the local part of this and nothing of the
long-range correlations. Recovering those correlations requires stating both a topology (which
states relate, in general a DAG rather than a tree) and an occupancy arithmetic (the sums that fix
the magnitudes); linear relationships of this kind are expressible as data, while genuine
statistical independence is multiplicative and largely sits outside any tabular sum-based scheme
(and, in practice, is left unconstrained). A workable extension has to deliver this precisely
enough for refinement software to act on, non-invasively enough that existing readers do not break,
and unambiguously enough that the archive can validate it — three requirements held by three
different audiences, which is what makes the design a negotiation rather than a formality.
