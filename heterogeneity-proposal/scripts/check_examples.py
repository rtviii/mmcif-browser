#!/usr/bin/env python3
"""Assert that the /proposal example files actually support the claims the page makes about them.

This is the check that was missing when the examples were synthetic: every "these two things are
coupled because ..." sentence on the page is a geometric claim, and every one of them was false.

Usage:  python3 heterogeneity-proposal/scripts/check_examples.py
Exit code is non-zero if any claim fails.
"""

from __future__ import annotations

import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
EX = os.path.join(REPO, "app", "public", "examples", "het")

FAILED: list[str] = []
CHECKED = 0

# Covalent radii, generously; a heavy-atom pair closer than this and not bonded is a clash.
MIN_NONBONDED = 2.20   # A -- below this, two heavy atoms are interpenetrating
BONDED_MAX = 2.00      # A -- treat anything under this as (possibly) bonded, skip it


def ok(label: str, cond: bool, detail: str = "") -> None:
    global CHECKED
    CHECKED += 1
    if cond:
        print(f"  ok    {label}" + (f"  ({detail})" if detail else ""))
    else:
        print(f"  FAIL  {label}" + (f"  ({detail})" if detail else ""))
        FAILED.append(label)


def load(name: str) -> list[dict]:
    lines = open(os.path.join(EX, name)).read().splitlines()
    i = 0
    while i < len(lines):
        if lines[i].strip() == "loop_":
            j = i + 1
            names = []
            while j < len(lines) and lines[j].strip().startswith("_"):
                names.append(lines[j].strip())
                j += 1
            if names and names[0].startswith("_atom_site."):
                cols = [n.split(".", 1)[1] for n in names]
                idx = {c: k for k, c in enumerate(cols)}
                out = []
                while j < len(lines):
                    s = lines[j]
                    if s.startswith("#") or not s.strip():
                        break
                    p = s.split()
                    if len(p) < len(cols):
                        break
                    g = lambda c: p[idx[c]]
                    out.append(dict(
                        el=g("type_symbol"), atom=g("label_atom_id"), alt=g("label_alt_id"),
                        comp=g("label_comp_id"), ch=g("auth_asym_id"), seq=int(g("auth_seq_id")),
                        x=float(g("Cartn_x")), y=float(g("Cartn_y")), z=float(g("Cartn_z")),
                        occ=float(g("occupancy")),
                    ))
                    j += 1
                return out
            i = j
            continue
        i += 1
    return []


def split_values(s: str) -> list[str]:
    """Quote-aware split of one CIF data row (details fields carry spaces)."""
    out, i, n = [], 0, len(s)
    while i < n:
        if s[i] in " \t":
            i += 1
        elif s[i] == "'":
            j = s.index("'", i + 1)
            out.append(s[i + 1:j])
            i = j + 1
        else:
            j = i
            while j < n and s[j] not in " \t":
                j += 1
            out.append(s[i:j])
            i = j
    return out


def load_loop(name: str, prefix: str) -> list[dict]:
    """Read the first loop_ whose column names start with `prefix`, as a list of dicts.

    Used for the annotation loops -- the encoding claims below are about which parent a row
    names, which is a fact about the file and not about its coordinates.
    """
    lines = open(os.path.join(EX, name)).read().splitlines()
    i = 0
    while i < len(lines):
        if lines[i].strip() == "loop_":
            j = i + 1
            names = []
            while j < len(lines) and lines[j].strip().startswith("_"):
                names.append(lines[j].strip())
                j += 1
            if names and names[0].startswith(prefix):
                cols = [n.split(".", 1)[1] for n in names]
                out = []
                while j < len(lines):
                    s = lines[j]
                    if s.startswith("#") or not s.strip():
                        break
                    p = split_values(s)
                    if len(p) < len(cols):
                        break
                    out.append(dict(zip(cols, p)))
                    j += 1
                return out
            i = j
            continue
        i += 1
    return []


def d(a, b) -> float:
    return math.dist((a["x"], a["y"], a["z"]), (b["x"], b["y"], b["z"]))


def heavy(atoms):
    return [a for a in atoms if a["el"] != "H"]


