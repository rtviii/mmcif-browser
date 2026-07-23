import { asMolCifFile } from "@/lib/cif-source/types";

// Heterogeneity networks parsed from the proposed extension categories (see
// pipeline/data/mmcif_pdbx_v50_het_ext.dic):
//   _pdbx_alt_groups              -- membership: which atom_site rows make up each named network
//   _pdbx_heterogeneity_hierarchy -- which networks exclude one another (coexistence groups)
//   _pdbx_het_state               -- the joint: combinations that occur, with their occupancies
//   _pdbx_het_state_members       -- which networks make up each state
//   _pdbx_state_coexistence       -- optional NOT exclusions between networks
// Mol* does not know these categories, so (like the TLS path) we parse them off the raw CifFile and
// build our own model: the networks, their exclusions, and the whole-molecule states.
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
  id: string; // alt_group_id (the network name)
  members: AltSelector[]; // one per _pdbx_alt_groups row
  coexistenceGroupId: string | null; // the mutually-exclusive (occupancy) group it shares with siblings
  occupancy: number | null; // MARGINAL occupancy, read off a member atom in atom_site
}

export interface HetExclusion {
  id: string;
  rule: string; // always "NOT"
  a: string; // alt_group_id
  b: string; // alt_group_ids
}

// One end of a struct_conn bond, as the row names it.
export interface HetBondEnd {
  chain: string; // auth_asym_id
  seq: number; // auth_seq_id
  comp: string; // auth_comp_id, for the label
  atomId: string; // label_atom_id
  altId: string | null; // pdbx_ptnr*_label_alt_id, null when '.'
}

// A bond from _struct_conn, with the networks it belongs to. The altloc on a partner is what makes
// a bond alternate-specific: Thr26's carbonyl oxygen reaches the calcium at four different
// distances, one per letter, and each contact is its own row against its own letter. Resolving
// which networks own a bond is the same matching rule as for atoms — the partner's key is tested
// against every network's membership selectors — so a bond follows its network through the state
// stepper without being annotated twice.
export interface HetBond {
  id: string; // _struct_conn.id
  type: string; // conn_type_id (metalc, covale, disulf, hydrog)
  a: HetBondEnd;
  b: HetBondEnd;
  distance: number | null; // pdbx_dist_value
  networks: string[]; // networks owning either end; empty when the bond is entirely single-conformer
}

// A whole-molecule state: a set of networks present together (base is always implicitly present).
export interface HetState {
  id: string; // the file's _pdbx_het_state.id, or "state 1", ... when derived
  networks: string[]; // network ids present in this state (excludes base)
  label: string; // human description, e.g. "bound + pose_1"
  probability: number | null; // JOINT occupancy of the combination
  bundleId: string | null; // the correlation unit this state belongs to
  provenance: string | null; // how the joint occupancy was arrived at
  details: string | null; // free text from the file
}

// Where the state list came from. "stated" means the file enumerates its joint distribution;
// "independent" means it does not, and we produced the only reading available without one — every
// combination the coexistence groups allow, weighted by the product of the marginals. The
// difference matters enough to surface in the UI: one is recorded, the other is an assumption.
export type StateSource = "stated" | "independent";

export interface HetModel {
  networks: HetNetwork[]; // excludes the implicit base root
  byId: Map<string, HetNetwork>;
  exclusions: HetExclusion[];
  states: HetState[];
  stateSource: StateSource;
  bonds: HetBond[]; // _struct_conn, resolved against the networks
}

// Distinct flat colours, one per network (parallels TLS_PALETTE). base is rendered grey separately.
export const HET_PALETTE = [
  0x4363d8, 0xe6194b, 0x3cb44b, 0xf58231, 0x911eb4, 0x42d4f4, 0xf032e6, 0xbfef45, 0xfabed4, 0x469990,
];

// The same idea, desaturated, for the proposal figures: a network's colour is the ONLY chroma in
// that panel (the code is monochrome), so the set has to stay distinguishable in 3D while reading
// as quiet against white. Kept separate from HET_PALETTE so the Inspector is unaffected.
export const HET_PALETTE_MUTED = [
  0x5b7fa6, 0xa8595c, 0x6f8f6a, 0xb2874f, 0x7d6b93, 0x4f8a8b, 0x9c6f8e, 0x8a8a5c, 0xa87f7f, 0x5f7d7d,
];

const norm = (s: string | undefined | null) => {
  const v = (s ?? "").trim();
  return v === "" || v === "." || v === "?" ? "" : v;
};

// One atom_site row, reduced to the keys a membership selector matches on.
export interface AtomKey {
  chain: string;
  seq: number;
  altId: string;
  atomId: string;
}

