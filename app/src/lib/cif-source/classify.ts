// Classify mmCIF categories into a few human "lenses" so the inspector can tell structural
// data (a small fraction) from deposition paperwork (the bulk). Tags are sourced from the
// dictionary's own category groups (`Category.groups` in dictionary.json) via GROUP_LENS, with
// a CATEGORY_LENS override for the struct_* / *_scheme family — whose only dictionary signal is
// the too-broad `struct_group` — and a PREFIX_FALLBACK for the long tail. A category may carry
// several lenses; overlaps are expected.

import type { Dictionary } from "@/lib/types";

export type Lens =
  | "atoms"
  | "molecules"
  | "topology"
  | "ligands"
  | "assembly"
  | "experiment"
  | "heterogeneity"
  | "metadata";

export interface LensMeta {
  id: Lens;
  label: string; // full name (caption)
  short: string; // chip label
  tier: "structural" | "context";
  blurb: string;
}

export const LENS_META: Record<Lens, LensMeta> = {
  atoms: { id: "atoms", short: "Atoms", label: "Atoms", tier: "structural", blurb: "The literal 3D coordinates and atom inventory." },
  molecules: { id: "molecules", short: "Molecules", label: "Molecules & sequence", tier: "structural", blurb: "What the chains/entities are, and how sequence maps onto the model." },
  topology: { id: "topology", short: "Bonds", label: "Bonds & topology", tier: "structural", blurb: "Covalent connectivity and secondary structure." },
  ligands: { id: "ligands", short: "Ligands", label: "Ligands & chemistry", tier: "structural", blurb: "Non-polymer components and where they bind." },
  assembly: { id: "assembly", short: "Assembly", label: "Assembly & symmetry", tier: "structural", blurb: "Biological assembly and the crystallographic frame." },
  experiment: { id: "experiment", short: "Experiment", label: "Experiment & refinement", tier: "context", blurb: "How the structure was determined, and its quality." },
  heterogeneity: { id: "heterogeneity", short: "Heterogeneity", label: "Heterogeneity & validation", tier: "context", blurb: "Disorder, alt confs, unmodelled atoms, validation flags." },
  metadata: { id: "metadata", short: "Metadata", label: "Deposition & metadata", tier: "context", blurb: "Provenance, citation, revision history, database IDs — the paperwork." },
};

export const STRUCTURAL_LENSES: Lens[] = ["atoms", "molecules", "topology", "ligands", "assembly"];
export const CONTEXT_LENSES: Lens[] = ["experiment", "heterogeneity", "metadata"];
export const ALL_LENSES: Lens[] = [...STRUCTURAL_LENSES, ...CONTEXT_LENSES];

// Dictionary category-group -> lens(es). Only groups that carry a clear content signal; the
// catch-alls (inclusive_group, pdbx_group, struct_group, ndb_group) are intentionally absent and
// handled by CATEGORY_LENS / PREFIX_FALLBACK.
const GROUP_LENS: Record<string, Lens[]> = {
  atom_group: ["atoms"],
  entity_group: ["molecules"],
  reference_sequence_group: ["molecules"],
  branch_group: ["molecules"],
  chem_comp_group: ["ligands"],
  chem_comp_dictionary_group: ["ligands"],
  chem_comp_model_group: ["ligands"],
  chemical_group: ["ligands"],
  chem_link_group: ["ligands"],
  bird_dictionary_group: ["ligands"],
  bird_family_dictionary_group: ["ligands"],
  geom_group: ["topology"],
  cell_group: ["assembly"],
  symmetry_group: ["assembly"],
  exptl_group: ["experiment"],
  diffrn_group: ["experiment"],
  refln_group: ["experiment"],
  refine_group: ["experiment"],
  computing_group: ["experiment"],
  phasing_group: ["experiment"],
  nmr_group: ["experiment"],
  em_group: ["experiment"],
  em_legacy_group: ["experiment"],
  emdb_extension_group: ["experiment"],
  xfel_group: ["experiment"],
  solution_scattering_group: ["experiment"],
  array_data_group: ["experiment"],
  dcc_group: ["experiment"],
  validate_group: ["heterogeneity"],
  audit_group: ["metadata"],
  citation_group: ["metadata"],
  database_group: ["metadata"],
  entry_group: ["metadata"],
  protein_production_group: ["metadata"],
  emdb_admin_group: ["metadata"],
  iucr_group: ["metadata"],
  view_group: ["metadata"],
  compliance_group: ["metadata"],
};