def compatible(a, b) -> bool:
    """Can these two atoms be present in the same physical copy of the molecule?
    Two atoms of the same residue with different altloc letters never coexist. Two atoms with
    different non-'.' letters in general may or may not; we only assert on the same-residue case
    plus the explicit alternates of one site."""
    if a["alt"] in ".?" or b["alt"] in ".?":
        return True
    if (a["ch"], a["seq"]) == (b["ch"], b["seq"]):
        return a["alt"] == b["alt"]
    return a["alt"] == b["alt"]


METALS = {"CA", "MG", "ZN", "NA", "K", "FE", "MN"}


def no_clashes(name: str, atoms=None) -> None:
    """No two heavy atoms that could coexist may interpenetrate.

    Skips pairs that are legitimately close: bonded atoms, 1-3 geminal pairs inside one residue
    (a carboxylate's two oxygens are ~2.2 A apart and always will be), and metal coordination
    contacts (2.0-2.7 A is a bond, not a clash). What is left is the inter-residue non-bonded
    contact -- the thing that was catastrophically wrong in the old synthetic files.
    """
    A = heavy(atoms if atoms is not None else load(name))
    worst = (99.0, None, None)
    for i in range(len(A)):
        for j in range(i + 1, len(A)):
            a, b = A[i], A[j]
            if not compatible(a, b):
                continue
            if (a["ch"], a["seq"]) == (b["ch"], b["seq"]):
                continue  # intra-residue geometry is the deposited entry's, not ours
            if a["el"] in METALS or b["el"] in METALS:
                continue  # coordination bond
            dd = d(a, b)
            if dd < BONDED_MAX:
                continue  # bonded across residues (peptide bond, disulfide)
            if dd < worst[0]:
                worst = (dd, a, b)
    dd, a, b = worst
    detail = "no coexisting pair below 2.20 A"
    if a is not None:
        detail = f"closest non-bonded coexisting pair {dd:.2f} A ({a['comp']}{a['seq']}.{a['atom']}/{a['alt']} - {b['comp']}{b['seq']}.{b['atom']}/{b['alt']})"
    ok(f"{name}: no interpenetrating atoms", dd >= MIN_NONBONDED, detail)


def peptide_bonds(name: str) -> None:
    """Every consecutive C(i)-N(i+1) that exists must be a real peptide bond, 1.20-1.45 A."""
    A = load(name)
    bad = []
    seqs = sorted({(a["ch"], a["seq"]) for a in A if a["comp"] not in ("HOH", "CA")})
    for (ch, s) in seqs:
        if (ch, s + 1) not in seqs:
            continue
        for c in [a for a in A if a["ch"] == ch and a["seq"] == s and a["atom"] == "C"]:
            for n in [a for a in A if a["ch"] == ch and a["seq"] == s + 1 and a["atom"] == "N"]:
                if not compatible(c, n):
                    continue
                dd = d(c, n)
                if not (1.20 <= dd <= 1.45):
                    bad.append(f"{s}->{s+1} {dd:.2f}A")
    ok(f"{name}: peptide bonds 1.20-1.45 A", not bad, "; ".join(bad[:4]) or "all in range")


# --------------------------------------------------------------------------------- the claims

print("1EJG_minimal / 1EJG_rotamer -- the baseline")
no_clashes("1EJG_minimal.cif")
peptide_bonds("1EJG_minimal.cif")
A = load("1EJG_minimal.cif")
ok("1EJG_minimal: no alternates at all", all(a["alt"] in ".?" for a in A))
ok("1EJG_minimal: every atom fully occupied", all(a["occ"] == 1.0 for a in A))

no_clashes("1EJG_rotamer.cif")
peptide_bonds("1EJG_rotamer.cif")
R = load("1EJG_rotamer.cif")
arg = [a for a in R if a["seq"] == 10 and a["alt"] not in ".?"]
occ = {a["alt"]: a["occ"] for a in arg}
ok("1EJG_rotamer: Arg10 has exactly two alternates", set(occ) == {"A", "B"}, str(occ))
ok("1EJG_rotamer: its occupancies sum to 1.00", abs(sum(occ.values()) - 1.0) < 1e-9,
   f"{occ.get('A')} + {occ.get('B')}")