// Does an atom_site row fall inside a membership selector? This is the single definition of
// network membership: the occupancy scan below, the 3D query builder (lib/molstar/queries.ts)
// and the source-line index (lib/molstar/het-lines.ts) must all agree, or the code panel would
// highlight atoms the viewer does not colour. An atomId of null selects the whole residue range.
export function matchesSelector(m: AltSelector, a: AtomKey): boolean {
  return (
    a.chain === m.chain &&
    a.seq >= m.seqStart &&
    a.seq <= m.seqEnd &&
    a.altId === m.altId &&
    (!m.atomId || a.atomId === m.atomId)
  );
}

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
    const net = byId.get(id) ?? { id, members: [], coexistenceGroupId: null, occupancy: null };
    net.members.push(sel);
    byId.set(id, net);
  }
  if (byId.size === 0) return null;

  // --- which networks exclude one another ---
  const hier = block.categories["pdbx_heterogeneity_hierarchy"];
  if (hier) {
    const hId = hier.getField("alt_group_id");
    const hCoex = hier.getField("coexistence_group_id");
    for (let r = 0; r < hier.rowCount; r++) {
      const net = byId.get(norm(hId?.str(r)));
      if (!net) continue; // base row (no members) or a stray id
      net.coexistenceGroupId = norm(hCoex?.str(r)) || null;
    }
  }

  // --- marginal occupancy per network, read off the first matching atom_site row ---
  assignOccupancies(block, byId);

  // --- optional exclusions ---
  const exclusions: HetExclusion[] = [];
  const excl = block.categories["pdbx_state_coexistence"];
  if (excl) {
    const eId = excl.getField("id");
    const eRule = excl.getField("rule");
    const eA = excl.getField("alt_group_id");
    const eB = excl.getField("alt_group_ids");
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
  // A file that states its joint distribution is believed over anything we could derive: that is
  // the whole point of the state table, and deriving it would mean assuming the independence the
  // table exists to deny.
  const stated = readStates(block, byId);
  return {
    networks,
    byId,
    exclusions,
    states: stated ?? enumerateStates(networks, exclusions),
    stateSource: stated ? "stated" : "independent",
    bonds: readBonds(block, networks),
  };
}

// _struct_conn, with each bond attributed to the networks that own its ends.
//
// The row is read through the AUTH keys, which is what the rest of this module matches on and what
// _pdbx_alt_groups points with. (A consumer that resolves the bond in 3D needs the label_ keys as
// well — Mol* drops a row whose ptnr*_label_asym_id is missing — but that is its business, not
// this index's.)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readBonds(block: any, networks: HetNetwork[]): HetBond[] {
  const sc = block.categories["struct_conn"];
  if (!sc || sc.rowCount === 0) return [];
  const f = (name: string) => sc.getField(name);
  const end = (r: number, n: 1 | 2): HetBondEnd | null => {
    const chain = norm(f(`ptnr${n}_auth_asym_id`)?.str(r));
    const seq = f(`ptnr${n}_auth_seq_id`)?.int(r);
    const atomId = norm(f(`ptnr${n}_label_atom_id`)?.str(r));
    if (!chain || seq == null || Number.isNaN(seq) || !atomId) return null;
    return {
      chain,
      seq,
      comp: norm(f(`ptnr${n}_auth_comp_id`)?.str(r)) || norm(f(`ptnr${n}_label_comp_id`)?.str(r)),
      atomId,
      altId: norm(f(`pdbx_ptnr${n}_label_alt_id`)?.str(r)) || null,
    };
  };

  const out: HetBond[] = [];
  for (let r = 0; r < sc.rowCount; r++) {
    const a = end(r, 1);
    const b = end(r, 2);
    if (!a || !b) continue;
    const dist = f("pdbx_dist_value")?.float(r);
    const owners = new Set<string>();
    for (const e of [a, b]) {
      if (!e.altId) continue; // a single-conformer partner belongs to base, not to a network
      const key: AtomKey = { chain: e.chain, seq: e.seq, altId: e.altId, atomId: e.atomId };
      for (const net of networks) {
        if (net.members.some((m) => matchesSelector(m, key))) owners.add(net.id);
      }
    }
    out.push({
      id: norm(f("id")?.str(r)) || String(r + 1),
      type: norm(f("conn_type_id")?.str(r)) || "covale",
      a,
      b,
      distance: dist == null || Number.isNaN(dist) ? null : dist,
      networks: [...owners],
    });
  }
  return out;
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
        const seq = aSeq?.int(r);
        if (seq == null || Number.isNaN(seq)) continue;
        const key: AtomKey = {
          chain: norm(aChain?.str(r)),
          seq,
          altId: norm(aAlt?.str(r)),
          atomId: norm(aAtom?.str(r)),
        };
        if (!matchesSelector(m, key)) continue;
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

