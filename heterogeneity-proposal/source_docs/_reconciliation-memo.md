# A way forward: one encoding that satisfies both sides

*Companion to Part 3 of this page. The page reads four graded cases (A–D) three
ways — current mmCIF, Stephanie's proposal, Martin's simplification. This memo adds
the **fourth reading**: a single encoding that takes Martin's non-invasive base,
adds one atom-level escape hatch, makes the occupancy nesting explicit, and keeps an
optional exclusion table only for the genuinely cross-branch case. The net is
Stephanie's expressiveness with Martin's zero change to `atom_site`.*

Every example is laid out the same way: a faithful **figure** that carries the actual
CIF item names and enumerates the legal combinations, a one-paragraph **problem**, a
note of which **categories** are old and which are new, an **arrow diagram** showing
how rows in one category point into another, and a **full CIF block** exactly as it
would appear in a file — no shorthand. Then a closing note on who it satisfies.

---

## The categories, in plain language

The single biggest source of confusion is that the operational names all look alike
(`label_asym_id`, `label_seq_id`, `label_alt_id`, `label_atom_id`, …). Here is the
whole cast, split into *already in mmCIF* and *proposed*. Each entry says what it is,
gives a one-line example, and names what connects to it.

### Already in mmCIF (we do not change any of these)

- **`_atom_site`** — the coordinate table. **One row per atom per alternate
  position.** Everything else points *into* it. Its columns we care about:
  - `label_atom_id` — the atom name, e.g. `OD1`. (`auth_atom_id` is the author's
    version of the same.)
  - `label_comp_id` — the residue/component type, e.g. `ASP`.
  - `label_asym_id` / `auth_asym_id` — the chain. (`label_` is the internal id;
    `auth_` is the chain letter a crystallographer would say, e.g. `A`.)
  - `label_seq_id` / `auth_seq_id` — the residue number. (Same `label_`/`auth_`
    split; `auth_seq_id` is the number printed in the paper.)
  - `label_alt_id` — **the alternate-location letter** (`A`, `B`, …). This is the
    hinge everything below hangs on, so it gets its own entry next.
  - `occupancy` — the fraction of copies in which this row's atom is present.
- **`_atom_site.label_alt_id`** — the alternate-location letter. The dictionary
  only guarantees something *local*: it marks that an atom has alternates and bounds
  the scope of one alternate. The enforced meaning is a clash rule — *A interacts
  with A and with blank, never with B*. It says **nothing** about whether `A` at
  residue 30 and `A` at residue 88 are the same physical state. That missing fact is
  the entire problem.
- **`_atom_site.occupancy`** — the presence fraction. By convention the alternates
  of *one atom* sum to 1.0; beyond that it is just a per-event marginal.
- **`_struct_conn`** — the bond/contact table, including metal coordination
  (`conn_type_id = metalc`). Bonds can be alternate-specific (`ptnr1_label_alt_id`).
  Relevant only in case D; must be kept consistent with any network naming the same
  atoms.
- **`_atom_sites_alt` / `_atom_sites_alt_ens` / `_atom_sites_alt_gen`** — a
  *dormant legacy* mechanism that already groups altloc letters into named
  "ensembles" (`_atom_sites_alt_gen` maps each altloc id to an ensemble id defined in
  `_atom_sites_alt_ens`). Worth knowing because someone will ask "why not just use
  this?". The answer: it groups by altloc **letter globally**, with no residue or
  atom scoping, no parent/child, and no occupancy relationship — so it inherits the
  overloaded-letter problem and cannot express nesting or non-local exclusivity. It
  is the closest existing thing and exactly what the proposal supersedes.

### Proposed here (three new categories; `atom_site` untouched)