// Exact-category overrides — chiefly the struct_* / *_scheme family (only dictionary signal is
// the too-broad struct_group). Unioned with any group-derived lenses.
const CATEGORY_LENS: Record<string, Lens[]> = {
  struct: ["metadata"],
  struct_keywords: ["metadata"],
  struct_asym: ["molecules"],
  struct_ref: ["molecules"],
  struct_ref_seq: ["molecules"],
  struct_ref_seq_dif: ["molecules"],
  struct_conf: ["topology"],
  struct_conf_type: ["topology"],
  struct_sheet: ["topology"],
  struct_sheet_order: ["topology"],
  struct_sheet_range: ["topology"],
  struct_sheet_topology: ["topology"],
  pdbx_struct_sheet_hbond: ["topology"],
  struct_conn: ["topology"],
  struct_conn_type: ["topology"],
  struct_mon_prot: ["topology"],
  struct_mon_prot_cis: ["topology"],
  struct_site: ["ligands"],
  struct_site_gen: ["ligands"],
  struct_site_keywords: ["ligands"],
  struct_biol: ["assembly"],
  struct_biol_gen: ["assembly"],
  struct_biol_keywords: ["assembly"],
  struct_biol_view: ["assembly"],
  pdbx_struct_assembly: ["assembly"],
  pdbx_struct_assembly_gen: ["assembly"],
  pdbx_struct_assembly_prop: ["assembly"],
  pdbx_struct_oper_list: ["assembly"],
  pdbx_struct_special_symmetry: ["assembly"],
  struct_ncs_dom: ["assembly"],
  struct_ncs_dom_lim: ["assembly"],
  struct_ncs_ens: ["assembly"],
  struct_ncs_oper: ["assembly"],
  pdbx_poly_seq_scheme: ["molecules"],
  pdbx_nonpoly_scheme: ["molecules"],
  pdbx_branch_scheme: ["molecules"],
  database_PDB_matrix: ["assembly"],
  atom_sites: ["atoms", "assembly"],
  atom_site_anisotrop: ["atoms", "heterogeneity"],
  pdbx_entity_nonpoly: ["ligands", "molecules"],
  pdbx_struct_mod_residue: ["heterogeneity"],
  pdbx_unobs_or_zero_occ_residues: ["heterogeneity"],
  pdbx_unobs_or_zero_occ_atoms: ["heterogeneity"],
};

// Ordered prefix fallback, only consulted when groups + overrides yield nothing.
const PREFIX_FALLBACK: [string, Lens][] = [
  ["em_", "experiment"],
  ["pdbx_nmr", "experiment"],
  ["diffrn", "experiment"],
  ["reflns", "experiment"],
  ["refln", "experiment"],
  ["pdbx_refine", "experiment"],
  ["refine", "experiment"],
  ["exptl", "experiment"],
  ["phasing", "experiment"],
  ["pdbx_validate", "heterogeneity"],
  ["pdbx_unobs", "heterogeneity"],
  ["pdbx_audit", "metadata"],
  ["audit", "metadata"],
  ["citation", "metadata"],
  ["pdbx_database", "metadata"],
  ["database", "metadata"],
  ["pdbx_chem_comp", "ligands"],
  ["chem_comp", "ligands"],
  ["pdbx_entity", "molecules"],
  ["entity", "molecules"],
  ["atom_", "atoms"],
  ["cell", "assembly"],
  ["symmetry", "assembly"],
  ["space_group", "assembly"],
];

/** Lenses a category carries: dictionary groups ∪ exact overrides, else a prefix fallback. */
export function lensesFor(category: string, dict: Dictionary | null): Lens[] {
  const out = new Set<Lens>();
  const groups = dict?.categories[category]?.groups ?? [];
  for (const g of groups) for (const l of GROUP_LENS[g] ?? []) out.add(l);
  for (const l of CATEGORY_LENS[category] ?? []) out.add(l);
  if (out.size === 0) {
    for (const [prefix, l] of PREFIX_FALLBACK) {
      if (category === prefix || category.startsWith(prefix)) {
        out.add(l);
        break;
      }
    }
  }
  return [...out];
}

/** For a set of in-file categories: lens -> the categories carrying it (input order). */
export function buildLensGroups(categories: string[], dict: Dictionary | null): Record<Lens, string[]> {
  const out = {} as Record<Lens, string[]>;
  for (const l of ALL_LENSES) out[l] = [];
  for (const c of categories) for (const l of lensesFor(c, dict)) out[l].push(c);
  return out;
}

/** Categories tagged with any structural lens (for the "Structural only" preset). */
export function structuralCategories(categories: string[], dict: Dictionary | null): string[] {
  const set = new Set(STRUCTURAL_LENSES);
  return categories.filter((c) => lensesFor(c, dict).some((l) => set.has(l)));
}

/** Everything except categories that are EXCLUSIVELY deposition metadata (untagged kept). */
export function nonDepositionCategories(categories: string[], dict: Dictionary | null): string[] {
  return categories.filter((c) => {
    const ls = lensesFor(c, dict);
    return ls.length === 0 || ls.some((l) => l !== "metadata");
  });
}
