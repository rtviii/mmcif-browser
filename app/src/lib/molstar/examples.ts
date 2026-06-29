import type { StructureView } from "./style";

// The CIF block where this example's heterogeneity is actually encoded — usually a category that is
// absent from most PDB entries. Surfaced as a clickable chip that jumps the source pane to it.
export interface ExampleSignature {
  category: string; // CIF category name (no leading underscore)
  field?: string; // optional specific column within the category
  note: string; // one-line "what's encoded here"
}

// A curated structure that demonstrates one kind of structural heterogeneity, fetched from RCSB by
// PDB id and rendered with a representation/colour theme chosen to surface that feature in 3D.
// `motion`, when set, enables an in-viewer animation: 'frames' scrubs/plays the models, 'tls'
// animates the rigid-body libration from the TLS tensors, 'wiggle' runs Mol*'s shader thermal
// animation with per-atom amplitude from the B-factor.
export interface StructureExample {
  pdbId: string;
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
];