ok("1EJG_rotamer: neighbours are single-conformer",
   all(a["alt"] in ".?" for a in R if a["seq"] in (9, 11)))

print("\n5E1N_ca_site -- the correlated network and the metal")
no_clashes("5E1N_ca_site.cif")
peptide_bonds("5E1N_ca_site.cif")
E = load("5E1N_ca_site.cif")
ca = [a for a in E if a["comp"] == "CA"][0]
coord = sorted((round(d(ca, a), 2), f"{a['comp']}{a['seq']}.{a['atom']}/{a['alt']}")
               for a in heavy(E) if a["comp"] != "CA" and d(ca, a) < 2.8 and a["el"] == "O")
ok("5E1N_ca_site: every Ca-O contact is 2.0-2.7 A",
   all(2.0 <= dd <= 2.7 for dd, _ in coord), f"{len(coord)} contacts, {coord[0][0]}-{coord[-1][0]} A")
ok("5E1N_ca_site: Ca is coordinated by >= 6 oxygens", len(coord) >= 6, f"{len(coord)}")

thr26 = sorted((round(d(ca, a), 2), a["alt"]) for a in E
               if a["seq"] == 26 and a["atom"] == "O" and a["alt"] not in ".?")
ok("5E1N_ca_site: Thr26 O reaches the ion in four alternates", len(thr26) == 4, str(thr26))
ok("5E1N_ca_site: at 2.10 / 2.33 / 2.45 / 2.65 A (the reconciliation memo's numbers)",
   sorted(x for x, _ in thr26) == [2.10, 2.33, 2.45, 2.65], str(sorted(x for x, _ in thr26)))

seg1 = {a["alt"]: a["occ"] for a in E if 20 <= a["seq"] <= 24 and a["alt"] not in ".?"}
seg2 = {a["alt"]: a["occ"] for a in E if 25 <= a["seq"] <= 31 and a["alt"] not in ".?"}
ok("5E1N_ca_site: segment 20-24 has 2 alternates summing to 1.00",
   set(seg1) == {"B", "D"} and abs(sum(seg1.values()) - 1.0) < 1e-6, str(seg1))
ok("5E1N_ca_site: segment 25-31 has 4 alternates summing to 1.00",
   set(seg2) == {"A", "B", "C", "D"} and abs(sum(seg2.values()) - 1.0) < 1e-6, str(seg2))
ok("5E1N_ca_site: the two segments use DIFFERENT letter sets (the overloaded-letter problem)",
   set(seg1) != set(seg2), f"{sorted(seg1)} vs {sorted(seg2)}")

print("\n5E1N_gln8_split -- one residue, two networks, same letter")
no_clashes("5E1N_gln8_split.cif")
S = load("5E1N_gln8_split.cif")
h8 = [a for a in S if a["seq"] == 8 and a["atom"] == "H"]
sc8 = [a for a in S if a["seq"] == 8 and a["atom"] in ("CB", "CG", "CD", "OE1", "NE2")]
ok("5E1N_gln8_split: Gln8's amide H is modelled in alternates", {a["alt"] for a in h8} >= {"A", "B"},
   str(sorted({a["alt"] for a in h8})))
ok("5E1N_gln8_split: Gln8's side chain is modelled in alternates A and B",
   {a["alt"] for a in sc8} == {"A", "B"}, str(sorted({a["alt"] for a in sc8})))
occ_h = {a["alt"]: a["occ"] for a in h8}
occ_s = {a["alt"]: a["occ"] for a in sc8}
ok("5E1N_gln8_split: the H's occupancies differ from the side chain's -> two INDEPENDENT choices",
   occ_h.get("A") != occ_s.get("A"), f"H alt A = {occ_h.get('A')}, side chain alt A = {occ_s.get('A')}")
ok("5E1N_gln8_split: both nonetheless carry label_alt_id = A -> a residue+letter key cannot separate them",
   "A" in occ_h and "A" in occ_s)

