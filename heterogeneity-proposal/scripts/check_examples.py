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

print("ex_minimal / ex_rotamer -- the baseline")
no_clashes("ex_minimal.cif")
peptide_bonds("ex_minimal.cif")
A = load("ex_minimal.cif")
ok("ex_minimal: no alternates at all", all(a["alt"] in ".?" for a in A))
ok("ex_minimal: every atom fully occupied", all(a["occ"] == 1.0 for a in A))

no_clashes("ex_rotamer.cif")
peptide_bonds("ex_rotamer.cif")
R = load("ex_rotamer.cif")
arg = [a for a in R if a["seq"] == 10 and a["alt"] not in ".?"]
occ = {a["alt"]: a["occ"] for a in arg}
ok("ex_rotamer: Arg10 has exactly two alternates", set(occ) == {"A", "B"}, str(occ))
ok("ex_rotamer: its occupancies sum to 1.00", abs(sum(occ.values()) - 1.0) < 1e-9,
   f"{occ.get('A')} + {occ.get('B')}")
ok("ex_rotamer: neighbours are single-conformer",
   all(a["alt"] in ".?" for a in R if a["seq"] in (9, 11)))

print("\nex_ef_hand -- the correlated network and the metal")
no_clashes("ex_ef_hand.cif")
peptide_bonds("ex_ef_hand.cif")
E = load("ex_ef_hand.cif")
ca = [a for a in E if a["comp"] == "CA"][0]
coord = sorted((round(d(ca, a), 2), f"{a['comp']}{a['seq']}.{a['atom']}/{a['alt']}")
               for a in heavy(E) if a["comp"] != "CA" and d(ca, a) < 2.8 and a["el"] == "O")
ok("ex_ef_hand: every Ca-O contact is 2.0-2.7 A",
   all(2.0 <= dd <= 2.7 for dd, _ in coord), f"{len(coord)} contacts, {coord[0][0]}-{coord[-1][0]} A")
ok("ex_ef_hand: Ca is coordinated by >= 6 oxygens", len(coord) >= 6, f"{len(coord)}")

thr26 = sorted((round(d(ca, a), 2), a["alt"]) for a in E
               if a["seq"] == 26 and a["atom"] == "O" and a["alt"] not in ".?")
ok("ex_ef_hand: Thr26 O reaches the ion in four alternates", len(thr26) == 4, str(thr26))
ok("ex_ef_hand: at 2.10 / 2.33 / 2.45 / 2.65 A (the reconciliation memo's numbers)",
   sorted(x for x, _ in thr26) == [2.10, 2.33, 2.45, 2.65], str(sorted(x for x, _ in thr26)))

seg1 = {a["alt"]: a["occ"] for a in E if 20 <= a["seq"] <= 24 and a["alt"] not in ".?"}
seg2 = {a["alt"]: a["occ"] for a in E if 25 <= a["seq"] <= 31 and a["alt"] not in ".?"}
ok("ex_ef_hand: segment 20-24 has 2 alternates summing to 1.00",
   set(seg1) == {"B", "D"} and abs(sum(seg1.values()) - 1.0) < 1e-6, str(seg1))
ok("ex_ef_hand: segment 25-31 has 4 alternates summing to 1.00",
   set(seg2) == {"A", "B", "C", "D"} and abs(sum(seg2.values()) - 1.0) < 1e-6, str(seg2))
ok("ex_ef_hand: the two segments use DIFFERENT letter sets (the overloaded-letter problem)",
   set(seg1) != set(seg2), f"{sorted(seg1)} vs {sorted(seg2)}")

print("\nex_subresidue -- one residue, two networks, same letter")
no_clashes("ex_subresidue.cif")
S = load("ex_subresidue.cif")
h8 = [a for a in S if a["seq"] == 8 and a["atom"] == "H"]
sc8 = [a for a in S if a["seq"] == 8 and a["atom"] in ("CB", "CG", "CD", "OE1", "NE2")]
ok("ex_subresidue: Gln8's amide H is modelled in alternates", {a["alt"] for a in h8} >= {"A", "B"},
   str(sorted({a["alt"] for a in h8})))
ok("ex_subresidue: Gln8's side chain is modelled in alternates A and B",
   {a["alt"] for a in sc8} == {"A", "B"}, str(sorted({a["alt"] for a in sc8})))
occ_h = {a["alt"]: a["occ"] for a in h8}
occ_s = {a["alt"]: a["occ"] for a in sc8}
ok("ex_subresidue: the H's occupancies differ from the side chain's -> two INDEPENDENT choices",
   occ_h.get("A") != occ_s.get("A"), f"H alt A = {occ_h.get('A')}, side chain alt A = {occ_s.get('A')}")
ok("ex_subresidue: both nonetheless carry label_alt_id = A -> a residue+letter key cannot separate them",
   "A" in occ_h and "A" in occ_s)

