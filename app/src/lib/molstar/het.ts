import { asMolCifFile } from "@/lib/cif-source/types";

// Heterogeneity networks parsed from the proposed extension categories (see the reconciliation
// memo and pipeline/data/mmcif_pdbx_v50_het_ext.dic):
//   _pdbx_alt_groups            -- membership: which atom_site rows make up each named network
//   _pdbx_heterogeneity_hierarchy -- the tree + occupancy (coexistence) grouping
//   _pdbx_state_coexistence     -- optional NOT exclusions between networks
// Mol* does not know these categories, so (like the TLS path) we parse them off the raw CifFile and
// build our own model: the networks, their hierarchy, and the enumerated legal whole-molecule states.
// ATOM_SITE is untouched; every membership row points back into it by existing keys.

// One membership row of a network: selects atom_site rows by chain + residue range + altloc,
// optionally narrowed to a single atom name (label_atom_id == '.' selects the whole range).
export interface AltSelector {
  chain: string; // auth_asym_id
  seqStart: number; // auth_seq_id_start
  seqEnd: number; // auth_seq_id_end
  altId: string; // label_alt_id
  atomId: string | null; // label_atom_id, or null when '.' (all atoms in the range)
}

export interface HetNetwork {
  id: string; // alt_group_id (the state name)
  members: AltSelector[]; // one per _pdbx_alt_groups row
  coexistenceGroupId: string | null; // the mutually-exclusive (occupancy) group it shares with siblings
  parentId: string | null; // parent network, or null when attached to the implicit "base" root
  occupancy: number | null; // representative occupancy read off a member atom in atom_site
}

export interface HetExclusion {
  id: string;
  rule: string; // always "NOT"
  a: string; // heterogeneity_id
  b: string; // heterogeneity_ids
}

// A legal whole-molecule state: a set of chosen networks (base is always implicitly present).
export interface HetState {
  id: string; // "state 1", ...
  networks: string[]; // chosen network ids (excludes base)
  label: string; // human description, e.g. "bound + lig_a"
  probability: number | null; // best-effort joint occupancy, null if any leaf occupancy is unknown
}

export interface HetModel {
  networks: HetNetwork[]; // excludes the implicit base root
  byId: Map<string, HetNetwork>;
  exclusions: HetExclusion[];
  states: HetState[];
}

// Distinct flat colours, one per network (parallels TLS_PALETTE). base is rendered grey separately.
export const HET_PALETTE = [
  0x4363d8, 0xe6194b, 0x3cb44b, 0xf58231, 0x911eb4, 0x42d4f4, 0xf032e6, 0xbfef45, 0xfabed4, 0x469990,
];

const norm = (s: string | undefined | null) => {
  const v = (s ?? "").trim();
  return v === "" || v === "." || v === "?" ? "" : v;
};

// Parse the heterogeneity model from a parsed CIF file (the `raw` of ParsedCif). Returns null if the
// file carries no _pdbx_alt_groups category.
export function parseHeterogeneity(raw: unknown): HetModel | null {
  const block = asMolCifFile(raw).blocks[0];
  if (!block) return null;
  const alt = block.categories["pdbx_alt_groups"];
  if (!alt || alt.rowCount === 0) return null;

  // --- membership rows grouped into networks ---
  const gId = alt.getField("alt_group_id");
  const gChain = alt.getField("auth_asym_id");
  const gStart = alt.getField("auth_seq_id_start");
  const gEnd = alt.getField("auth_seq_id_end");
  const gAlt = alt.getField("label_alt_id");
  const gAtom = alt.getField("label_atom_id");

  const byId = new Map<string, HetNetwork>();
  for (let r = 0; r < alt.rowCount; r++) {
    const id = norm(gId?.str(r));
    if (!id || id === "base") continue; // base has no membership rows
    const start = gStart?.int(r) ?? 0;
    const endRaw = gEnd?.int(r);
    const sel: AltSelector = {
      chain: norm(gChain?.str(r)),
      seqStart: start,
      seqEnd: endRaw == null || Number.isNaN(endRaw) ? start : endRaw,
      altId: norm(gAlt?.str(r)),
      atomId: norm(gAtom?.str(r)) || null,
    };
    const net = byId.get(id) ?? { id, members: [], coexistenceGroupId: null, parentId: null, occupancy: null };
    net.members.push(sel);
    byId.set(id, net);
  }
  if (byId.size === 0) return null;

  // --- hierarchy: coexistence group + parent per network ---
  const hier = block.categories["pdbx_heterogeneity_hierarchy"];
  if (hier) {
    const hId = hier.getField("alt_group_id");
    const hCoex = hier.getField("coexistence_group_id");
    const hParent = hier.getField("parent_alt_groups_id");
    for (let r = 0; r < hier.rowCount; r++) {
      const id = norm(hId?.str(r));
      const net = byId.get(id);
      if (!net) continue; // base row (no members) or a stray id
      net.coexistenceGroupId = norm(hCoex?.str(r)) || null;
      const parent = norm(hParent?.str(r));
      // "base" and "." both mean "attached to the implicit single-conformer root".
      net.parentId = parent && parent !== "base" ? parent : null;
    }
  }

  // --- representative occupancy per network, read off the first matching atom_site row ---
  assignOccupancies(block, byId);

  // --- optional exclusions ---
  const exclusions: HetExclusion[] = [];
  const excl = block.categories["pdbx_state_coexistence"];
  if (excl) {
    const eId = excl.getField("id");
    const eRule = excl.getField("rule");
    const eA = excl.getField("heterogeneity_id");
    const eB = excl.getField("heterogeneity_ids");
    for (let r = 0; r < excl.rowCount; r++) {
      exclusions.push({
        id: norm(eId?.str(r)) || String(r + 1),
        rule: norm(eRule?.str(r)) || "NOT",
        a: norm(eA?.str(r)),
        b: norm(eB?.str(r)),
      });
    }
  }

  const networks = [...byId.values()];
  const states = enumerateStates(networks, byId, exclusions);
  return { networks, byId, exclusions, states };
}