print("\n7HHS_apo_bound -- the occupancy arithmetic")
no_clashes("7HHS_apo_bound.cif")
N = load("7HHS_apo_bound.cif")
pocket = {a["alt"]: a["occ"] for a in N if a["comp"] not in ("A1A7O",) and a["alt"] not in ".?"}
p1 = {a["occ"] for a in N if a["seq"] == 201}
p2 = {a["occ"] for a in N if a["seq"] == 202}
ok("7HHS_apo_bound: pocket apo = 0.78, bound = 0.22", pocket.get("A") == 0.78 and pocket.get("B") == 0.22,
   str(pocket))
ok("7HHS_apo_bound: pose_1 = 0.13", p1 == {0.13}, str(p1))
ok("7HHS_apo_bound: pose_2 = 0.09", p2 == {0.09}, str(p2))
ok("7HHS_apo_bound: 0.13 + 0.09 == 0.22 == occupancy(bound)  <-- the nesting rule, in deposited numbers",
   abs(0.13 + 0.09 - pocket.get("B", 0)) < 1e-9)
L1 = [a for a in N if a["seq"] == 201]
L2 = [a for a in N if a["seq"] == 202]
overlap = min(d(a, b) for a in L1 for b in L2)
ok("7HHS_apo_bound: the two poses occupy the same space -> mutually exclusive", overlap < 1.0,
   f"closest approach {overlap:.2f} A")
lig_alts = {a["alt"] for a in N if a["comp"] == "A1A7O"}
pocket_alts = {a["alt"] for a in N if a["comp"] != "A1A7O" and a["alt"] not in ".?"}
ok("7HHS_apo_bound: the ligand's letters do NOT line up with the pocket's (the letter is local)",
   lig_alts != pocket_alts, f"ligand {sorted(lig_alts)} vs pocket {sorted(pocket_alts)}")

print("\n5E1N_arg74_clash -- the one real NOT row")
X = load("5E1N_arg74_clash.cif")
arg74 = [a for a in X if a["seq"] == 74 and a["alt"] not in ".?"]
w468 = [a for a in X if a["seq"] == 468]
ok("5E1N_arg74_clash: Arg74 is modelled in three alternates",
   {a["alt"] for a in arg74} == {"B", "C", "D"}, str(sorted({a["alt"] for a in arg74})))
ok("5E1N_arg74_clash: water 468 is present at partial occupancy",
   bool(w468) and all(a["occ"] < 1.0 for a in w468), str({a["occ"] for a in w468}))
clash = min((d(a, w), a["atom"]) for a in arg74 if a["alt"] == "B" for w in w468)
ok("5E1N_arg74_clash: Arg74 alternate B CLASHES with water 468 (< 2.4 A) -> they cannot coexist",
   clash[0] < 2.4, f"{clash[1]} - HOH468 = {clash[0]:.2f} A")
for other in ("C", "D"):
    far = min(d(a, w) for a in arg74 if a["alt"] == other for w in w468)
    ok(f"5E1N_arg74_clash: Arg74 alternate {other} does NOT clash -> the exclusion is specific to B",
       far >= 2.4, f"{far:.2f} A")

print("\nconstructed_two_pocket -- the nesting the occupancies actually call for")
no_clashes("constructed_two_pocket.cif")
peptide_bonds("constructed_two_pocket.cif")
D_ = load("constructed_two_pocket.cif")
for comp, seq, alt in (("EDO", 501, "B"), ("EDO", 502, "C"), ("EDO", 502, "D")):
    m = [a for a in D_ if a["comp"] == comp and a["seq"] == seq and a["alt"] == alt]
    by = {a["atom"]: a for a in m}
    cc = d(by["C1"], by["C2"])
    co1 = d(by["C1"], by["O1"])
    co2 = d(by["C2"], by["O2"])
    ok(f"constructed_two_pocket: EDO {seq}/{alt} has real geometry (C-C 1.51, C-O 1.42)",
       abs(cc - 1.512) < 0.02 and abs(co1 - 1.423) < 0.03 and abs(co2 - 1.423) < 0.03,
       f"C-C {cc:.3f}, C-O {co1:.3f}/{co2:.3f}")