- **`_pdbx_alt_groups`** — **names a network**: a set of atoms that together
  constitute one state, by pointing into `atom_site` via existing keys. Martin's
  category, with one column added (`label_atom_id`, the atom-level escape hatch).
  Columns: `id` (row key), `alt_group_id` (the state's name), `auth_asym_id`,
  `auth_seq_id_start`, `auth_seq_id_end`, `label_alt_id`, and the new optional
  `label_atom_id`. One network spans several rows (non-contiguous membership).
  Connects to: `atom_site` (it selects rows there) and to the two categories below
  (by `alt_group_id`).
- **`_pdbx_heterogeneity_hierarchy`** — **the tree plus the occupancy grouping**.
  Martin's column set: `alt_group_id`, `coexistence_group_id`,
  `parent_alt_groups_id`. For each network it says (i) which *mutually-exclusive set*
  it belongs to among its siblings — the `coexistence_group_id`, which is the same
  thing a crystallographer calls an *occupancy group* — and (ii) its parent network
  (`.` for a root). Connects to: `_pdbx_alt_groups` (by `alt_group_id`) and to itself
  (by parent).
- **`_pdbx_state_coexistence`** — **optional**; a sparse list of forbidden
  combinations (NOT only). Stephanie's category, kept but reduced: its only job is the
  rare cross-branch clash the tree cannot already imply. Columns: `id`, `rule`
  (always `NOT`), `heterogeneity_id`, `heterogeneity_ids`. Connects to:
  `_pdbx_alt_groups` (the names it references). **Absent in most files.**

The reading rule that ties the second and third together: **alternatives in one
`coexistence_group_id` are mutually exclusive for free, and that exclusivity is
inherited by their descendants.** So `_pdbx_state_coexistence` only ever needs an
entry when two networks in *different* branches clash anyway.

One convention: the always-present, single-conformer part of the structure is the
implicit root network **`base`**. It has `occupancy = 1`, it is the root in the
hierarchy, and it needs **no** `_pdbx_alt_groups` rows — its membership is "every
atom not claimed by another network." Only the alternate networks are listed.

---

## Anatomy of the new categories — a complete CIF block

Before the cases, here is a whole, valid CIF data block for the simplest non-trivial
situation: two serines, residues 34 and 89, that flip together as one network (state
`net_1` is both in their A position, `net_2` is both in their B position). This is the
real file, full column set, nothing abbreviated — read it once and the cases below
read quickly.

```
data_network_demo
#
loop_
_atom_site.group_PDB            # ATOM or HETATM
_atom_site.id                   # unique serial number
_atom_site.type_symbol          # element
_atom_site.label_atom_id        # atom name
_atom_site.label_alt_id         # << the alternate-location letter
_atom_site.label_comp_id        # residue/component type
_atom_site.label_asym_id        # chain (internal id)
_atom_site.label_entity_id      # which entity (1 = the polymer)
_atom_site.label_seq_id         # residue number (internal)
_atom_site.pdbx_PDB_ins_code    # insertion code
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.occupancy            # << presence fraction
_atom_site.B_iso_or_equiv
_atom_site.pdbx_formal_charge
_atom_site.auth_seq_id          # residue number (author's)
_atom_site.auth_comp_id
_atom_site.auth_asym_id         # chain (author's, e.g. A)
_atom_site.auth_atom_id
_atom_site.pdbx_PDB_model_num
ATOM 1 C CB A SER A 1 34 ? 11.042 22.118 8.401 0.50 18.30 ? 34 SER A CB 1
ATOM 2 O OG A SER A 1 34 ? 10.213 21.880 9.322 0.50 21.74 ? 34 SER A OG 1
ATOM 3 C CB B SER A 1 34 ? 11.101 22.305 8.557 0.50 19.11 ? 34 SER A CB 1
ATOM 4 O OG B SER A 1 34 ? 12.044 22.712 9.103 0.50 23.40 ? 34 SER A OG 1
ATOM 5 C CB A SER A 1 89 ? 30.551 14.020 5.110 0.50 16.82 ? 89 SER A CB 1
ATOM 6 O OG A SER A 1 89 ? 31.423 13.552 5.984 0.50 20.21 ? 89 SER A OG 1
ATOM 7 C CB B SER A 1 89 ? 30.612 14.203 5.301 0.50 17.55 ? 89 SER A CB 1
ATOM 8 O OG B SER A 1 89 ? 29.704 14.881 5.622 0.50 22.03 ? 89 SER A OG 1
#
loop_
_pdbx_alt_groups.id                 # row key
_pdbx_alt_groups.alt_group_id       # the network's name (the state identity)
_pdbx_alt_groups.auth_asym_id       # chain, matches _atom_site.auth_asym_id
_pdbx_alt_groups.auth_seq_id_start  # first residue in this membership row
_pdbx_alt_groups.auth_seq_id_end    # last residue in this membership row
_pdbx_alt_groups.label_alt_id       # which altloc letter these atoms carry
_pdbx_alt_groups.label_atom_id      # '.' = all atoms in the range; else one atom name
1 net_1 A 34 34 A .
2 net_1 A 89 89 A .
3 net_2 A 34 34 B .
4 net_2 A 89 89 B .
#
loop_
_pdbx_heterogeneity_hierarchy.alt_group_id           # the network
_pdbx_heterogeneity_hierarchy.coexistence_group_id   # its mutually-exclusive set (occupancy group)
_pdbx_heterogeneity_hierarchy.parent_alt_groups_id   # parent network ('.' = root)
base  .       .
net_1 rotamer base
net_2 rotamer base
#
```

How to read it: `_pdbx_alt_groups` rows 1–2 say "the SER34 and SER89 atoms with
`label_alt_id = A` are network `net_1`"; rows 3–4 do the same for `B` → `net_2`. The
hierarchy then says both networks are children of `base` and share the occupancy group
`rotamer`, so they are the two mutually-exclusive whole-structure states. `atom_site`
was not touched.

### atom resolution/new escape-hatch category?

No new category. The optional `label_atom_id` column *is* the escape hatch. When it is
`.`, the row claims every atom in the residue range (Martin's default granularity).
When it names an atom, the row claims only that atom; to put a few atoms in a network
you write a few rows (case B+ below). A per-atom state label — what Stephanie's
`_atom_site.pdbx_heterogeneity_id` column gives — is then just the limit where every
selector is a single atom. So:

> **A network table with `label_atom_id` is exactly as expressive as a per-atom state
> label, with `atom_site` left untouched.** Residue-range membership is the default;
> atom resolution is a graceful drop-down, not a separate mechanism.

(Dictionary-purity note: one atom name per row keeps every field atomic, which the
dictionary prefers over a comma-separated list. More verbose, unambiguous.)

### do refinement programs *have* to support the nesting?

Opt-in, in three tiers, because `atom_site` is unchanged and the categories are
additive:

1. **Ignore.** A program that knows nothing of these categories reads the same
   `atom_site` and refines exactly as today. Nothing breaks.
2. **Flat only.** Read the hierarchy and apply just the occupancy-group constraints
   already supported — each `coexistence_group_id` is one mutually-exclusive set
   summing to its parent's occupancy *treated as a constant*. This is precisely what
   Refmac (`occupancy group alts complete`), Phenix (constrained group occupancy),
   BUSTER (`BUSTER_OCCSUM`), and SHELX already do. No new code.
3. **Nested.** Tie a child group's sum to the *refinable* parent occupancy (parent
   0.5, children 0.25 + 0.25, all refined together). **No mainstream program does this
   today** (SHELX manages it only with a fixed parent). A genuinely new — but small,
   well-defined — capability.

The format records the full relationship regardless; programs climb the tiers on their
own schedule. Tier 2 is a re-export of what tools already do; tier 3 is new. Say so
plainly in any pitch.

---

## The reconciliation, case by case

Same A–D as Part 3 of the page. The encoding shown is the single reconciled one
(Martin's `_pdbx_alt_groups` + `_pdbx_heterogeneity_hierarchy`, plus the optional
`_pdbx_state_coexistence` only where it earns its place). To keep the CIF readable,
each block shows the atoms that actually carry the heterogeneity; single-conformer
atoms of the same residues belong to `base` and are not repeated.

### Warm-up · A — one residue, two rotamers

```
FIGURE A — Asp30 side chain, two alternates (no relationship to anything else)

   Asp30  label_alt_id = A   occupancy 0.60  ┐  the two alternates of ONE residue;
   Asp30  label_alt_id = B   occupancy 0.40  ┘  0.60 + 0.40 = 1.0 within the residue

   legal whole-molecule states:   { A }   or   { B }      (nothing else couples in)
```

**The problem (there isn't one yet).** A single side chain in two positions. Both
alternatives live in one residue, so the altloc letter relates only things that sit
together; nothing is underspecified.

**Categories.** Existing only: `_atom_site` with `label_alt_id` and `occupancy`. No
new category is needed — the new categories are *opt-in* and earn their keep only from
case B, where a relationship spans more than one residue.

**Full CIF.**

```
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_alt_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_entity_id
_atom_site.label_seq_id
_atom_site.pdbx_PDB_ins_code
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.occupancy
_atom_site.B_iso_or_equiv
_atom_site.pdbx_formal_charge
_atom_site.auth_seq_id
_atom_site.auth_comp_id
_atom_site.auth_asym_id
_atom_site.auth_atom_id
_atom_site.pdbx_PDB_model_num
ATOM 1 C CB  A ASP A 1 30 ? 18.221 9.114 22.005 0.60 17.20 ?  30 ASP A CB  1
ATOM 2 C CG  A ASP A 1 30 ? 19.004 8.330 22.717 0.60 19.85 ?  30 ASP A CG  1
ATOM 3 O OD1 A ASP A 1 30 ? 18.770 8.221 23.940 0.60 22.10 ?  30 ASP A OD1 1
ATOM 4 O OD2 A ASP A 1 30 ? 19.930 7.812 22.090 0.60 22.74 -1 30 ASP A OD2 1
ATOM 5 C CB  B ASP A 1 30 ? 18.301 9.022 21.880 0.40 18.05 ?  30 ASP A CB  1
ATOM 6 C CG  B ASP A 1 30 ? 19.210 8.011 21.640 0.40 20.41 ?  30 ASP A CG  1
ATOM 7 O OD1 B ASP A 1 30 ? 20.402 8.225 21.430 0.40 23.02 ?  30 ASP A OD1 1
ATOM 8 O OD2 B ASP A 1 30 ? 18.802 6.890 21.560 0.40 23.55 -1 30 ASP A OD2 1
```

**Who it satisfies.** Everyone, trivially. (If you wanted to name these states for
consistency you would add two `_pdbx_alt_groups` rows `a`/`b` in one occupancy group
under `base`; it is optional and adds nothing here.)

### Example · B — a correlated network across two residues

```
FIGURE B — Asp30 and His88 flip together as one H-bond network, 50/50

  network net_1                         network net_2
    Asp30  label_alt_id = A               Asp30  label_alt_id = B
    His88  label_alt_id = A               His88  label_alt_id = B
    occupancy 0.50                        occupancy 0.50
    coexistence_group_id = rotamer        coexistence_group_id = rotamer

  legal whole-molecule states (what we are delineating):
    state 1 = net_1 = { Asp30·A , His88·A }     p = 0.50
    state 2 = net_2 = { Asp30·B , His88·B }     p = 0.50
  net_1 + net_2 = 1.0   (shared coexistence_group_id "rotamer" => pick exactly one)

  what the current file CANNOT say: that Asp30·A goes with His88·A — only the
  reused letter "A" hints it, and that hint is not enforced.
```

**The problem.** Asp30 and His88 are far apart but hydrogen-bonded and flip together.
The current file can place all four sets of atoms, but the only thing saying "A goes
with A" is the shared letter — an unenforced convention. Add a third nearby residue
with a different number of alternates and the letter mapping no longer lines up. **What
is missing is the explicit network: which alternates across the structure are one
state.**

**Categories.** Existing: `_atom_site` (unchanged). Proposed: `_pdbx_alt_groups` (the
two networks) and `_pdbx_heterogeneity_hierarchy` (one occupancy group under `base`).
No exclusion table.

**Arrow diagram (which `atom_site` rows feed which network).**

```
 _atom_site rows (read label_alt_id)            grouped into  alt_group_id
   CG   ASP A 30  label_alt_id A  ─┐
   OD1  ASP A 30  label_alt_id A   ├──────────▶  net_1
   NE2  HIS A 88  label_alt_id A  ─┘
   CG   ASP A 30  label_alt_id B  ─┐
   OD1  ASP A 30  label_alt_id B   ├──────────▶  net_2
   NE2  HIS A 88  label_alt_id B  ─┘
```

**Full CIF.**

```
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_alt_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_entity_id
_atom_site.label_seq_id
_atom_site.pdbx_PDB_ins_code
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.occupancy
_atom_site.B_iso_or_equiv
_atom_site.pdbx_formal_charge
_atom_site.auth_seq_id
_atom_site.auth_comp_id
_atom_site.auth_asym_id
_atom_site.auth_atom_id
_atom_site.pdbx_PDB_model_num
ATOM  1 C CB  A ASP A 1 30 ? 18.221  9.114 22.005 0.50 17.20 ?  30 ASP A CB  1
ATOM  2 C CG  A ASP A 1 30 ? 19.004  8.330 22.717 0.50 19.85 ?  30 ASP A CG  1
ATOM  3 O OD1 A ASP A 1 30 ? 18.770  8.221 23.940 0.50 22.10 ?  30 ASP A OD1 1
ATOM  4 O OD2 A ASP A 1 30 ? 19.930  7.812 22.090 0.50 22.74 -1 30 ASP A OD2 1
ATOM  5 C CB  B ASP A 1 30 ? 18.301  9.022 21.880 0.50 18.05 ?  30 ASP A CB  1
ATOM  6 C CG  B ASP A 1 30 ? 19.210  8.011 21.640 0.50 20.41 ?  30 ASP A CG  1
ATOM  7 O OD1 B ASP A 1 30 ? 20.402  8.225 21.430 0.50 23.02 ?  30 ASP A OD1 1
ATOM  8 O OD2 B ASP A 1 30 ? 18.802  6.890 21.560 0.50 23.55 -1 30 ASP A OD2 1
ATOM  9 C CB  A HIS A 1 88 ? 41.110 12.004 6.330  0.50 16.40 ?  88 HIS A CB  1
ATOM 10 C CG  A HIS A 1 88 ? 41.880 11.220 6.990  0.50 18.02 ?  88 HIS A CG  1
ATOM 11 N ND1 A HIS A 1 88 ? 42.770 11.640 7.940  0.50 19.55 ?  88 HIS A ND1 1
ATOM 12 C CD2 A HIS A 1 88 ? 41.940  9.880 6.880  0.50 18.71 ?  88 HIS A CD2 1
ATOM 13 C CE1 A HIS A 1 88 ? 43.330 10.560 8.420  0.50 20.10 ?  88 HIS A CE1 1
ATOM 14 N NE2 A HIS A 1 88 ? 42.860  9.520 7.760  0.50 19.98 ?  88 HIS A NE2 1
ATOM 15 C CB  B HIS A 1 88 ? 41.190 12.110 6.150  0.50 16.95 ?  88 HIS A CB  1
ATOM 16 C CG  B HIS A 1 88 ? 41.990 11.300 6.770  0.50 18.44 ?  88 HIS A CG  1
ATOM 17 N ND1 B HIS A 1 88 ? 41.620 10.020 7.090  0.50 19.83 ?  88 HIS A ND1 1
ATOM 18 C CD2 B HIS A 1 88 ? 43.270 11.470 7.250  0.50 18.90 ?  88 HIS A CD2 1
ATOM 19 C CE1 B HIS A 1 88 ? 42.640  9.430 7.760  0.50 20.41 ?  88 HIS A CE1 1
ATOM 20 N NE2 B HIS A 1 88 ? 43.640 10.270 7.880  0.50 20.22 ?  88 HIS A NE2 1
#
loop_
_pdbx_alt_groups.id
_pdbx_alt_groups.alt_group_id
_pdbx_alt_groups.auth_asym_id
_pdbx_alt_groups.auth_seq_id_start
_pdbx_alt_groups.auth_seq_id_end
_pdbx_alt_groups.label_alt_id
_pdbx_alt_groups.label_atom_id
1 net_1 A 30 30 A .
2 net_1 A 88 88 A .
3 net_2 A 30 30 B .
4 net_2 A 88 88 B .
#
loop_
_pdbx_heterogeneity_hierarchy.alt_group_id
_pdbx_heterogeneity_hierarchy.coexistence_group_id
_pdbx_heterogeneity_hierarchy.parent_alt_groups_id
base  .       .
net_1 rotamer base
net_2 rotamer base
#
```

**Who it satisfies.**

- *Stephanie* gets the co-occurrence written down, not inferred: one state name
  (`net_1`) spans both residues — exactly what `pdbx_heterogeneity_id` was for.
- *gemmi / refinement* gets it with `atom_site` untouched, by residue range, mapping
  straight onto an ordinary occupancy group (`net_1 + net_2 = 1`). Nothing new to
  refine.
- *Both*: yes. Stephanie's expressiveness, Martin's cost (two small side-table loops,
  no per-atom column).

### Example · B+ — when a residue must split below the altloc letter

```
FIGURE B+ — Lys78 has TWO independent two-state choices at the same residue

  choice 1: backbone loop          choice 2: side-chain rotamer
    atoms N, CA, C, O, H             atoms CB, CG, CD, CE, NZ
    label_alt_id A or B              label_alt_id A or B
    coexistence_group_id = loop      coexistence_group_id = rotamer

  the two choices are INDEPENDENT, so the legal whole-residue combinations are:
    { loop·A , rot·A }   { loop·A , rot·B }   { loop·B , rot·A }   { loop·B , rot·B }

  problem: backbone "A" and side-chain "A" reuse the SAME label_alt_id A on the SAME
  residue 78 — so a residue-range network (Martin's) cannot tell them apart. The only
  thing that separates them is label_atom_id.
```

**The problem.** Sometimes the backbone of a residue follows one choice while its side
chain follows another, independent choice. In plain altlocs both reuse the letters
`A`/`B` on residue 78, so nothing says backbone-A is unrelated to side-chain-A.
Martin's residue-range key cannot separate them — they share residue *and* letter.
This is the exact limit the page flags, and the only thing that would otherwise force
a per-atom column.

**Categories.** As B, but the `_pdbx_alt_groups` rows fill the new `label_atom_id`
column (one atom per row) instead of `.`.

**Arrow diagram (the split is by `label_atom_id`, not by residue or letter).**

```
 _atom_site rows (all are Lys78, label_alt_id A)        grouped into  alt_group_id
   N   LYS A 78 A ─┐
   CA  LYS A 78 A  │
   C   LYS A 78 A  ├──────────▶  loop_A      (backbone atoms only)
   O   LYS A 78 A  │
   H   LYS A 78 A ─┘
   CB  LYS A 78 A ─┐
   CG  LYS A 78 A  │
   CD  LYS A 78 A  ├──────────▶  rot_A       (side-chain atoms only)
   CE  LYS A 78 A  │
   NZ  LYS A 78 A ─┘
   (the label_alt_id B atoms split the same way into loop_B and rot_B)
```

**Full CIF** (both altlocs of both choices; `label_atom_id` is now filled in
`_pdbx_alt_groups`).

```
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_alt_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_entity_id
_atom_site.label_seq_id
_atom_site.pdbx_PDB_ins_code
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.occupancy
_atom_site.B_iso_or_equiv
_atom_site.pdbx_formal_charge
_atom_site.auth_seq_id
_atom_site.auth_comp_id
_atom_site.auth_asym_id
_atom_site.auth_atom_id
_atom_site.pdbx_PDB_model_num
ATOM  1 N N  A LYS A 1 78 ? 7.665 7.118 4.470 0.50 14.68 ? 78 LYS A N  1
ATOM  2 C CA A LYS A 1 78 ? 8.501 6.770 5.610 0.50 14.21 ? 78 LYS A CA 1
ATOM  3 C C  A LYS A 1 78 ? 7.880 5.880 6.690 0.50 13.90 ? 78 LYS A C  1
ATOM  4 O O  A LYS A 1 78 ? 8.465 5.797 7.770 0.50 14.55 ? 78 LYS A O  1
ATOM  5 H H  A LYS A 1 78 ? 6.720 6.880 4.330 0.50 17.60 ? 78 LYS A H  1
ATOM  6 C CB A LYS A 1 78 ? 9.880 6.210 5.210 0.50 16.02 ? 78 LYS A CB 1
ATOM  7 C CG A LYS A 1 78 ? 10.910 6.110 6.330 0.50 18.44 ? 78 LYS A CG 1
ATOM  8 C CD A LYS A 1 78 ? 12.260 5.620 5.820 0.50 21.07 ? 78 LYS A CD 1
ATOM  9 C CE A LYS A 1 78 ? 13.300 5.520 6.930 0.50 23.51 ? 78 LYS A CE 1
ATOM 10 N NZ A LYS A 1 78 ? 14.610 5.040 6.440 0.50 25.80 ? 78 LYS A NZ 1
ATOM 11 N N  B LYS A 1 78 ? 7.665 7.118 4.470 0.50 14.68 ? 78 LYS A N  1
ATOM 12 C CA B LYS A 1 78 ? 8.460 6.690 5.640 0.50 14.30 ? 78 LYS A CA 1
ATOM 13 C C  B LYS A 1 78 ? 7.770 5.760 6.640 0.50 13.81 ? 78 LYS A C  1
ATOM 14 O O  B LYS A 1 78 ? 8.483 5.628 7.737 0.50 13.51 ? 78 LYS A O  1
ATOM 15 H H  B LYS A 1 78 ? 6.700 6.910 4.300 0.50 17.20 ? 78 LYS A H  1
ATOM 16 C CB B LYS A 1 78 ? 9.770 6.040 5.020 0.50 16.55 ? 78 LYS A CB 1
ATOM 17 C CG B LYS A 1 78 ? 10.720 5.880 6.210 0.50 18.90 ? 78 LYS A CG 1
ATOM 18 C CD B LYS A 1 78 ? 12.140 5.440 5.780 0.50 21.66 ? 78 LYS A CD 1
ATOM 19 C CE B LYS A 1 78 ? 13.020 5.330 7.010 0.50 24.02 ? 78 LYS A CE 1
ATOM 20 N NZ B LYS A 1 78 ? 14.420 4.910 6.700 0.50 26.31 ? 78 LYS A NZ 1
#
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
3  loop_A A 78 78 A C
4  loop_A A 78 78 A O
5  loop_A A 78 78 A H
6  loop_B A 78 78 B N
7  loop_B A 78 78 B CA
8  loop_B A 78 78 B C
9  loop_B A 78 78 B O
10 loop_B A 78 78 B H
11 rot_A  A 78 78 A CB
12 rot_A  A 78 78 A CG
13 rot_A  A 78 78 A CD
14 rot_A  A 78 78 A CE
15 rot_A  A 78 78 A NZ
16 rot_B  A 78 78 B CB
17 rot_B  A 78 78 B CG
18 rot_B  A 78 78 B CD
19 rot_B  A 78 78 B CE
20 rot_B  A 78 78 B NZ
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
#
```

Two occupancy groups (`loop`, `rotamer`) under the same parent `base` are **independent
choices**, so backbone and side chain vary separately — which is the whole point.

**Who it satisfies.** *Stephanie* gets true atom resolution — the one thing the
residue-range table lacked, so nothing is lost relative to a per-atom column.
*gemmi / refinement* still sees an unchanged `atom_site` and one extra optional column
they ignore when it is `.`. *Both*: yes, and this case is the reason the escape hatch
is worth adding rather than leaving Martin's residue-only table.

### Example · C — compositional and conformational, with nesting

```
FIGURE C — apo vs bound, and the bound ligand has two poses (nesting)

  base
   │  coexistence_group_id = protein_state   (pick one;  apo + bound = 1.0)
   ├── apo     Tyr120 label_alt_id = B   occupancy 0.70
   └── bound   Tyr120 label_alt_id = A   occupancy 0.30
        │  coexistence_group_id = ligand_pose  (pick one;  lig_a + lig_b = occ(bound) = 0.30)
        ├── lig_a   LIG301 label_alt_id = A   occupancy 0.20
        └── lig_b   LIG301 label_alt_id = B   occupancy 0.10

  legal whole-molecule states (what we are delineating):
    1) { apo }                 p = 0.70
    2) { bound , lig_a }       p = 0.20
    3) { bound , lig_b }       p = 0.10
  no state carries a ligand without 'bound' — the nesting forbids it, with NO exclusion row.
```

**The problem.** Apo (70%) vs bound (30%); a gate residue opens only when bound; the
bound ligand has two poses (0.20 and 0.10). The current file can place the gate
alternates and the partial ligand, but nothing states that the two ligand poses sum to
the bound fraction (*nesting*), that the closed gate goes with the absent ligand
(*coupling*), or that apo/bound are the two whole-molecule frames. Worse, the absent
70% of the ligand has **no row at all**, so there is nowhere to attach the coupling.

**Categories.** Existing: `_atom_site`. Proposed: `_pdbx_alt_groups` (apo, bound,
lig_a, lig_b) and `_pdbx_heterogeneity_hierarchy` (the nesting). Exclusion table
**empty**.

**Arrow diagram.**

```
 _atom_site rows                          alt_group_id      then placed in the hierarchy as
   OH  TYR 120  label_alt_id B  ─▶ apo     (gate closed)     apo   : grp protein_state, parent base
   OH  TYR 120  label_alt_id A  ─▶ bound   (gate open)       bound : grp protein_state, parent base
   .   LIG 301  label_alt_id A  ─▶ lig_a   (pose A)          lig_a : grp ligand_pose,   parent bound
   .   LIG 301  label_alt_id B  ─▶ lig_b   (pose B)          lig_b : grp ligand_pose,   parent bound
```

**Full CIF** (Tyr120 carries the protein conformation; LIG301 is the ligand in two
poses; `base` = everything single-conformer, not listed).

```
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_alt_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_entity_id
_atom_site.label_seq_id
_atom_site.pdbx_PDB_ins_code
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.occupancy
_atom_site.B_iso_or_equiv
_atom_site.pdbx_formal_charge
_atom_site.auth_seq_id
_atom_site.auth_comp_id
_atom_site.auth_asym_id
_atom_site.auth_atom_id
_atom_site.pdbx_PDB_model_num
ATOM   1  C CB  A TYR A 1 120 ? 25.110 30.220 12.040 0.30 15.20 ? 120 TYR A CB  1
ATOM   2  C CG  A TYR A 1 120 ? 25.880 31.330 12.700 0.30 16.05 ? 120 TYR A CG  1
ATOM   3  C CD1 A TYR A 1 120 ? 27.220 31.220 13.010 0.30 16.90 ? 120 TYR A CD1 1
ATOM   4  C CD2 A TYR A 1 120 ? 25.270 32.540 13.010 0.30 16.84 ? 120 TYR A CD2 1
ATOM   5  C CE1 A TYR A 1 120 ? 27.930 32.300 13.610 0.30 17.55 ? 120 TYR A CE1 1
ATOM   6  C CE2 A TYR A 1 120 ? 25.970 33.620 13.610 0.30 17.41 ? 120 TYR A CE2 1
ATOM   7  C CZ  A TYR A 1 120 ? 27.300 33.500 13.910 0.30 18.02 ? 120 TYR A CZ  1
ATOM   8  O OH  A TYR A 1 120 ? 28.000 34.580 14.510 0.30 19.33 ? 120 TYR A OH  1
ATOM   9  C CB  B TYR A 1 120 ? 25.040 30.110 11.880 0.70 15.80 ? 120 TYR A CB  1
ATOM  10  C CG  B TYR A 1 120 ? 25.700 31.020 12.880 0.70 16.62 ? 120 TYR A CG  1
ATOM  11  C CD1 B TYR A 1 120 ? 27.010 30.770 13.300 0.70 17.40 ? 120 TYR A CD1 1
ATOM  12  C CD2 B TYR A 1 120 ? 25.040 32.160 13.360 0.70 17.33 ? 120 TYR A CD2 1
ATOM  13  C CE1 B TYR A 1 120 ? 27.650 31.620 14.210 0.70 18.07 ? 120 TYR A CE1 1
ATOM  14  C CE2 B TYR A 1 120 ? 25.680 33.010 14.270 0.70 17.96 ? 120 TYR A CE2 1
ATOM  15  C CZ  B TYR A 1 120 ? 26.980 32.740 14.680 0.70 18.55 ? 120 TYR A CZ  1
ATOM  16  O OH  B TYR A 1 120 ? 27.620 33.580 15.580 0.70 19.90 ? 120 TYR A OH  1
HETATM 17 C C1  A LIG B 2 301 ? 29.110 35.880 15.220 0.20 21.40 ? 301 LIG A C1  1
HETATM 18 N N1  A LIG B 2 301 ? 30.330 36.020 14.620 0.20 22.05 ? 301 LIG A N1  1
HETATM 19 O O1  A LIG B 2 301 ? 28.770 36.770 16.010 0.20 22.88 ? 301 LIG A O1  1
HETATM 20 C C1  B LIG B 2 301 ? 29.330 35.520 15.660 0.10 23.10 ? 301 LIG A C1  1
HETATM 21 N N1  B LIG B 2 301 ? 30.610 35.430 15.220 0.10 23.74 ? 301 LIG A N1  1
HETATM 22 O O1  B LIG B 2 301 ? 28.990 36.330 16.560 0.10 24.51 ? 301 LIG A O1  1
#
loop_
_pdbx_alt_groups.id
_pdbx_alt_groups.alt_group_id
_pdbx_alt_groups.auth_asym_id
_pdbx_alt_groups.auth_seq_id_start
_pdbx_alt_groups.auth_seq_id_end
_pdbx_alt_groups.label_alt_id
_pdbx_alt_groups.label_atom_id
1 apo   A 120 120 B .
2 bound A 120 120 A .
3 lig_a A 301 301 A .
4 lig_b A 301 301 B .
#
loop_
_pdbx_heterogeneity_hierarchy.alt_group_id
_pdbx_heterogeneity_hierarchy.coexistence_group_id
_pdbx_heterogeneity_hierarchy.parent_alt_groups_id
base  .             .
apo   protein_state base
bound protein_state base
lig_a ligand_pose   bound
lig_b ligand_pose   bound
#
```

Occupancy check (read straight off the hierarchy):

```
  protein_state (parent base):  apo + bound  = 0.70 + 0.30 = 1.0
  ligand_pose  (parent bound):  lig_a + lig_b = 0.20 + 0.10 = 0.30 = occ(bound)   <- the NESTED sum
  exclusion table: empty
    apo <-> bound exclusive   (share coexistence_group_id protein_state)
    lig_a <-> lig_b exclusive (share coexistence_group_id ligand_pose)
    a ligand never co-occurs with apo, because its parent is bound and bound excludes apo
```

**Who it satisfies.**

- *Stephanie* gets the full structure: the absent ligand finally has a home (the `apo`
  node), nesting is explicit, cardinality is handled by the tree rather than by
  matching letters.
- *gemmi / refinement* gets it with `atom_site` untouched and the exclusion table
  empty — every exclusion here is implied by the tree, which is the simplification
  Martin asked whether was possible. Here the answer is yes.
- *Both*: yes, with one honest caveat — `lig_a + lig_b = occ(bound)` is the **nested**
  sum, tier-3 (new) for refinement. A tier-2 program still reads everything and refines
  the two flat groups; it just treats `bound` as a constant rather than co-refining it.

### Example · D — multi-chain metal coordination (the frontier)

```
FIGURE D — one Ca, coordinated by residues from two chains, each in four alternates

  coordination sphere A                 coordination sphere B  (… and C, D likewise)
    Asp20 (chain A) label_alt_id A        Asp20 (chain A) label_alt_id B
    Glu31 (chain A) label_alt_id A        Glu31 (chain A) label_alt_id B
    Asp55 (chain B) label_alt_id A        Asp55 (chain B) label_alt_id B
    Ca    (chain A) label_alt_id A        Ca    (chain A) label_alt_id B
    coexistence_group_id = coord_sphere   coexistence_group_id = coord_sphere

  legal whole-site states: exactly one of { sphere_a, sphere_b, sphere_c, sphere_d }
  a network spans BOTH chains AND the metal; if two spheres geometrically clash beyond
  being alternatives, that is the one place an explicit NOT row is needed.
```

**The problem.** A calcium at a two-chain interface, coordinated by acidic residues
from both chains each modelled in four alternates (real: 5E1N). The format can place
the four-way alternates and altloc-specific `metalc` bonds, but cannot say which
*cross-chain combination* (chain-A altA + chain-B altA + a metal position) is one
physical coordination sphere — and the metal is usually one full-occupancy atom even
though its ligands have four alternates.

**Categories.** Existing: `_atom_site`, `_struct_conn` (the `metalc` bonds). Proposed:
`_pdbx_alt_groups` (spans chains via `auth_asym_id`), and here `_pdbx_state_coexistence`
**earns its place** — branchy coordination can need geometric exclusions the tree does
not imply.

**Arrow diagram.**

```
 _atom_site rows (one atom per coordinating residue shown; both chains)   alt_group_id
   OD1 ASP chain A 20  label_alt_id A ─┐
   OE1 GLU chain A 31  label_alt_id A  ├──▶ sphere_a
   OD1 ASP chain B 55  label_alt_id A  │
   CA  CA  chain A 201 label_alt_id A ─┘   (metal split into altlocs to join the sphere)
   ... the same atoms at label_alt_id B ──▶ sphere_b   (and C, D)
```

**Full CIF** (shown completely for sphere A and sphere B over the three coordinating
residues plus the metal; spheres C and D repeat the identical pattern at `label_alt_id`
C and D and are noted rather than triplicated). `_struct_conn` carries the
alternate-specific metal bonds and must agree with the networks.

```
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_alt_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_entity_id
_atom_site.label_seq_id
_atom_site.pdbx_PDB_ins_code
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.occupancy
_atom_site.B_iso_or_equiv
_atom_site.pdbx_formal_charge
_atom_site.auth_seq_id
_atom_site.auth_comp_id
_atom_site.auth_asym_id
_atom_site.auth_atom_id
_atom_site.pdbx_PDB_model_num
ATOM   1 O OD1 A ASP A 1 20  ? 10.220 5.110 8.330 0.25 12.40 -1 20  ASP A OD1 1
ATOM   2 O OD1 B ASP A 1 20  ? 10.310 5.020 8.470 0.25 12.95 -1 20  ASP A OD1 1
ATOM   3 O OE1 A GLU A 1 31  ? 12.880 5.660 8.010 0.25 13.10 -1 31  GLU A OE1 1
ATOM   4 O OE1 B GLU A 1 31  ? 12.770 5.540 8.220 0.25 13.55 -1 31  GLU A OE1 1
ATOM   5 O OD1 A ASP B 3 55  ? 11.040 7.980 8.520 0.25 12.70 -1 55  ASP B OD1 1
ATOM   6 O OD1 B ASP B 3 55  ? 11.150 8.090 8.360 0.25 13.22 -1 55  ASP B OD1 1
HETATM 7 CA CA A CA  A 4 201 ? 11.380 6.450 8.290 0.25 11.80 +2 201 CA  A CA  1
HETATM 8 CA CA B CA  A 4 201 ? 11.420 6.510 8.350 0.25 12.05 +2 201 CA  A CA  1
#
loop_
_pdbx_alt_groups.id
_pdbx_alt_groups.alt_group_id
_pdbx_alt_groups.auth_asym_id
_pdbx_alt_groups.auth_seq_id_start
_pdbx_alt_groups.auth_seq_id_end
_pdbx_alt_groups.label_alt_id
_pdbx_alt_groups.label_atom_id
1 sphere_a A 20  20  A .
2 sphere_a A 31  31  A .
3 sphere_a B 55  55  A .
4 sphere_a A 201 201 A .
5 sphere_b A 20  20  B .
6 sphere_b A 31  31  B .
7 sphere_b B 55  55  B .
8 sphere_b A 201 201 B .
#
loop_
_pdbx_heterogeneity_hierarchy.alt_group_id
_pdbx_heterogeneity_hierarchy.coexistence_group_id
_pdbx_heterogeneity_hierarchy.parent_alt_groups_id
base     .            .
sphere_a coord_sphere base
sphere_b coord_sphere base
#
loop_
_pdbx_state_coexistence.id
_pdbx_state_coexistence.rule
_pdbx_state_coexistence.heterogeneity_id
_pdbx_state_coexistence.heterogeneity_ids
1 NOT sphere_a sphere_b
#
loop_
_struct_conn.id
_struct_conn.conn_type_id
_struct_conn.ptnr1_label_asym_id
_struct_conn.ptnr1_label_seq_id
_struct_conn.ptnr1_label_atom_id
_struct_conn.pdbx_ptnr1_label_alt_id
_struct_conn.ptnr2_label_asym_id
_struct_conn.ptnr2_label_seq_id
_struct_conn.ptnr2_label_atom_id
_struct_conn.pdbx_ptnr2_label_alt_id
metalc1 metalc A 20  OD1 A A 201 CA A
metalc2 metalc A 31  OE1 A A 201 CA A
metalc3 metalc B 55  OD1 A A 201 CA A
metalc4 metalc A 20  OD1 B A 201 CA B
metalc5 metalc A 31  OE1 B A 201 CA B
metalc6 metalc B 55  OD1 B A 201 CA B
#
```

(Spheres C and D add `_pdbx_alt_groups` rows at `label_alt_id` C and D, two more
hierarchy rows, the `metalc` bonds at C and D, and — if any further pair clashes —
more `_pdbx_state_coexistence` rows. The four-way `NOT` between all spheres is the
shared `coexistence_group_id`; the explicit `NOT` rows are only for any *extra*
geometric clash the grouping does not already imply.)

**Who it satisfies.**

- *Stephanie* gets a coordination set that is one named object spanning chains and the
  metal.
- *gemmi / refinement* gets the cross-chain network for free (the loop carries
  `auth_asym_id`) and the exclusions as explicit, ordinary `NOT` rows.
- *Both, with named frontier costs* (the same ones the page flags): the metal must be
  split into altlocs to join a sphere; the `metalc` bonds in `_struct_conn` and the
  membership loop must be kept consistent by hand; and several geometric exclusions may
  need several `NOT` rows. This is the one case where the optional exclusion table is
  not empty — which is precisely why it is kept (optional) rather than dropped.

---

## Honest gaps

Stated plainly, so no one is surprised later:

- **Nested occupancy *refinement* is new** (the tier-3 sum in cases C/D). No mainstream
  program co-refines a child group against a refinable parent today. The format records
  it; fitting it is an opt-in extension.
- **The metal's single position vs. its alternates** (case D). Joining a one-position
  metal to per-altloc spheres forces splitting it, and the `_struct_conn` bonds must be
  kept consistent — a real bookkeeping cost, not yet automated.
- **Higher-arity exclusions.** A `NOT` between a *pair* covers almost everything. If you
  ever need "these three may co-occur in any pair but never all three at once," a pair
  list cannot say it — the `_pdbx_state_coexistence` row would have to be read as a
  forbidden *tuple*. Rare, but worth one sentence in the dictionary.
- **Cross-branch occupancy *locking*** — forcing two networks in different branches to
  share one occupancy value — is expressible by neither the tree nor the `NOT` table. It
  happens to coincide with what no refinement program supports anyway, so it is out of
  scope, but it is a real gap, not a covered one.

Update: the nested-occupancy (tier-3) and cross-branch-locking gaps now have an explicit,
portable home — see the companion `_reconciliation_memo_occupancy.md`, which makes the
occupancy-group *specification* first-class (a completeness flag and a refined-vs-fixed flag on
`_pdbx_heterogeneity_hierarchy`) and adds an optional `_pdbx_occupancy_constraint` equation list
that carries the lock (`equals_group`) and the DAG (`linear`) as tier-3 spec. It closes them as
*recorded* relations, not as anything a refinement program fits yet — and that doc's last example
isolates the coupling that genuinely remains beyond even this: a *product* (statistical
independence), which no linear equation list reaches.

---

## Reading the progression

Case A needs nothing. From B on, the missing fact is always the same — *which
alternates across the structure co-occur* — and the reconciliation answers it the same
way every time: name the networks in `_pdbx_alt_groups`, nest them in
`_pdbx_heterogeneity_hierarchy`, and reach for `_pdbx_state_coexistence` only when two
branches genuinely clash (case D). Against the page's three columns, this fourth one
keeps Martin's untouched `atom_site` and residue-range default, borrows Stephanie's
reach through the one added `label_atom_id` escape hatch (case B+), and makes the
occupancy nesting (case C) explicit and portable instead of leaving it in a refinement
script. The price over Martin's version is exactly one optional column and one usually-
empty table; the gain over both is that a single encoding satisfies the expressiveness
side and the don't-touch-`atom_site` side at once.

---

## Addendum · Bonds, metal coordination, and the consistency cost

Case D leans on `_struct_conn` `metalc` records without saying what they are, and the
question is fair: *are the metal "bonds" different from regular bonds, and how are bonds
recorded in mmCIF at all?* The short answer is that an mmCIF file records almost no bonds
at all — most are reconstructed by the reader — and the few it does record live in a
category (`_struct_conn`) that is an annotation layer entirely separate from the
heterogeneity grouping. Metal coordination is one row in that layer. Understanding this
pins down exactly where the bookkeeping cost in Case D comes from: it is not a property
of the bond, it is the cost of two independent pointers into `atom_site` that nothing
forces to agree.

### How an ordinary bond is recorded — mostly, it isn't

There is no bond column in `_atom_site`. A coordinate file states *where the atoms are*,
not *what is bonded to what*. Connectivity for a standard residue is not in the file —
it is looked up from the **Chemical Component Dictionary (CCD)**, the external catalogue
keyed by `_chem_comp.id`. The reader matches a residue's `label_comp_id` (`ASP`) and each
`label_atom_id` (`CB`, `CG`, `OD1`, …) to the CCD template for that component and draws
the template's bonds. The standard polymer linkage (the peptide `C–N`, the phosphodiester
backbone) is not written either; it is implied by consecutive `label_seq_id` within one
`entity_poly` and the reader adds it.

```
FIGURE E1 — where intra-residue connectivity actually comes from

  _atom_site (positions only, NO bond column)        the bond list is NOT here
    CB  ASP A 30   x y z
    CG  ASP A 30   x y z          _chem_comp.id = ASP
    OD1 ASP A 30   x y z   ──────────────────────────▶  CCD template for ASP
    OD2 ASP A 30   x y z       (match comp_id + atom_id)   _chem_comp_bond:
                                                              CB–CG  sing
                                                              CG–OD1 doub
                                                              CG–OD2 sing
                                                            … reader draws THESE

  fallback when no template / no record is trusted:
    atom ──(within covalent_radii + tolerance?)──▶ draw a bond   [heuristic]
```

The CCD's bond list is the category `_chem_comp_bond` (`atom_id_1`, `atom_id_2`,
`value_order`); a modern wwPDB file often embeds a copy of it for the components it uses
(5E1N's revision history shows `_chem_comp_bond` edits), but it is canonically external —
the file points at the component, the component carries the bonds.

```
loop_
_chem_comp_bond.comp_id
_chem_comp_bond.atom_id_1
_chem_comp_bond.atom_id_2
_chem_comp_bond.value_order
ASP CB  CG  sing
ASP CG  OD1 doub
ASP CG  OD2 sing
```

When neither a template nor an explicit record is available or trusted — a bare minimal
file, a legacy PDB-format file (whose `CONECT` records cover only some `HETATM`/special
cases), a stripped export — the reader falls back to **distance-based bond perception**:
draw a bond between two atoms if they sit within the sum of covalent radii plus a
tolerance. The tolerance and the element handling differ between programs, so PyMOL,
Chimera, Coot, and gemmi can and do disagree about the same coordinates. That is the
"various levels of fidelity": connectivity is a *reconstruction*, and different
reconstructers reconstruct differently.

### The explicit layer — `_struct_conn`

The bonds an mmCIF file *does* write down are exactly the ones a per-component template
cannot supply: connections that span two components or are structure-specific. They live
in `_struct_conn`, with the kind named by `conn_type_id` and enumerated in
`_struct_conn_type`:

- `disulf` — a disulfide bridge (Cys `SG`–`SG`);
- `covale` — a covalent link between residues/entities (a glycosidic bond, a covalent
  ligand, a post-translational modification);
- `metalc` — **metal coordination** (the case at hand);
- `hydrog` — a hydrogen bond.

Each partner is named by its full atom key, **including the altloc**, so a connection can
be specific to one alternate:

```
loop_
_struct_conn_type.id
disulf
metalc
#
loop_
_struct_conn.id
_struct_conn.conn_type_id
_struct_conn.ptnr1_label_asym_id
_struct_conn.ptnr1_label_seq_id
_struct_conn.ptnr1_label_atom_id
_struct_conn.pdbx_ptnr1_label_alt_id
_struct_conn.ptnr2_label_asym_id
_struct_conn.ptnr2_label_seq_id
_struct_conn.ptnr2_label_atom_id
_struct_conn.pdbx_ptnr2_label_alt_id
disulf1 disulf A 26 SG . A 84 SG .      # a "regular" covalent bond, no alternates
```

This is the same machinery whether the row is a disulfide or a metal contact. The
category is sparse: it lists only the notable, non-template connections, and a file with
none of them is perfectly valid.

### `metalc` in Case D — the same row, different physics

A `metalc` record is mechanically identical to the `disulf` row above: same category,
same columns, same altloc-aware partner keys. The **only** structural difference is
`conn_type_id = metalc`. What differs is the chemistry it stands for, and that has
consequences for how it must be stored:

- A disulfide or peptide bond is a shared-electron **covalent** bond: short
  (≈1.3–2.0 Å), fixed bond order, and — crucially — *already in the template world*
  (the CCD knows `SG–SG` once the link is declared).
- Metal coordination is a **dative / electrostatic** interaction, not a covalent bond:
  longer and far more variable (Ca–O ≈ 2.1–2.6 Å; in 5E1N the Thr26 carbonyl O
  coordinates `CA` at 2.33 / 2.45 / 2.65 / 2.10 Å across altlocs A–D), variable
  coordination number, no well-defined bond order. There is **no CCD template** for it,
  because it joins the metal `HETATM` to a protein residue — two separate components.

So a `metalc` bond *cannot be reconstructed* from component templates the way an
intra-residue bond can. If it is not written into `_struct_conn`, it is either lost or
left to distance-based perception — and perceivers handle metals badly, drawing a covalent
stick where there is a coordinate bond, missing long contacts, or over-coordinating. This
is why metal sites are precisely where "let the viewer figure out the bonds" fails, and
why the records are deposited explicitly. It is also why Case D is the one case that drags
`_struct_conn` into the heterogeneity picture at all: the coordination geometry is real
data, it is altloc-specific, and it has nowhere else to live.

### Where the consistency cost actually lives

Here is the point the "Honest gaps" metal bullet was gesturing at, made concrete. In Case
D, **two different categories point into the same `atom_site` rows, independently, and
nothing in the dictionary forces them to agree:**

```
ARROW DIAGRAM — two independent pointers at one set of atoms

                         _atom_site rows
                      (chain, seq, atom, altloc)
                    OD1 ASP A 20  altloc A
                    OE1 GLU A 31  altloc A
                    OD1 ASP B 55  altloc A
                    CA  CA  A 201 altloc A
                      ▲                    ▲
       membership     │                    │     coordination
   _pdbx_alt_groups   │                    │   _struct_conn (metalc)
   selects these by   │                    │   names these by
   (asym, seq-range,  │                    │   (ptnr asym/seq/atom,
    label_alt_id) ────┘                    └──── pdbx_ptnrN_label_alt_id)

   sphere_a = { the four rows above }      metalc1..3 = OD1·A→CA·A, OE1·A→CA·A, OD1·A→CA·A
                    \                              /
                     \____ must name a consistent set ____/
                        (no dictionary link enforces it)
```

`_pdbx_alt_groups` says "these four atoms at altloc A are the network `sphere_a`."
`_struct_conn` says "these same atoms at altloc A coordinate the calcium at altloc A." Both
are correct and necessary; neither references the other. The moment the metal is split
into altlocs to join a sphere (recall the metal is usually modelled as one full-occupancy
atom even though its ligands have four alternates), the depositor must edit **both** loops
and keep the `(atom, altloc)` tuples matching by hand. Drift between them — a `metalc`
row at altloc `B` whose partner the membership loop assigned to `sphere_a` at altloc `A` —
is silently inconsistent; nothing in the format catches it.

So the metal "bond" is not a special kind of bond as far as the format is concerned — it
is an ordinary `_struct_conn` row whose chemistry happens to make it un-reconstructable, so
it must be present, and whose altloc-specificity happens to overlap the heterogeneity
grouping, so it must agree with it. The cost in Case D is the cost of that overlap, not of
the bond. The reconciliation does not remove it; it localises it to the one case where
coordination and alternates coincide, and names it plainly so a depositor knows the two
loops are theirs to keep in sync.
