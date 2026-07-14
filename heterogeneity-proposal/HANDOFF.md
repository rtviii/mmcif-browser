# Handoff — heterogeneity proposal page

Branch `grouped_occupancy_proposal`. Everything below is uncommitted. `npx tsc --noEmit` and
`npx next build` are clean; `check_examples.py` passes 44/44.

The page has now been looked at in a browser. Direction is right; the list below is what came back.
**Start here — everything in this section is the next session's job.**

---

# NEXT SESSION — the work list

## 1. BUG: section 04 renders no file text (fix first, it is one line)

The figure titled *"the file today — the correlation is unwritten"* shows the header comments and
then nothing. The `_atom_site` loop is missing entirely.

Cause: `StageFigure` passes `truncateBefore="_pdbx_alt_groups"`, and `CifPanel`'s cutoff does

```ts
const hit = doc.lines.findIndex((l) => l.text.includes(truncateBefore));
```

`ex_ef_hand.cif` **line 18 is a comment** — "The `_pdbx_alt_groups` / `_pdbx_heterogeneity_hierarchy`
rows below write it down." That comment is the first `includes` hit, so the cutoff lands at line 18
and truncates the whole file, including the coordinates. The real category declaration is at line
323.

Fix in `CifPanel.tsx`, the `cutoff` useMemo: match only a line whose **trimmed text starts with** the
marker, so a mention inside a comment cannot trigger it:

```ts
const hit = doc.lines.findIndex((l) => l.text.trimStart().startsWith(truncateBefore));
```

Then re-check section 04 actually shows the atom rows. (Do not "fix" this by rewording the CIF
comment — the matcher is the thing that is wrong.)

## 2. Not a bug, but confusing: section 04 has no network/state chips

That figure is deliberately `het={false}` — it is "the file as it exists today", which has no
annotation, so there is nothing to make chips out of. The 3D is coloured by *altloc letter*
(`colorTheme: "alt-loc"`), which is why colours appear with no legend under them. This reads as
broken even though it is intentional. Add a one-line note in the control-strip slot for the
unannotated case, e.g. *"no heterogeneity annotation in this file — colour is the raw altloc
letter"*, so the empty strip is explained rather than absent.

## 3. Chips get cut off

`HetControls` lives in the right-hand column, which is `lg:w-[440px]`. `ChipRow` is
`whitespace-nowrap overflow-x-auto`, so `ex_ef_hand`'s six networks and eight states run off the
right edge and are silently clipped (see: `seg2_B` half-visible).

Move the control strip **out of the viewer column and under the whole figure**, spanning code panel
+ viewer, and let it wrap. It has the full 94vw to work with there; nothing needs to be clipped. Keep
the labelled-row layout (it is the part that works).

## 4. Scrollbars in the file panel