ring = [a for a in D_ if a["comp"] == "IPH" and a["atom"].startswith("C")]
ok("constructed_two_pocket: the ligand ring is all-carbon (a real phenol, not N+O in a ring)",
   all(a["el"] == "C" for a in ring), f"{len(ring)} ring atoms")
occ_top = {a["alt"]: a["occ"] for a in D_ if a["seq"] == 501}
occ_bot = {a["alt"]: a["occ"] for a in D_ if a["seq"] == 502}
ok("constructed_two_pocket: top pocket sums to 1.0 (complete under base)",
   abs(sum(occ_top.values()) - 1.0) < 1e-9, str(occ_top))
ok("constructed_two_pocket: O(EDO2) + O(EDO3) == O(EDO1)  <-- which is what licenses the parent link",
   abs(occ_top.get("B", 0) - (occ_bot.get("C", 0) + occ_bot.get("D", 0))) < 1e-9,
   f"{occ_bot.get('C')} + {occ_bot.get('D')} = {occ_top.get('B')}")

# The encoding claims. The arithmetic above says the bottom pocket is ordered only within the
# EDO1 population, which is a nesting -- so the parent link carries it and no escape hatch is
# needed. This is the same shape as pose_1/pose_2 under `bound` in 7HHS.
H = {r["alt_group_id"]: r
     for r in load_loop("constructed_two_pocket.cif", "_pdbx_heterogeneity_hierarchy.")}
ok("constructed_two_pocket: EDO2/EDO3 are parented to EDO1, not to base",
   H["EDO2"]["parent_alt_groups_id"] == "EDO1" and H["EDO3"]["parent_alt_groups_id"] == "EDO1",
   f"EDO2 -> {H['EDO2']['parent_alt_groups_id']}, EDO3 -> {H['EDO3']['parent_alt_groups_id']}")
ok("constructed_two_pocket: so the bottom group is complete (it sums to its parent, not to 1)",
   H["EDO2"]["occupancy_completeness"] == "complete" == H["EDO3"]["occupancy_completeness"],
   H["EDO2"]["occupancy_completeness"])
ok("constructed_two_pocket: the tree carries the coupling, so NO occupancy relationship is written",
   not load_loop("constructed_two_pocket.cif", "_pdbx_occupancy_relationship."),
   "no _pdbx_occupancy_relationship loop")

print("\nconstructed_two_pocket_flat -- the worked negative: same atoms, wrong parent")
F = load("constructed_two_pocket_flat.cif")
key = lambda A: [(a["ch"], a["seq"], a["atom"], a["alt"], a["x"], a["y"], a["z"], a["occ"]) for a in A]
ok("constructed_two_pocket_flat: coordinates and occupancies IDENTICAL to the nested file",
   key(F) == key(D_), f"{len(F)} atoms, only the hierarchy differs")
HF = {r["alt_group_id"]: r
      for r in load_loop("constructed_two_pocket_flat.cif", "_pdbx_heterogeneity_hierarchy.")}
ok("constructed_two_pocket_flat: EDO2/EDO3 hang off base -> the tree reads the pockets as independent",
   HF["EDO2"]["parent_alt_groups_id"] == "base" and HF["EDO3"]["parent_alt_groups_id"] == "base",
   f"EDO2 -> {HF['EDO2']['parent_alt_groups_id']}")
ok("constructed_two_pocket_flat: and must then call the bottom group incomplete, against a parent of 1.0",
   HF["EDO2"]["occupancy_completeness"] == "incomplete", HF["EDO2"]["occupancy_completeness"])
ok("constructed_two_pocket_flat: exactly one column differs from the nested file (the parent)",
   [r["parent_alt_groups_id"] for r in load_loop("constructed_two_pocket_flat.cif", "_pdbx_heterogeneity_hierarchy.")]
   != [r["parent_alt_groups_id"] for r in load_loop("constructed_two_pocket.cif", "_pdbx_heterogeneity_hierarchy.")]
   and [r["coexistence_group_id"] for r in load_loop("constructed_two_pocket_flat.cif", "_pdbx_heterogeneity_hierarchy.")]
   == [r["coexistence_group_id"] for r in load_loop("constructed_two_pocket.cif", "_pdbx_heterogeneity_hierarchy.")])