function assignOccupancies(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  block: any,
  byId: Map<string, HetNetwork>,
) {
  const at = block.categories["atom_site"];
  if (!at) return;
  const aChain = at.getField("auth_asym_id");
  const aSeq = at.getField("auth_seq_id");
  const aAlt = at.getField("label_alt_id");
  const aAtom = at.getField("label_atom_id");
  const aOcc = at.getField("occupancy");
  if (!aOcc) return;
  const n = at.rowCount as number;
  for (const net of byId.values()) {
    let occ: number | null = null;
    for (const m of net.members) {
      for (let r = 0; r < n; r++) {
        if (norm(aChain?.str(r)) !== m.chain) continue;
        const seq = aSeq?.int(r);
        if (seq == null || seq < m.seqStart || seq > m.seqEnd) continue;
        if (norm(aAlt?.str(r)) !== m.altId) continue;
        if (m.atomId && norm(aAtom?.str(r)) !== m.atomId) continue;
        occ = aOcc.float(r);
        break;
      }
      if (occ != null) break;
    }
    net.occupancy = occ;
  }
}

// All membership selectors of a network (for building a Mol* query / loci).
export function selectorsFor(model: HetModel, networkId: string): AltSelector[] {
  return model.byId.get(networkId)?.members ?? [];
}

// Enumerate the legal whole-molecule states from the hierarchy. Within one coexistence group under a
// parent exactly one network is chosen (mutually exclusive); independent groups under the same parent
// multiply (cartesian product); a child group opens only if its parent network is chosen (nesting).
// NOT exclusions then prune any state containing both members of a forbidden pair.
function enumerateStates(
  networks: HetNetwork[],
  byId: Map<string, HetNetwork>,
  exclusions: HetExclusion[],
): HetState[] {
  const childrenOf = new Map<string | null, HetNetwork[]>();
  for (const net of networks) {
    const key = net.parentId;
    (childrenOf.get(key) ?? childrenOf.set(key, []).get(key)!).push(net);
  }

  // All combinations of choices for the subtree under `parentId` being active.
  function enumerate(parentId: string | null, seen: Set<string>): string[][] {
    const kids = childrenOf.get(parentId) ?? [];
    // group children by coexistence group (a null group is its own singleton)
    const groups = new Map<string, HetNetwork[]>();
    for (const n of kids) {
      const g = n.coexistenceGroupId ?? `:${n.id}`;
      (groups.get(g) ?? groups.set(g, []).get(g)!).push(n);
    }
    let combos: string[][] = [[]];
    for (const candidates of groups.values()) {
      const groupOptions: string[][] = [];
      for (const n of candidates) {
        if (seen.has(n.id)) continue; // guard against a malformed cycle
        const sub = enumerate(n.id, new Set(seen).add(n.id));
        for (const s of sub) groupOptions.push([n.id, ...s]);
      }
      if (groupOptions.length === 0) continue;
      combos = combos.flatMap((c) => groupOptions.map((go) => [...c, ...go]));
    }
    return combos;
  }

  const raw = enumerate(null, new Set());
  const forbidden = exclusions.filter((e) => e.rule === "NOT" && e.a && e.b);
  const legal = raw.filter((set) => {
    const s = new Set(set);
    return !forbidden.some((e) => s.has(e.a) && s.has(e.b));
  });

  return legal.map((set, i) => {
    // probability = product of occupancies of chosen networks with no chosen child in this state
    const leaves = set.filter((id) => !set.some((other) => byId.get(other)?.parentId === id));
    let p: number | null = leaves.length > 0 ? 1 : null;
    for (const id of leaves) {
      const occ = byId.get(id)?.occupancy;
      if (occ == null) {
        p = null;
        break;
      }
      p = (p ?? 1) * occ;
    }
    return {
      id: `state ${i + 1}`,
      networks: set,
      label: set.length ? set.join(" + ") : "base only",
      probability: p,
    };
  });
}