print("\nex_nesting -- the occupancy arithmetic")
no_clashes("ex_nesting.cif")
N = load("ex_nesting.cif")
pocket = {a["alt"]: a["occ"] for a in N if a["comp"] not in ("A1A7O",) and a["alt"] not in ".?"}
p1 = {a["occ"] for a in N if a["seq"] == 201}
p2 = {a["occ"] for a in N if a["seq"] == 202}
ok("ex_nesting: pocket apo = 0.78, bound = 0.22", pocket.get("A") == 0.78 and pocket.get("B") == 0.22,
   str(pocket))
ok("ex_nesting: pose_1 = 0.13", p1 == {0.13}, str(p1))
ok("ex_nesting: pose_2 = 0.09", p2 == {0.09}, str(p2))
ok("ex_nesting: 0.13 + 0.09 == 0.22 == occupancy(bound)  <-- the nesting rule, in deposited numbers",
   abs(0.13 + 0.09 - pocket.get("B", 0)) < 1e-9)
L1 = [a for a in N if a["seq"] == 201]
L2 = [a for a in N if a["seq"] == 202]
overlap = min(d(a, b) for a in L1 for b in L2)
ok("ex_nesting: the two poses occupy the same space -> mutually exclusive", overlap < 1.0,
   f"closest approach {overlap:.2f} A")
lig_alts = {a["alt"] for a in N if a["comp"] == "A1A7O"}
pocket_alts = {a["alt"] for a in N if a["comp"] != "A1A7O" and a["alt"] not in ".?"}
ok("ex_nesting: the ligand's letters do NOT line up with the pocket's (the letter is local)",
   lig_alts != pocket_alts, f"ligand {sorted(lig_alts)} vs pocket {sorted(pocket_alts)}")

print("\nex_exclusion -- the one real NOT row")
X = load("ex_exclusion.cif")
arg74 = [a for a in X if a["seq"] == 74 and a["alt"] not in ".?"]
w468 = [a for a in X if a["seq"] == 468]
ok("ex_exclusion: Arg74 is modelled in three alternates",
   {a["alt"] for a in arg74} == {"B", "C", "D"}, str(sorted({a["alt"] for a in arg74})))
ok("ex_exclusion: water 468 is present at partial occupancy",
   bool(w468) and all(a["occ"] < 1.0 for a in w468), str({a["occ"] for a in w468}))
clash = min((d(a, w), a["atom"]) for a in arg74 if a["alt"] == "B" for w in w468)
ok("ex_exclusion: Arg74 alternate B CLASHES with water 468 (< 2.4 A) -> they cannot coexist",
   clash[0] < 2.4, f"{clash[1]} - HOH468 = {clash[0]:.2f} A")
for other in ("C", "D"):
    far = min(d(a, w) for a in arg74 if a["alt"] == other for w in w468)
    ok(f"ex_exclusion: Arg74 alternate {other} does NOT clash -> the exclusion is specific to B",
       far >= 2.4, f"{far:.2f} A")

print("\nex_dag -- constructed, but chemically correct")
no_clashes("ex_dag.cif")
peptide_bonds("ex_dag.cif")
D_ = load("ex_dag.cif")
for comp, seq, alt in (("EDO", 501, "B"), ("EDO", 502, "C"), ("EDO", 502, "D")):
    m = [a for a in D_ if a["comp"] == comp and a["seq"] == seq and a["alt"] == alt]
    by = {a["atom"]: a for a in m}
    cc = d(by["C1"], by["C2"])
    co1 = d(by["C1"], by["O1"])
    co2 = d(by["C2"], by["O2"])
    ok(f"ex_dag: EDO {seq}/{alt} has real geometry (C-C 1.51, C-O 1.42)",
       abs(cc - 1.512) < 0.02 and abs(co1 - 1.423) < 0.03 and abs(co2 - 1.423) < 0.03,
       f"C-C {cc:.3f}, C-O {co1:.3f}/{co2:.3f}")
ring = [a for a in D_ if a["comp"] == "IPH" and a["atom"].startswith("C")]
ok("ex_dag: the ligand ring is all-carbon (a real phenol, not N+O in a ring)",
   all(a["el"] == "C" for a in ring), f"{len(ring)} ring atoms")
occ_top = {a["alt"]: a["occ"] for a in D_ if a["seq"] == 501}
occ_bot = {a["alt"]: a["occ"] for a in D_ if a["seq"] == 502}
ok("ex_dag: top pocket sums to 1.0 (complete)", abs(sum(occ_top.values()) - 1.0) < 1e-9, str(occ_top))
ok("ex_dag: bottom pocket sums to 0.5 (incomplete)", abs(sum(occ_bot.values()) - 0.5) < 1e-9, str(occ_bot))
ok("ex_dag: O(EDO1) = O(EDO2) + O(EDO3)  <-- the linear constraint the tree cannot hold",
   abs(occ_top.get("B", 0) - (occ_bot.get("C", 0) + occ_bot.get("D", 0))) < 1e-9,
   f"{occ_top.get('B')} = {occ_bot.get('C')} + {occ_bot.get('D')}")

print(f"\n{CHECKED - len(FAILED)}/{CHECKED} claims hold")
if FAILED:
    print("\nFAILED:")
    for f in FAILED:
        print("  -", f)
    sys.exit(1)
print("every geometric claim the page makes is supported by the coordinates.")