print("\nconstructed_ncs_lock -- the cross-branch lock no parent link can imply")
no_clashes("constructed_ncs_lock.cif")
peptide_bonds("constructed_ncs_lock.cif")
K = load("constructed_ncs_lock.cif")
ka = [a for a in K if a["ch"] == "A"]
kb = [a for a in K if a["ch"] == "B"]
ok("constructed_ncs_lock: two copies, same atom count", len(ka) == len(kb) and len(ka) > 0,
   f"A={len(ka)}, B={len(kb)}")
worst = max(abs(d(ka[i], ka[j]) - d(kb[i], kb[j]))
            for i in range(len(ka)) for j in range(i + 1, len(ka)))
ok("constructed_ncs_lock: chain B is a RIGID copy of chain A -> a proper NCS operator",
   worst < 1e-2, f"largest internal-distance deviation {worst:.4f} A")
sep = min(d(a, b) for a in ka for b in kb)
ok("constructed_ncs_lock: the two copies do not clash", sep >= 3.0, f"closest approach {sep:.2f} A")
e_a = [a for a in ka if a["comp"] == "EDO"]
e_b = [a for a in kb if a["comp"] == "EDO"]
ok("constructed_ncs_lock: one glycol per copy", len(e_a) == 4 and len(e_b) == 4,
   f"A={len(e_a)}, B={len(e_b)}")
oa, ob = {a["occ"] for a in e_a}, {a["occ"] for a in e_b}
ok("constructed_ncs_lock: both glycols carry the SAME partial occupancy -- the trace the restraint leaves",
   oa == ob and len(oa) == 1 and next(iter(oa)) < 1.0, f"A={oa}, B={ob}")

HK = {r["alt_group_id"]: r
      for r in load_loop("constructed_ncs_lock.cif", "_pdbx_heterogeneity_hierarchy.")}
ok("constructed_ncs_lock: neither site is the other's parent -> no parent link can tie them",
   HK["edo_A"]["parent_alt_groups_id"] == "base" and HK["edo_B"]["parent_alt_groups_id"] == "base",
   f"edo_A -> {HK['edo_A']['parent_alt_groups_id']}, edo_B -> {HK['edo_B']['parent_alt_groups_id']}")
ok("constructed_ncs_lock: they sit in DIFFERENT coexistence groups -> no sibling rule relates them",
   HK["edo_A"]["coexistence_group_id"] != HK["edo_B"]["coexistence_group_id"],
   f"{HK['edo_A']['coexistence_group_id']} vs {HK['edo_B']['coexistence_group_id']}")
ok("constructed_ncs_lock: each is a lone partial network -> completeness 'single', no sum rule",
   HK["edo_A"]["occupancy_completeness"] == "single" == HK["edo_B"]["occupancy_completeness"],
   HK["edo_A"]["occupancy_completeness"])
REL = load_loop("constructed_ncs_lock.cif", "_pdbx_occupancy_relationship.")
MEM = load_loop("constructed_ncs_lock.cif", "_pdbx_occupancy_relationship_member.")
ok("constructed_ncs_lock: exactly one relationship row, of type 'equal'",
   len(REL) == 1 and REL[0]["type"] == "equal", str([r.get("type") for r in REL]))
ok("constructed_ncs_lock: 'equal' carries exactly one member (the other side is the target)",
   len(MEM) == 1, f"{len(MEM)} member row(s)")
ok("constructed_ncs_lock: the tie names the two glycols -> O(edo_B) = O(edo_A)",
   {MEM[0]["state_id"], REL[0]["target"]} == {"edo_A", "edo_B"},
   f"member {MEM[0]['state_id']}, target {REL[0]['target']}")
ok("constructed_ncs_lock: honest about provenance -> enforced = annotation (no program fits it)",
   REL[0]["enforced"] == "annotation", REL[0]["enforced"])

print(f"\n{CHECKED - len(FAILED)}/{CHECKED} claims hold")
if FAILED:
    print("\nFAILED:")
    for f in FAILED:
        print("  -", f)
    sys.exit(1)
print("every geometric claim the page makes is supported by the coordinates.")
