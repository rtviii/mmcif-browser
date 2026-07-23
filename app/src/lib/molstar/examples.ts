import type { StructureView } from "./style";

// The CIF block where this example's heterogeneity is actually encoded — usually a category that is
// absent from most PDB entries. Surfaced as a clickable chip that jumps the source pane to it.
export interface ExampleSignature {
  category: string; // CIF category name (no leading underscore)
  field?: string; // optional specific column within the category
  note: string; // one-line "what's encoded here"
}

// A curated structure that demonstrates one kind of structural heterogeneity, rendered with a
// representation/colour theme chosen to surface that feature in 3D. Normally fetched from RCSB by
// `pdbId`; if `file` is set it is fetched from that bundled URL instead (used for the
// heterogeneity-extension examples, which are carved local sites rather than whole entries).
// `motion`, when set, enables an in-viewer animation: 'frames' scrubs/plays the models, 'tls'
// animates the rigid-body libration from the TLS tensors, 'wiggle' runs Mol*'s shader thermal
// animation from the B-factor.
export interface StructureExample {
  id?: string; // stable key (defaults to pdbId); needed when several examples carve the same entry
  pdbId: string; // RCSB id, or a short label (e.g. "constructed") for bundled files
  file?: { url: string; name: string }; // bundled local CIF; fetched instead of RCSB when present
  title: string;
  blurb: string;
  view: StructureView;
  signature: ExampleSignature;
  motion?: "frames" | "tls" | "wiggle";
}

export interface ExampleGroup {
  label: string;
  note?: string;
  items: StructureExample[];
}