// The states the FILE states: one row of _pdbx_het_state per combination that occurs, with the
// networks making it up joined in from _pdbx_het_state_members. The occupancy on the row is the
// joint occupancy of the whole combination, so it is used as-is — nothing is multiplied out.
// Returns null when the file carries no state table.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readStates(block: any, byId: Map<string, HetNetwork>): HetState[] | null {
  const st = block.categories["pdbx_het_state"];
  if (!st || st.rowCount === 0) return null;

  const membersOf = new Map<string, string[]>();
  const mem = block.categories["pdbx_het_state_members"];
  if (mem) {
    const mState = mem.getField("state_id");
    const mNet = mem.getField("alt_group_id");
    for (let r = 0; r < mem.rowCount; r++) {
      const sid = norm(mState?.str(r));
      const nid = norm(mNet?.str(r));
      if (!sid || !nid || !byId.has(nid)) continue; // "base" and strays carry no atoms
      (membersOf.get(sid) ?? membersOf.set(sid, []).get(sid)!).push(nid);
    }
  }

  const sId = st.getField("id");
  const sBundle = st.getField("bundle_id");
  const sOcc = st.getField("occupancy");
  const sProv = st.getField("provenance");
  const sDetails = st.getField("details");
  const out: HetState[] = [];
  for (let r = 0; r < st.rowCount; r++) {
    const id = norm(sId?.str(r)) || String(r + 1);
    const nets = membersOf.get(id) ?? [];
    const occ = sOcc?.float(r);
    out.push({
      id,
      networks: nets,
      label: nets.length ? nets.join(" + ") : "base only",
      probability: occ == null || Number.isNaN(occ) ? null : occ,
      bundleId: norm(sBundle?.str(r)) || null,
      provenance: norm(sProv?.str(r)) || null,
      details: norm(sDetails?.str(r)) || null,
    });
  }
  return out.length ? out : null;
}

// Is a coexistence group INCOMPLETE — i.e. is "none of them" a legal choice? A group is complete
// when its members' marginal occupancies sum to 1: then exactly one member is always chosen. When
// they sum to less, the remainder is a state in which none of them is present — a partially
// occupied water, or a pocket that is empty half the time — and that state has to be enumerable,
// or the network would appear in no state at all. Occupancies come straight off atom_site, so this
// needs no extra annotation to work out.
const SUM_TOL = 0.02;

function groupSum(members: HetNetwork[]): number | null {
  let sum = 0;
  for (const n of members) {
    if (n.occupancy == null) return null; // unknown occupancy: treat the group as complete
    sum += n.occupancy;
  }
  return sum;
}

// The fallback for a file with no state table: every combination its coexistence groups allow,
// weighted as though the groups were INDEPENDENT — one network drawn from each group, probability
// the product of the marginals. That is the only reading available from marginals alone, and it is
// exactly the assumption _pdbx_het_state exists to record instead of assuming. NOT exclusions then
// prune any combination containing both members of a forbidden pair.
function enumerateStates(networks: HetNetwork[], exclusions: HetExclusion[]): HetState[] {
  // group the networks by coexistence group (an unassigned network is its own singleton group)
  const groups = new Map<string, HetNetwork[]>();
  for (const n of networks) {
    const g = n.coexistenceGroupId ?? `:${n.id}`;
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(n);
  }

  // Each group contributes one choice: a member, or (when the marginals leave room) none of them.
  // A "none" option carries the leftover probability, which is what makes "ligand, bottom pocket
  // empty" come out at its own weight rather than being dropped.
  let combos: { nets: string[]; p: number | null }[] = [{ nets: [], p: 1 }];
  for (const members of groups.values()) {
    const sum = groupSum(members);
    const options: { nets: string[]; p: number | null }[] = members.map((n) => ({
      nets: [n.id],
      p: n.occupancy,
    }));
    if (sum != null && sum < 1 - SUM_TOL) options.push({ nets: [], p: 1 - sum });
    combos = combos.flatMap((c) =>
      options.map((o) => ({
        nets: [...c.nets, ...o.nets],
        p: c.p == null || o.p == null ? null : c.p * o.p,
      })),
    );
  }

  const forbidden = exclusions.filter((e) => e.rule === "NOT" && e.a && e.b);
  return combos
    .filter((c) => {
      const s = new Set(c.nets);
      return !forbidden.some((e) => s.has(e.a) && s.has(e.b));
    })
    .map((c, i) => ({
      id: `state ${i + 1}`,
      networks: c.nets,
      label: c.nets.length ? c.nets.join(" + ") : "base only",
      probability: c.p,
      bundleId: null,
      provenance: null,
      details: null,
    }));
}
