# Handoff — rework the proposal to states + bundles (v3)

## What was decided

The grouped-occupancy proposal is dropping the `_pdbx_occupancy_relationship` machinery entirely
(the typed `equal` / `sum_to` ties and their member table) and committing to a single mechanism for
correlated occupancy: explicit **states** grouped into **bundles**. The full spec, with both worked
examples and the reasoning, is in `/grouped_occupancies_v3.md` at the repo root — read that first;
it is the source of truth for this rework.

Net effect on the schema:

- ADD    `_pdbx_het_state`          (id, bundle_id, occupancy, details)
- ADD    `_pdbx_het_state_members`  (state_id, alt_group_id)
- DELETE `_pdbx_occupancy_relationship` and `_pdbx_occupancy_relationship_member`
- RENAME `_pdbx_state_coexistence` -> `_pdbx_forbidden_states`

`het_state` / `het_state_members` do not exist anywhere in the repo yet (confirmed: zero hits for
`cluster_id`, `het_species`, `het_state`), so they are a clean addition. `occupancy` on a state is
the JOINT occupancy of the whole combination; a network's marginal (what `atom_site` carries) is the
sum over states containing it. `bundle_id` is the unit of correlation and the firewall against
blow-up.

## Reference map (verified locations)

Rename `state_coexistence -> forbidden_states` touches:
- `pipeline/data/mmcif_pdbx_v50_het_ext.dic`      (category + item save frames)
- `pipeline/build_artifacts.py`                   (references the name — check category list/order)
- `app/src/lib/cif-source/classify.ts`
- `app/src/lib/molstar/het.ts`
- `app/src/lib/molstar/het-lines.ts`
- `app/src/lib/molstar/examples.ts`
- `app/src/components/proposal/ProposalPage.tsx`
- `app/public/examples/het/5E1N_arg74_clash.cif`
- regenerated: `app/public/data/dictionary.het.json`, `graph.het.json`

Delete `occupancy_relationship` touches:
- `pipeline/data/mmcif_pdbx_v50_het_ext.dic`
- `app/src/components/proposal/ProposalPage.tsx`   (the `#locks` section + category constants + cards)
- `app/src/lib/molstar/examples.ts`, `het-lines.ts`
- `app/public/examples/het/constructed_ncs_lock.cif`  (the only .cif that uses it)
- regenerated JSON

## Steps

1. **Dictionary** (`pipeline/data/mmcif_pdbx_v50_het_ext.dic`)
   - Delete the two `occupancy_relationship` save frames.
   - Add `_pdbx_het_state` and `_pdbx_het_state_members` save frames (category description + item
     defs; occupancy description must state it is the joint of the combination, marginal = sum).
   - Rename `_pdbx_state_coexistence` save frames to `_pdbx_forbidden_states` (category id everywhere,
     including `_item.category_id`).
   - Hierarchy trim — see decision A below.

2. **Regenerate artifacts**: run `pipeline/build_artifacts.py`; confirm `dictionary.het.json` and
   `graph.het.json` now show `pdbx_het_state`, `pdbx_het_state_members`, `pdbx_forbidden_states`, and
   no `occupancy_relationship`. Check `build_artifacts.py` for any hardcoded category list that needs
   the new names.

3. **Examples** (`app/public/examples/het/`)
   - `constructed_two_pocket.cif` (+ `_flat`): convert to states/bundles per Example 1 of the spec.
     Reconsider whether `_flat` is still needed once states are canonical.
   - `5E1N_arg74_clash.cif`: rename `_pdbx_state_coexistence` -> `_pdbx_forbidden_states`; drop the
     now-redundant hierarchy occupancy columns (keep `coexistence_group_id`).
   - `constructed_ncs_lock.cif`: decision B — this example only exists to show the deleted `equal`
     relationship. Likely cut it.
   - Grep the other het examples for stray `state_coexistence` / `occupancy_relationship`.

4. **Website** (`app/src/components/proposal/ProposalPage.tsx`)
   - Category-name constants (~lines 29-30): drop the two `occupancy_relationship` names; add
     `pdbx_het_state`, `pdbx_het_state_members`; rename `pdbx_state_coexistence` ->
     `pdbx_forbidden_states`.
   - `#locks` section: currently the NCS-lock / relationship narrative. Replace with a states+bundles
     section built on the EDO example — introduce the joint, `bundle_id` as the correlation unit, and
     the "empty pocket by omission" reading.
   - `#open` section: remove the `equal` / `sum_to` / linear-coefficients paragraphs (that machinery
     is gone). Keep the product wall. Fold in the marginal-vs-joint material from the spec's second
     note (Bragg gives marginals, the joint is diffuse/annotation, underdetermination is the
     justification) — it is the strongest thing to say to the refinement audience.
   - CategoryCard defs (~1442-1465): drop relationship cards; add `het_state` / `het_state_members`;
     rename the coexistence card.
   - Remove the `constructed_ncs_lock` StageFigure; sweep all `<Cat>` / `<It>` refs to renamed names.

5. **Other source** (`classify.ts`, `het.ts`, `het-lines.ts`, `examples.ts`): apply the
   `state_coexistence -> forbidden_states` rename and remove `occupancy_relationship` handling / the
   `constructed_ncs_lock` entry in `examples.ts`.

6. **Verify**: `npx tsc --noEmit`, then `next build`. Do NOT drive the browser (per the standing
   preference) — typecheck, build, and hand back a list of sections to eyeball.

## Decisions to make before/while doing this

- **A. Hierarchy columns.** With a bundle enumerating the joint, `parent_alt_groups_id`,
  `occupancy_completeness`, `occupancy_refine_flag`, `occupancy_value` are redundant. Recommend:
  drop them, keep `coexistence_group_id` (still needed for mutual exclusion within a site).
  `state_kind` (compositional/conformational) is borderline-derivable — keep as optional or cut?
- **B. NCS equal-occupancy lock.** This is the one thing relationships did that states do not: two
  NCS copies restrained to *equal* occupancy is a refinement restraint, not a joint distribution.
  Confirm we accept losing its dedicated encoding (we argued yes — it is provenance, not
  heterogeneity structure) and cut `constructed_ncs_lock`, with a one-line note in `#open`.
- **C. Provenance column.** Add one optional column on `_pdbx_het_state`
  (fit / restraint / assert / measured) to record how a population was obtained? It subsumes the
  NCS-equal case and answers the refinement audience's first question. One column, not a category.
- **D. forbidden_states field names.** Current `heterogeneity_id` / `heterogeneity_ids` actually hold
  `alt_group` ids — confusing. While renaming the category, align them to `alt_group_id` /
  `alt_group_ids`? Low priority, but it is the moment to do it.

## Context notes carried from the working session (for the fall meeting)

- Does it blow up: exponential only *within* a bundle, never across the structure; independent sites
  are separate bundles and add, not multiply; ribosome ~ linear in partial sites; BinaryCIF collapses
  the repetition. In the spec.
- Where the joint comes from in the data: Bragg = marginals (one-body); the joint is a correlation
  (many-body) in diffuse scattering, discarded by standard refinement, so for separated sites it is
  underdetermined and comes from chemistry / time-resolved / cryo-EM classification, not the fit. The
  underdetermination is *why* the category must exist. In the spec.
- This supersedes the "10 defects" next-work list in `HANDOFF.md` for the relationship-related items,
  since those categories are being removed. The dictionary/figure-generator consistency lessons from
  that audit still apply to the new categories.