// Each entry was checked against the live RCSB file for the data it claims to show: 1ejg/1us0 carry
// _atom_site_anisotrop; 1d3z/2k39 are 10- and 116-model NMR ensembles; 2rh1 carries pdbx_refine_tls*.
export const EXAMPLE_GROUPS: ExampleGroup[] = [
  {
    label: "B-factors",
    note: "colour = atomic displacement (uncertainty theme: blue low → red high)",
    items: [
      {
        pdbId: "1cbs",
        title: "Retinoic-acid-binding protein",
        blurb: "1.8 Å · play the wiggle to shake each atom by its B-factor",
        view: { representation: "ball-and-stick", colorTheme: "uncertainty" },
        signature: { category: "atom_site", field: "B_iso_or_equiv", note: "isotropic B-factors are the B_iso_or_equiv column of _atom_site" },
        motion: "wiggle",
      },
      {
        pdbId: "1ubq",
        title: "Ubiquitin",
        blurb: "1.8 Å · putty tube, radius ∝ B-factor",
        view: { representation: "putty", colorTheme: "uncertainty" },
        signature: { category: "atom_site", field: "B_iso_or_equiv", note: "isotropic B-factors are the B_iso_or_equiv column of _atom_site" },
      },
    ],
  },
  {
    label: "Anisotropic ADPs (ANISOU)",
    note: "thermal ellipsoids drawn from _atom_site_anisotrop",
    items: [
      {
        pdbId: "1ejg",
        title: "Crambin",
        blurb: "0.54 Å · ADP ellipsoids",
        view: { representation: "ellipsoid", colorTheme: "element-symbol" },
        signature: { category: "atom_site_anisotrop", note: "per-atom anisotropic U tensors (U[1][1]…) — absent from most PDB entries" },
      },
      {
        pdbId: "1us0",
        title: "Aldose reductase",
        blurb: "0.66 Å · ADP ellipsoids (larger, slower to draw)",
        view: { representation: "ellipsoid", colorTheme: "element-symbol" },
        signature: { category: "atom_site_anisotrop", note: "per-atom anisotropic U tensors (U[1][1]…) — absent from most PDB entries" },
      },
    ],
  },
  {
    label: "Alternate conformations (altloc)",
    note: "both conformers drawn; colour = label_alt_id (A green / B red / shared grey)",
    items: [
      {
        pdbId: "2vb1",
        title: "Lysozyme",
        blurb: "0.65 Å · many split side chains",
        view: { representation: "ball-and-stick", colorTheme: "alt-loc" },
        signature: { category: "atom_site", field: "label_alt_id", note: "alternate conformers are tagged in the label_alt_id column of _atom_site" },
      },
      {
        pdbId: "3nir",
        title: "Crambin",
        blurb: "0.48 Å · A/B/C/D conformers",
        view: { representation: "ball-and-stick", colorTheme: "alt-loc" },
        signature: { category: "atom_site", field: "label_alt_id", note: "alternate conformers are tagged in the label_alt_id column of _atom_site" },
      },
    ],
  },
  {
    label: "Multi-model ensembles",
    note: "use the frame slider / play button in this bar to scrub models",
    items: [
      {
        pdbId: "1d3z",
        title: "Ubiquitin (NMR)",
        blurb: "10 models · ball-and-stick",
        view: { representation: "ball-and-stick", colorTheme: "element-symbol" },
        signature: { category: "pdbx_nmr_ensemble", note: "an NMR ensemble; each model is a full copy keyed by atom_site.pdbx_PDB_model_num" },
        motion: "frames",
      },
      {
        pdbId: "2k39",
        title: "Ubiquitin (RDC-refined NMR)",
        blurb: "116 models · large (~12 MB), play to see backbone motion",
        view: { representation: "ball-and-stick", colorTheme: "element-symbol" },
        signature: { category: "pdbx_nmr_ensemble", note: "an NMR ensemble; each model is a full copy keyed by atom_site.pdbx_PDB_model_num" },
        motion: "frames",
      },
    ],
  },
  {
    label: "TLS refinement",
    note: "play the libration to see each rigid body rock about its TLS axis",
    items: [
      {
        pdbId: "2rh1",
        title: "β2-adrenergic receptor",
        blurb: "3 TLS rigid bodies · animated libration",
        view: { representation: "ball-and-stick", colorTheme: "uncertainty" },
        signature: { category: "pdbx_refine_tls_group", note: "rigid-body TLS groups; the T/L/S tensors they reference live in _pdbx_refine_tls" },
        motion: "tls",
      },
    ],
  },
  {
    // Local sites carved out of deposited entries by heterogeneity-proposal/scripts/carve_examples.py,
    // then annotated with the proposed _pdbx_alt_groups / _pdbx_heterogeneity_hierarchy /
    // _pdbx_state_coexistence / _pdbx_occupancy_relationship categories. The coordinates are copied
    // verbatim from the archive (the two constructed files excepted, and labelled as such); only the
    // annotation is new, since by definition it does not exist in the archive yet. These are the same
    // files the /proposal page walks through. Switch the dictionary to "het" (top bar) to see the new
    // categories linked, and use the heterogeneity controls to colour by network / step through the
    // legal states.
    label: "Heterogeneity networks (proposed extension)",
    note: "the proposed correlated-alternate categories — switch the dict to 'het' to see them linked",
    items: [
      {
        id: "1EJG_rotamer",
        pdbId: "1EJG",
        file: { url: "/examples/het/1EJG_rotamer.cif", name: "1EJG_rotamer.cif" },
        title: "One residue, two rotamers",
        blurb: "baseline · Arg10 A 0.67 / B 0.33 · no new categories needed",
        view: { representation: "ball-and-stick", colorTheme: "alt-loc" },
        signature: { category: "atom_site", field: "label_alt_id", note: "a single side chain in two positions — both alternatives sit inside one residue, so the letter alone is enough and the new categories earn nothing" },
      },
      {
        id: "5E1N_ca_site",
        pdbId: "5E1N",
        file: { url: "/examples/het/5E1N_ca_site.cif", name: "5E1N_ca_site.cif" },
        title: "Correlated network at a calcium site",
        blurb: "EF-hand · 6 networks, 2 occupancy groups, different letter sets",
        view: { representation: "ball-and-stick", colorTheme: "alt-loc" },
        signature: { category: "pdbx_alt_groups", note: "two coupled stretches around Ca 203 lettered {B,D} and {A,B,C,D} — the letters do not line up, so only a named network can say which alternate goes with which" },
      },
      {
        id: "5E1N_gln8_split",
        pdbId: "5E1N",
        file: { url: "/examples/het/5E1N_gln8_split.cif", name: "5E1N_gln8_split.cif" },
        title: "Split below the altloc letter",
        blurb: "Gln8 · amide H and side chain in different networks, same letter",
        view: { representation: "ball-and-stick", colorTheme: "alt-loc" },
        signature: { category: "pdbx_alt_groups", field: "label_atom_id", note: "the atom-level escape hatch: two networks separated by atom name, because both are 'chain A, residue 8, alternate A'" },
      },
      {
        id: "7HHS_apo_bound",
        pdbId: "7HHS",
        file: { url: "/examples/het/7HHS_apo_bound.cif", name: "7HHS_apo_bound.cif" },
        title: "Nested occupancy: apo / bound, then poses",
        blurb: "apo 0.78 / bound 0.22 → poses 0.13 + 0.09 = 0.22",
        view: { representation: "ball-and-stick", colorTheme: "alt-loc" },
        signature: { category: "pdbx_heterogeneity_hierarchy", note: "the poses nest under 'bound', so they sum to their parent rather than to one — and no pose can co-occur with apo, with no exclusion row" },
      },
      {
        id: "7HHS_apo_bound_occ",
        pdbId: "7HHS",
        file: { url: "/examples/het/7HHS_apo_bound_occ.cif", name: "7HHS_apo_bound_occ.cif" },
        title: "The occupancy specification, carried",
        blurb: "as above + completeness / refine flag / value / state kind",
        view: { representation: "ball-and-stick", colorTheme: "alt-loc" },
        signature: { category: "pdbx_heterogeneity_hierarchy", field: "occupancy_completeness", note: "the sum rule, the refined-or-fixed flag and the held value — what the refinement program knew and deposition discards" },
      },
      {
        id: "5E1N_arg74_clash",
        pdbId: "5E1N",
        file: { url: "/examples/het/5E1N_arg74_clash.cif", name: "5E1N_arg74_clash.cif" },
        title: "The one real NOT exclusion",
        blurb: "Arg74 alt B lands 2.14 Å from water 468 · alts C and D clear it",
        view: { representation: "ball-and-stick", colorTheme: "alt-loc" },
        signature: { category: "pdbx_state_coexistence", note: "a cross-branch clash: the rotamer and the solvent site sit in different branches, so nothing in the tree forbids them — the one case where the optional NOT list earns its place" },
      },
      {
        id: "constructed_two_pocket_flat",
        pdbId: "constructed",
        file: { url: "/examples/het/constructed_two_pocket_flat.cif", name: "constructed_two_pocket_flat.cif" },
        title: "Two pockets, parented wrong",
        blurb: "constructed · both pockets hang off base, so the state list admits pairs the occupancies forbid",
        view: { representation: "ball-and-stick", colorTheme: "alt-loc" },
        signature: { category: "pdbx_heterogeneity_hierarchy", note: "a worked negative: read alone this tree says the two pockets vary independently, so a consumer enumerates Ligand together with EDO2 — but the bottom pocket sums to 0.50, exactly O(EDO1), so it is ordered only within the EDO1 population. Compare constructed_two_pocket, which is the same atoms with the right parent" },
      },
      {
        id: "constructed_two_pocket",
        pdbId: "constructed",
        file: { url: "/examples/het/constructed_two_pocket.cif", name: "constructed_two_pocket.cif" },
        title: "Two pockets, parented right",
        blurb: "constructed · the bottom pocket nests under EDO1, and the coupling follows from the tree",
        view: { representation: "ball-and-stick", colorTheme: "alt-loc" },
        signature: { category: "pdbx_heterogeneity_hierarchy", note: "the same atoms and occupancies as constructed_two_pocket_flat, with EDO1 as the bottom pocket's parent. 0.30 + 0.20 = 0.50 = O(EDO1) then follows from the parent link, no escape hatch needed — the same shape as pose_1/pose_2 under bound in 7HHS" },
      },
      {
        id: "constructed_ncs_lock",
        pdbId: "constructed",
        file: { url: "/examples/het/constructed_ncs_lock.cif", name: "constructed_ncs_lock.cif" },
        title: "The cross-branch occupancy lock",
        blurb: "constructed · two NCS copies held to one occupancy, which no parent link can say",
        view: { representation: "ball-and-stick", colorTheme: "alt-loc" },
        signature: { category: "pdbx_occupancy_relationship", note: "two NCS-related copies of a partial-occupancy glycol at the same occupancy. Neither site is the other's parent and no coexistence group holds both, so the hierarchy cannot relate them — this is what the optional relationship table exists for. Constructed of necessity: the restraint behind the equal occupancies is discarded at deposition" },
      },
    ],
  },
];