Remove both. `globals.css` already has `.no-scrollbar` (used by the Inspector's source viewport) —
apply it to `CifPanel`'s scroll container. Scrolling still works, the bars just stop being drawn.

## 5. Collapsible figures

The full-bleed figures break the reading flow. Make each collapse to its title bar; clicking expands
it to what it is now. **Default collapsed.**

Do the Mol* mount lazily as part of this — today all eight viewers instantiate on page load, which is
the page's main cost. Collapsed-by-default plus mount-on-expand fixes the reading flow and the load
time in one move.

## 6. Rename the examples — informative, PDB-anchored, used consistently

Current names (`ex_ef_hand`, `ex_subresidue`, `ex_dag`, …) are slick rather than informative, and
the on-page figure titles are long prose that does not match the filenames. Give each one name that
carries the entry id, and use that *same* name in the filename, the figure title, the glossary, and
any prose reference. Something in the shape of:

| now | suggested |
|---|---|
| `ex_minimal` | `1EJG_minimal` |
| `ex_rotamer` | `1EJG_rotamer` |
| `ex_ef_hand` | `5E1N_ca_site` |
| `ex_subresidue` | `5E1N_gln8_split` |
| `ex_nesting` / `_occ` | `7HHS_apo_bound` / `7HHS_apo_bound_occ` |
| `ex_exclusion` | `5E1N_arg74_clash` |
| `ex_dag` | `constructed_two_pocket` |

Rename in `carve_examples.py` (the `write_cif` calls), `check_examples.py`, and the `fileUrl` +
`codeTitle` props in `ProposalPage.tsx`. Same treatment for the section headings — make them
informative, not clever.

## 7. Contents → a real sidebar

Turn the horizontal contents strip into a sticky left sidebar with navigable links, and put the
example glossary at the bottom of that sidebar as a collapsible element (rather than as the appendix
section it is now).

## 8. Typography: wider still, smaller still

`article` is `max-w-[880px]`, body is `text-[14px] leading-[1.75]`. Go wider and smaller again. Note
the figures are already full-bleed (`w-[94vw]`) and unaffected by the prose column width.

---

## What the /proposal page now is

A technical document: the problem, what mmCIF supports today, what is proposed. All framing of the
working group as a social process — "why it is contested", "the negotiation", "the deck flags", "the
move for the next meeting" — is gone. Thirteen numbered sections plus an appendix glossary.

## The examples are real now

`app/public/examples/het/*.cif` are carved from deposited entries by `scripts/carve_examples.py`;
coordinates are copied verbatim from the archive. The old synthetic files were not merely ugly, they
were **false**: the two residues Case B claimed were hydrogen-bonded were 17.9 Å apart, Case C's
ligand sat 1.3 Å *inside* the gate residue it was supposed to open, and Case D's Ca–O distances were
1.6–1.8 Å against a real 2.1–2.6 Å. Every "these things are coupled because…" sentence in the old
prose was contradicted by its own coordinates.

| file | entry | what it carries |
|---|---|---|
| `ex_minimal` / `ex_rotamer` | 1EJG | the baseline; an isolated rotamer (Arg10, 0.67/0.33) |
| `ex_ef_hand` | 5E1N | the Ca-203 EF-hand: two correlated segments with **different letter sets** ({B,D} vs {A,B,C,D}), each summing to 1.00, both coordinating the same ion. Network definitions are the working group's own, from `source_docs/5E1N_hierarchy_20250423.cif`, clipped to the carved window. Carries the deposited altloc-specific `metalc` bonds. Used twice: unannotated (§04) and annotated (§06). |
| `ex_subresidue` | 5E1N | Gln8: its amide H belongs to the residues 6–7 network, its side chain to its own — **same residue, same letter A, two networks**. There are 28 such (residue, altloc) pairs in the annotated 5E1N. This is the real `label_atom_id` case. |
| `ex_nesting` / `_occ` | 7HHS | apo 0.78 / bound 0.22, two exclusive poses at 0.13 and 0.09. **0.13 + 0.09 = 0.22 = occ(bound)** — the nesting rule, in deposited numbers. |
| `ex_exclusion` | 5E1N | the one real `NOT`: Arg74 alt B lands 2.14 Å from water 468. Alts C and D clear it by 3.97/4.80 Å, so the exclusion is alternate-specific and cannot be inferred from the tree. |
| `ex_dag` | **constructed** | the two-pocket graph. No deposited counterpart exists (it is a constructed case in the source deck too). Labelled as constructed on the page and in the appendix. |

`check_examples.py` re-measures the files and asserts every geometric claim the page makes — run it
after any change to the examples. This is the check that was missing the first time.

## Two behavioural fixes in `lib/molstar/het.ts`

Both were surfaced by the real data and would have made the new examples render wrongly:

1. **Incomplete coexistence groups.** The state enumerator forced every group to choose exactly one
   member, so the partially-occupied water in `ex_exclusion` (0.54) was treated as always present and
   `arg74_B` appeared in *no* legal state. A group whose occupancies sum to less than its parent's is
   now incomplete, and "none of them" is a legal choice. Derived from occupancies alone, so it needs
   no extra annotation.
2. **State probabilities** now charge a state for the groups it leaves *empty*, so "ligand, bottom
   pocket empty" comes out at 0.25 rather than 0.50.

## Still open

**The 5E1N schema conflict — settle before the page circulates.** The working group's own annotated
file, `source_docs/5E1N_hierarchy_20250423.cif`, carries **`_atom_site.pdbx_heterogeneity_id`** — a
per-atom column on the coordinate table — and uses the schema `.name / .parent / .id / .details`
rather than this proposal's `.alt_group_id / .coexistence_group_id / .parent_alt_groups_id`. The
existing prototype therefore takes exactly the per-atom route this proposal's central principle
rejects. The page does not mention this (deliberately, for this pass). It is the most obvious
objection anyone in the working group will raise. The good news: `ex_subresidue` is precisely the
case that *motivated* their column, so the argument for `label_atom_id` as the non-invasive
equivalent is already made on the page — it just is not stated against the prototype.

**The graph spelling** is still undecided: keep the tree + a `linear` constraint (what the page and
the viewer implement), or make the hierarchy a graph with `_pdbx_heterogeneity_edge` and typed
`sum_to` / `equal` ties. Both hold the EDO case; neither reaches the product wall.

**Three more annotated CIFs exist and are not in this repo.** Justin posted `3NYD_hierarchy.cif`,
`3K0N_hierarchy.cif` and `6DMH_hierarchy.cif` to the encoding channel. 3NYD has a chain-B
translation — a large-scale correlated motion, which nothing on the page currently shows — and 3K0N
needed no coexistence table at all. Worth asking for.

## Not verified

The page has **not** been driven in a browser. Typecheck and production build are clean, and the het
parser plus the new network→line index were exercised offline against every example file, but the
layout, the sticky headers and the chip→line snapping have not been looked at.
