#!/usr/bin/env python3
"""Build the /proposal example files by carving local sites out of real PDB entries.

Coordinates are copied verbatim from the deposited mmCIF -- nothing is idealised, regenerated
or nudged. What we add is the proposed heterogeneity annotation (_pdbx_alt_groups,
_pdbx_heterogeneity_hierarchy, _pdbx_state_coexistence, _pdbx_occupancy_relationship), because
that is the thing being proposed and it does not exist in the archive yet.

Where a network definition has a counterpart in the prototype annotation of 5E1N
(source_docs/5E1N_hierarchy_20250423.cif) we reuse that grouping and say so in the header.

Sources
  1EJG  crambin, 0.54 A          -- the baseline spine and an isolated side-chain rotamer
  5E1N  calmodulin, atomic res.  -- correlated networks, the sub-residue boundary, the Ca site,
                                    and the one real NOT exclusion
  7HHS  fragment screen          -- apo/bound nesting with two exclusive ligand poses

Two cases have no deposited counterpart and are built here with correct chemistry, labelled as
constructed: the two pockets (also constructed in the source deck), and the cross-branch lock,
which no deposited file can carry because the restraint behind it is discarded at deposition.

Usage:  python3 heterogeneity-proposal/scripts/carve_examples.py
"""

from __future__ import annotations

import math
import os
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
CACHE = os.path.join(HERE, ".pdb-cache")
OUT = os.path.join(REPO, "app", "public", "examples", "het")

# The _atom_site column set the app already parses (matches the existing example files).
COLS = [
    "group_PDB", "id", "type_symbol", "label_atom_id", "label_alt_id", "label_comp_id",
    "label_asym_id", "label_entity_id", "label_seq_id", "pdbx_PDB_ins_code",
    "Cartn_x", "Cartn_y", "Cartn_z", "occupancy", "B_iso_or_equiv", "pdbx_formal_charge",
    "auth_seq_id", "auth_comp_id", "auth_asym_id", "auth_atom_id", "pdbx_PDB_model_num",
]


# --------------------------------------------------------------------------- source parsing

def fetch(pdb: str) -> str:
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"{pdb}.cif")
    if not os.path.exists(path):
        url = f"https://files.rcsb.org/download/{pdb}.cif"
        print(f"  fetching {url}")
        with urllib.request.urlopen(url, timeout=120) as r:
            open(path, "wb").write(r.read())
    return open(path, encoding="utf-8", errors="replace").read()


def read_loop(text: str, prefix: str) -> list[dict]:
    """Return the rows of the first loop_ whose first item starts with `prefix`."""
    lines = text.splitlines()
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
                rows = []
                while j < len(lines):
                    s = lines[j]
                    if s.startswith("#") or not s.strip() or s.strip() == "loop_":
                        break
                    parts = s.split()
                    if len(parts) < len(cols):
                        break
                    rows.append(dict(zip(cols, parts)))
                    j += 1
                return rows
            i = j
            continue
        i += 1
    return []


def atom_sites(pdb: str) -> list[dict]:
    return [r for r in read_loop(fetch(pdb), "_atom_site.")
            if r.get("group_PDB") in ("ATOM", "HETATM")]


def dist(a: dict, b: dict) -> float:
    return math.dist(
        (float(a["Cartn_x"]), float(a["Cartn_y"]), float(a["Cartn_z"])),
        (float(b["Cartn_x"]), float(b["Cartn_y"]), float(b["Cartn_z"])),
    )


# --------------------------------------------------------------------------- selection

def carve(pdb: str, keep, drop_h: bool = True, keep_atoms=None) -> list[dict]:
    """keep(row) -> bool. Returns the surviving atom_site rows in source order.

    drop_h removes hydrogens (deposited atomic-resolution files are H-heavy and unreadable);
    keep_atoms is an optional predicate that rescues specific H atoms back in.
    """
    out = []
    for r in atom_sites(pdb):
        if not keep(r):
            continue
        if drop_h and r["type_symbol"] == "H" and not (keep_atoms and keep_atoms(r)):
            continue
        out.append(r)
    return out


def res(r) -> tuple:
    return (r["auth_asym_id"], int(r["auth_seq_id"]), r["label_comp_id"])


def in_range(r, chain: str, lo: int, hi: int) -> bool:
    return r["auth_asym_id"] == chain and lo <= int(r["auth_seq_id"]) <= hi


# --------------------------------------------------------------------------- emit

def fmt_loop(category: str, fields: list[str], rows: list[list[str]]) -> str:
    """A loop_ with padded, column-aligned data rows (the way deposited files are written)."""
    if not rows:
        return ""
    w = [max(len(str(r[c])) for r in rows) for c in range(len(fields))]
    w = [max(wi, 1) for wi in w]
    out = ["loop_"]
    out += [f"_{category}.{f}" for f in fields]
    for r in rows:
        cells = [str(v).ljust(w[c]) for c, v in enumerate(r)]
        out.append(" ".join(cells).rstrip())
    out.append("#")
    return "\n".join(out)


def atom_rows(atoms: list[dict]) -> list[list[str]]:
    rows = []
    for n, a in enumerate(atoms, 1):
        r = []
        for c in COLS:
            r.append("1" if c == "pdbx_PDB_model_num" else (str(n) if c == "id" else a.get(c, ".")))
        rows.append(r)
    return rows


def write_cif(name: str, block: str, header: str, atoms: list[dict], *extra: str) -> None:
    parts = [f"data_{block}", "#"]
    parts += [("# " + ln).rstrip() for ln in header.strip("\n").splitlines()]
    parts.append("#")
    parts.append(fmt_loop("atom_site", COLS, atom_rows(atoms)))
    for e in extra:
        if e:
            parts.append(e)
    text = "\n".join(parts).rstrip() + "\n"
    path = os.path.join(OUT, name)
    open(path, "w").write(text)
    nl = text.count("\n")
    print(f"  wrote {name:24} {len(atoms):4d} atoms  {nl:4d} lines")


def cut_note(extra: str = "") -> str:
    """Boundary comment between the standard categories and the proposed extension.

    Emitted just above the first proposed loop. In the /proposal "current mmCIF" view the source is
    truncated at "_pdbx_alt_groups", so this note is the last visible line -- it states, inside the
    file itself, what has been cut. Pass `extra` for a per-file line naming the correlation the
    current dictionary cannot express.
    """
    lines = [
        "# proposed heterogeneity extension -- the categories below are NOT part of the",
        "# current PDBx/mmCIF dictionary; they are what this page proposes to add.",
    ]
    if extra:
        lines.append("# " + extra)
    return "\n".join(lines)


ALT_FIELDS = ["id", "alt_group_id", "auth_asym_id",
              "auth_seq_id_start", "auth_seq_id_end", "label_alt_id", "label_atom_id"]
HIER_FIELDS = ["alt_group_id", "coexistence_group_id", "parent_alt_groups_id"]
HIER_OCC_FIELDS = HIER_FIELDS + [
    "occupancy_completeness", "occupancy_refine_flag", "occupancy_value", "state_kind"]


def alt_groups(members: list[tuple]) -> str:
    """members: (alt_group_id, chain, seq_start, seq_end, alt_id, atom_id)"""
    rows = [[str(i + 1), *[str(x) for x in m]] for i, m in enumerate(members)]
    return fmt_loop("pdbx_alt_groups", ALT_FIELDS, rows)


# --------------------------------------------------------------------------- examples

def minimal():
    """1EJG residues 14-16: a complete, valid file with no heterogeneity at all."""
    atoms = carve("1EJG", lambda r: in_range(r, "A", 14, 16))
    write_cif(
        "1EJG_minimal.cif", "1EJG_minimal",
        """
Crambin (PDB 1EJG, 0.54 A), residues Asn14-Val15-Cys16 of chain A.
Deposited coordinates, copied verbatim; hydrogens omitted.
        """, atoms)


def rotamer():
    """1EJG Arg10: a pure side-chain rotamer, single-conformer neighbours."""
    atoms = carve("1EJG", lambda r: in_range(r, "A", 9, 11))
    write_cif(
        "1EJG_rotamer.cif", "1EJG_rotamer",
        """
Crambin (PDB 1EJG), residues Ala9-Arg10-Ser11 of chain A.
Deposited coordinates, copied verbatim; hydrogens omitted.
        """, atoms)


def ca_site():
    """5E1N calcium site: two correlated multi-residue networks + the metal.

    The grouping is taken from the prototype annotation (source_docs/
    5E1N_hierarchy_20250423.cif), clipped to the carved residue window.
    """
    keep = lambda r: (in_range(r, "A", 20, 31)
                      or (r["label_comp_id"] == "CA" and r["auth_seq_id"] == "203")
                      or (r["label_comp_id"] == "HOH" and r["auth_seq_id"] == "411"))
    atoms = carve("5E1N", keep)

    # Two coexistence groups, each summing to 1.00. Occupancies are the deposited ones.
    #   seg1 (res 19-24): altlocs B (0.48) and D (0.52)          -- real groups A18B_to_A24B / A18D_to_A24D
    #   seg2 (res 25-31): altlocs A (0.38) B (0.24) C (0.19) D (0.19)
    #                                                            -- real groups A25{A,B,C,D}_to_A36{A,B,C,D}
    members = [
        ("seg1_B", "A", 20, 24, "B", "."),
        ("seg1_D", "A", 20, 24, "D", "."),
        ("seg2_A", "A", 25, 31, "A", "."),
        ("seg2_B", "A", 25, 31, "B", "."),
        ("seg2_C", "A", 25, 31, "C", "."),
        ("seg2_D", "A", 25, 31, "D", "."),
    ]
    hier = fmt_loop("pdbx_heterogeneity_hierarchy", HIER_FIELDS, [
        ["base", ".", "."],
        ["seg1_B", "entry_loop", "base"],
        ["seg1_D", "entry_loop", "base"],
        ["seg2_A", "exit_loop", "base"],
        ["seg2_B", "exit_loop", "base"],
        ["seg2_C", "exit_loop", "base"],
        ["seg2_D", "exit_loop", "base"],
    ])
    # The deposited altloc-specific metal coordination bonds.
    conn_fields = ["id", "conn_type_id",
                   "ptnr1_auth_asym_id", "ptnr1_auth_seq_id", "ptnr1_auth_comp_id",
                   "ptnr1_label_atom_id", "pdbx_ptnr1_label_alt_id",
                   "ptnr2_auth_asym_id", "ptnr2_auth_seq_id", "ptnr2_auth_comp_id",
                   "ptnr2_label_atom_id", "pdbx_ptnr2_label_alt_id", "pdbx_dist_value"]
    ca = [a for a in atoms if a["label_comp_id"] == "CA"][0]
    conn_rows = []
    for a in atoms:
        if a["type_symbol"] not in ("O",) or a["label_comp_id"] == "CA":
            continue
        d = dist(ca, a)
        if d > 2.7:
            continue
        conn_rows.append([
            f"metalc{len(conn_rows) + 1}", "metalc",
            "A", "203", "CA", "CA", ".",
            a["auth_asym_id"], a["auth_seq_id"], a["auth_comp_id"],
            a["label_atom_id"], a["label_alt_id"], f"{d:.2f}",
        ])
    conn = fmt_loop("struct_conn", conn_fields, conn_rows)

    write_cif(
        "5E1N_ca_site.cif", "5E1N_ca_site",
        """
Calmodulin (PDB 5E1N, atomic resolution), the EF-hand loop around calcium ion CA 203:
residues 20-31 of chain A, the ion, and its coordinating water. Deposited coordinates,
copied verbatim; hydrogens omitted.

The network grouping is taken from a prototype annotation of 5E1N, clipped to the carved
residue window. _struct_conn carries the deposited metal coordination bonds.
        """, atoms, conn,
        cut_note("the correlation between the two segments -- both coordinate the calcium ion -- has no representation here"),
        alt_groups(members), hier)


def gln8_split():
    """5E1N Gln8: two independent choices on one residue, REUSING the same altloc letters.

    Real, and the reason the reference annotation needed a per-atom column: residue 8's
    amide H belongs to the residues 6-7 backbone network, its side chain to its own.
    """
    # Keep heavy atoms, plus the backbone amide H of residue 8 -- the atom the whole case is about.
    amide8 = lambda r: (r["label_atom_id"] == "H" and r["auth_seq_id"] == "8"
                        and r["auth_asym_id"] == "A")
    atoms = carve("5E1N", lambda r: in_range(r, "A", 6, 8), keep_atoms=amide8)

    sc8 = ["CB", "CG", "CD", "OE1", "NE2"]
    members = [
        # the residues 6-7 backbone alternates -- each also owns residue 8's amide hydrogen
        ("bb_A", "A", 6, 7, "A", "."),
        ("bb_A", "A", 8, 8, "A", "H"),
        ("bb_B", "A", 6, 7, "B", "."),
        ("bb_B", "A", 8, 8, "B", "H"),
        ("bb_C", "A", 6, 7, "C", "."),
        ("bb_C", "A", 8, 8, "C", "H"),
    ]
    # Gln8's side chain: named atom by atom, because a residue-range row would also claim the
    # amide H above -- same residue, same letter, different network.
    for atom in sc8:
        members.append(("sc_A", "A", 8, 8, "A", atom))
    for atom in sc8:
        members.append(("sc_B", "A", 8, 8, "B", atom))

    hier = fmt_loop("pdbx_heterogeneity_hierarchy", HIER_FIELDS, [
        ["base", ".", "."],
        ["bb_A", "backbone_6_7", "base"],
        ["bb_B", "backbone_6_7", "base"],
        ["bb_C", "backbone_6_7", "base"],
        ["sc_A", "sidechain_8", "base"],
        ["sc_B", "sidechain_8", "base"],
    ])
    write_cif(
        "5E1N_gln8_split.cif", "5E1N_gln8_split",
        """
Calmodulin (PDB 5E1N), residues Glu6-Glu7-Gln8 of chain A. Deposited coordinates, copied
verbatim. Hydrogens are omitted EXCEPT Gln8's backbone amide H, which is the atom the
example is about.
        """, atoms, cut_note(), alt_groups(members), hier)


def _hhs_atoms():
    pocket = [(21, 25), (47, 49)]
    keep = lambda r: (any(in_range(r, "A", lo, hi) for lo, hi in pocket)
                      or (r["label_comp_id"] == "A1A7O" and r["auth_asym_id"] == "A"))
    return carve("7HHS", keep)


def _hhs_members():
    return [
        ("apo", "A", 21, 25, "A", "."),
        ("apo", "A", 47, 49, "A", "."),
        ("bound", "A", 21, 25, "B", "."),
        ("bound", "A", 47, 49, "B", "."),
        ("pose_1", "A", 201, 201, "B", "."),
        ("pose_2", "A", 202, 202, "C", "."),
    ]


NESTING_HEADER = """
Fragment-screening entry PDB 7HHS: the ligand pocket -- residues 21-25 and 47-49 of chain A
plus both modelled poses of ligand A1A7O. Deposited coordinates, copied verbatim; H omitted.
"""


def apo_bound():
    hier = fmt_loop("pdbx_heterogeneity_hierarchy", HIER_FIELDS, [
        ["base", ".", "."],
        ["apo", "pocket", "base"],
        ["bound", "pocket", "base"],
        ["pose_1", "ligand_pose", "bound"],
        ["pose_2", "ligand_pose", "bound"],
    ])
    write_cif("7HHS_apo_bound.cif", "7HHS_apo_bound", NESTING_HEADER,
              _hhs_atoms(), cut_note(), alt_groups(_hhs_members()), hier)


def apo_bound_occ():
    hier = fmt_loop("pdbx_heterogeneity_hierarchy", HIER_OCC_FIELDS, [
        ["base", ".", ".", ".", ".", "1.0", "."],
        ["apo", "pocket", "base", "complete", "refined", ".", "compositional"],
        ["bound", "pocket", "base", "complete", "refined", ".", "compositional"],
        ["pose_1", "ligand_pose", "bound", "complete", "refined", ".", "conformational"],
        ["pose_2", "ligand_pose", "bound", "complete", "refined", ".", "conformational"],
    ])
    header = NESTING_HEADER + """
This copy also carries the occupancy specification columns on the hierarchy.
"""
    write_cif("7HHS_apo_bound_occ.cif", "7HHS_apo_bound_occ", header,
              _hhs_atoms(), cut_note(), alt_groups(_hhs_members()), hier)


def arg74_clash():
    """5E1N Arg74 vs HOH 468: the one real NOT row in the prototype annotation."""
    keep = lambda r: (in_range(r, "A", 73, 75)
                      or (r["label_comp_id"] == "HOH" and r["auth_seq_id"] in ("468", "469")))
    atoms = carve("5E1N", keep)
    present = {a["auth_seq_id"] for a in atoms if a["label_comp_id"] == "HOH"}
    members = [
        ("arg74_B", "A", 74, 74, "B", "."),
        ("arg74_C", "A", 74, 74, "C", "."),
        ("arg74_D", "A", 74, 74, "D", "."),
        ("wat468_E", "A", 468, 468, "E", "."),
    ]
    hier = fmt_loop("pdbx_heterogeneity_hierarchy", HIER_OCC_FIELDS, [
        ["base", ".", ".", ".", ".", "1.0", "."],
        ["arg74_B", "arg74", "base", "complete", "refined", ".", "conformational"],
        ["arg74_C", "arg74", "base", "complete", "refined", ".", "conformational"],
        ["arg74_D", "arg74", "base", "complete", "refined", ".", "conformational"],
        ["wat468_E", "water468", "base", "incomplete", "refined", ".", "compositional"],
    ])
    excl = fmt_loop("pdbx_state_coexistence",
                    ["id", "rule", "heterogeneity_id", "heterogeneity_ids"],
                    [["1", "NOT", "arg74_B", "wat468_E"]])
    assert "468" in present, "HOH 468 missing from carve"
    write_cif(
        "5E1N_arg74_clash.cif", "5E1N_arg74_clash",
        """
Calmodulin (PDB 5E1N), Arg74 and its neighbours, plus water 468.
Deposited coordinates, copied verbatim; hydrogens omitted.
        """, atoms, cut_note(), alt_groups(members), hier, excl)


# --------------------------------------------------------------------------- constructed cases
#
# Two examples have no deposited counterpart and are built here, with real internal geometry and
# a placement searched against a real peptide. The builders below are shared by both.

def het_atoms(comp, alt, seq, occ, b, entity, asym, atoms, chain="A"):
    out = []
    for name, el, (x, y, z) in atoms:
        out.append({
            "group_PDB": "HETATM", "type_symbol": el, "label_atom_id": name,
            "label_alt_id": alt, "label_comp_id": comp, "label_asym_id": asym,
            "label_entity_id": entity, "label_seq_id": ".", "pdbx_PDB_ins_code": "?",
            "Cartn_x": f"{x:.3f}", "Cartn_y": f"{y:.3f}", "Cartn_z": f"{z:.3f}",
            "occupancy": f"{occ:.2f}", "B_iso_or_equiv": f"{b:.2f}",
            "pdbx_formal_charge": "?", "auth_seq_id": str(seq), "auth_comp_id": comp,
            "auth_asym_id": chain, "auth_atom_id": name, "pdbx_PDB_model_num": "1",
        })
    return out


# Ethylene glycol, ideal geometry: C-C 1.512, C-O 1.423, staggered.
def edo_atoms(ox, oy, oz, flip=1.0):
    return [
        ("C1", "C", (ox + 0.000, oy + 0.000, oz + 0.000)),
        ("C2", "C", (ox + 1.512, oy + 0.000, oz + 0.000)),
        ("O1", "O", (ox - 0.475, oy + 1.340, oz + 0.000)),
        ("O2", "O", (ox + 1.987, oy - 1.340 * flip, oz + 0.000)),
    ]


# Phenol: planar ring, C-C 1.390, C-O 1.375.
def phenol_atoms(cx, cy, cz):
    out = []
    for i in range(6):
        th = math.radians(60 * i)
        out.append((f"C{i + 1}", "C", (cx + 1.390 * math.cos(th), cy + 1.390 * math.sin(th), cz)))
    th = math.radians(0)
    out.append(("O1", "O", (cx + (1.390 + 1.375) * math.cos(th),
                            cy + (1.390 + 1.375) * math.sin(th), cz)))
    return out


def unit_norm(v):
    m = math.sqrt(sum(c * c for c in v)) or 1.0
    return (v[0] / m, v[1] / m, v[2] / m)


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def min_pair(P, Q):
    return min(math.dist(p, q) for p in P for q in Q)


def xyz_of(atoms, seq=None):
    return [(float(a["Cartn_x"]), float(a["Cartn_y"]), float(a["Cartn_z"]))
            for a in atoms if seq is None or a["auth_seq_id"] == str(seq)]


def centroid(P):
    return (sum(p[0] for p in P) / len(P),
            sum(p[1] for p in P) / len(P),
            sum(p[2] for p in P) / len(P))


def two_pocket():
    """The two pockets, in both encodings. Constructed -- there is no deposited counterpart --
    but with real chemistry: ethylene glycol (EDO) built to its ideal internal geometry, a phenol
    ring for the ligand, and every non-bonded contact between coexisting groups kept above 3.0 A.
    The protein scaffold is a real 1EJG tripeptide.

    Emits the same atoms twice, under two different hierarchies. `_flat` parents both pockets to
    `base`, which reads as "independent" and admits states the occupancies forbid; the plain file
    parents the bottom pocket to EDO1, which is what the numbers actually say. The page shows them
    in that order.
    """
    scaffold = carve("1EJG", lambda r: in_range(r, "A", 14, 16))

    # Two ADJACENT pockets, both nestled against the peptide, so the scene reads as one compact
    # bound site instead of fragments scattered in empty space. The two occupants of a pocket
    # overlap each other (mutually exclusive); the two pockets sit alongside each other and stay
    # clear (they can coexist).
    #
    # Placement is searched, not guessed. We sweep a direction off the peptide centroid for the
    # first pocket, drop the second alongside it (a tangential step, pulled a little back toward
    # the surface), and keep the whole cluster resting on the scaffold: the nearest built atom is
    # in van der Waals contact (2.7-4.5 A of the peptide -- against it, not clashing, not floating),
    # and the two coexisting pockets stay >= 3.0 A apart. Of the placements that satisfy that, we
    # take the most compact, so resetCamera frames a tight site rather than a long empty box.
    sc_xyz = [(float(a["Cartn_x"]), float(a["Cartn_y"]), float(a["Cartn_z"]))
              for a in scaffold if a["type_symbol"] != "H"]
    cx, cy, cz = centroid(sc_xyz)

    def build(top, bot):
        out = []
        out += het_atoms("IPH", "A", 501, 0.50, 25.0, "2", "B", phenol_atoms(*top))
        out += het_atoms("EDO", "B", 501, 0.50, 25.0, "3", "C",
                         edo_atoms(top[0] - 0.7, top[1] - 0.4, top[2]))
        out += het_atoms("EDO", "C", 502, 0.30, 30.0, "3", "D", edo_atoms(*bot))
        out += het_atoms("EDO", "D", 502, 0.20, 32.0, "3", "E",
                         edo_atoms(bot[0] + 0.35, bot[1] + 0.30, bot[2], -1.0))
        return out

    occ_xyz = xyz_of

    best = None
    for radius in (6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0):
        for theta in range(0, 360, 10):
            for phi in (55, 70, 90, 110, 125):
                t, p = math.radians(theta), math.radians(phi)
                u = (math.sin(p) * math.cos(t), math.sin(p) * math.sin(t), math.cos(p))
                ref = (0.0, 0.0, 1.0) if abs(u[2]) < 0.9 else (0.0, 1.0, 0.0)
                tan = unit_norm(cross(u, ref))
                top = (cx + radius * u[0], cy + radius * u[1], cz + radius * u[2])
                bot = (top[0] + 6.5 * tan[0] - 0.8 * u[0],
                       top[1] + 6.5 * tan[1] - 0.8 * u[1],
                       top[2] + 6.5 * tan[2] - 0.8 * u[2])
                cand = build(top, bot)
                occ = occ_xyz(cand)
                d_scaf = min_pair(occ, sc_xyz)
                if not (2.7 <= d_scaf <= 4.5):
                    continue                              # against the peptide, no clash, no gap
                if min_pair(occ_xyz(cand, 501), occ_xyz(cand, 502)) < 3.0:
                    continue                              # the two coexisting pockets would clash
                allp = sc_xyz + occ
                gc = (sum(q[0] for q in allp) / len(allp),
                      sum(q[1] for q in allp) / len(allp),
                      sum(q[2] for q in allp) / len(allp))
                span = max(math.dist(q, gc) for q in allp)  # compactness of the whole scene
                if best is None or span < best[0]:
                    best = (span, cand)
    if best is None:
        raise SystemExit("constructed_two_pocket: could not seat the pockets against the scaffold")
    placed = best[1]

    atoms = list(scaffold) + placed

    members = [
        ("Ligand", "A", 501, 501, "A", "."),
        ("EDO1", "A", 501, 501, "B", "."),
        ("EDO2", "A", 502, 502, "C", "."),
        ("EDO3", "A", 502, 502, "D", "."),
    ]
    provenance = """
CONSTRUCTED -- not deposited data. The peptide scaffold is a real 1EJG tripeptide; the
occupants are built to their correct internal geometry (ethylene glycol C-C 1.512 A /
C-O 1.423 A; a planar phenol ring) and placed so that nothing clashes.
    """

    # The flat encoding, kept as a worked negative. Both pockets hang off `base` as siblings,
    # which says they vary independently -- so a consumer enumerates the full cartesian product,
    # including Ligand together with EDO2. The occupancies forbid that state (the bottom pocket
    # sums to 0.50, exactly O(EDO1)), so the encoding contradicts its own numbers. Nothing is
    # added to rescue it: the point of the file is what a wrong parent fails to say.
    flat = fmt_loop("pdbx_heterogeneity_hierarchy", HIER_OCC_FIELDS, [
        ["base", ".", ".", ".", ".", "1.0", "."],
        ["Ligand", "top_pocket", "base", "complete", "refined", ".", "compositional"],
        ["EDO1", "top_pocket", "base", "complete", "refined", ".", "compositional"],
        ["EDO2", "bot_pocket", "base", "incomplete", "refined", ".", "compositional"],
        ["EDO3", "bot_pocket", "base", "incomplete", "refined", ".", "compositional"],
    ])
    write_cif(
        "constructed_two_pocket_flat.cif", "constructed_two_pocket_flat", provenance, atoms,
        cut_note("both pockets are parented to `base`, which says they vary independently -- "
                 "that the bottom pocket is ordered only within EDO1 has no representation here"),
        alt_groups(members), flat)

    # The same atoms and the same occupancies, correctly parented. The bottom pocket is a choice
    # that exists only inside the EDO1 population, so EDO1 is its parent and the group is
    # complete: 0.30 + 0.20 = 0.50 = O(EDO1) then follows from the tree, no relationship row
    # needed -- the same shape as pose_1/pose_2 nesting under `bound` in 7HHS.
    nested = fmt_loop("pdbx_heterogeneity_hierarchy", HIER_OCC_FIELDS, [
        ["base", ".", ".", ".", ".", "1.0", "."],
        ["Ligand", "top_pocket", "base", "complete", "refined", ".", "compositional"],
        ["EDO1", "top_pocket", "base", "complete", "refined", ".", "compositional"],
        ["EDO2", "bot_pocket", "EDO1", "complete", "refined", ".", "compositional"],
        ["EDO3", "bot_pocket", "EDO1", "complete", "refined", ".", "compositional"],
    ])
    write_cif(
        "constructed_two_pocket.cif", "constructed_two_pocket", provenance, atoms,
        cut_note("the bottom pocket is ordered only within the EDO1 population, "
                 "so EDO1 is its parent and the group is complete"),
        alt_groups(members), nested)


# --------------------------------------------------------------------------- constructed lock

def ncs_lock():
    """The cross-branch lock. Constructed -- and unavoidably so: the tie is exactly the thing
    deposition discards, so no deposited file can carry it. What a real entry leaves behind is
    two NCS copies landing at the same occupancy, which is the trace of the restraint, not the
    restraint.

    Two copies of a real 1EJG tripeptide related by a proper NCS operator (a 2-fold, then a
    translation), each with one ethylene glycol at partial occupancy in the equivalent site.
    Neither copy is the other's parent and no occupancy group contains both, so no parent link
    can tie them -- which is what `_pdbx_occupancy_relationship` type `equal` is for.
    """
    scaffold = carve("1EJG", lambda r: in_range(r, "A", 14, 16))
    sc_xyz = [(float(a["Cartn_x"]), float(a["Cartn_y"]), float(a["Cartn_z"]))
              for a in scaffold if a["type_symbol"] != "H"]
    cx, cy, cz = centroid(sc_xyz)

    # Seat one glycol against the peptide: in van der Waals contact (2.7-4.5 A), and of the
    # placements that satisfy that, the most compact -- same criterion as two_pocket.
    best = None
    for radius in (5.0, 5.5, 6.0, 6.5, 7.0, 7.5):
        for theta in range(0, 360, 10):
            for phi in (55, 70, 90, 110, 125):
                t, p = math.radians(theta), math.radians(phi)
                u = (math.sin(p) * math.cos(t), math.sin(p) * math.sin(t), math.cos(p))
                pos = (cx + radius * u[0], cy + radius * u[1], cz + radius * u[2])
                cand = het_atoms("EDO", "A", 601, 0.40, 28.0, "2", "B", edo_atoms(*pos))
                occ = xyz_of(cand)
                if not (2.7 <= min_pair(occ, sc_xyz) <= 4.5):
                    continue
                allp = sc_xyz + occ
                gc = centroid(allp)
                span = max(math.dist(q, gc) for q in allp)
                if best is None or span < best[0]:
                    best = (span, cand)
    if best is None:
        raise SystemExit("constructed_ncs_lock: could not seat the glycol against the scaffold")
    copy_a = list(scaffold) + best[1]

    # A proper NCS operator: a 2-fold about the axis through the copy's centroid parallel to z,
    # then a 16 A translation. Rigid, so copy B is geometrically identical to copy A -- which is
    # what makes the two sites equivalent and the equal-occupancy tie meaningful.
    def ncs(p):
        x, y, z = p
        return (cx - (x - cx) + 16.0, cy - (y - cy), z)

    ASYM_B = {"A": "F", "B": "G"}
    copy_b = []
    for a in copy_a:
        x, y, z = ncs((float(a["Cartn_x"]), float(a["Cartn_y"]), float(a["Cartn_z"])))
        b = dict(a)
        b["Cartn_x"], b["Cartn_y"], b["Cartn_z"] = f"{x:.3f}", f"{y:.3f}", f"{z:.3f}"
        b["auth_asym_id"] = "B"
        b["label_asym_id"] = ASYM_B.get(a["label_asym_id"], "H")
        copy_b.append(b)

    gap = min_pair(xyz_of(copy_a), xyz_of(copy_b))
    if gap < 3.0:
        raise SystemExit(f"constructed_ncs_lock: the two copies clash ({gap:.2f} A)")

    atoms = copy_a + copy_b
    members = [
        ("edo_A", "A", 601, 601, "A", "."),
        ("edo_B", "B", 601, 601, "A", "."),
    ]
    # Each glycol is a lone partial network: no sibling, no sum rule -- `single`, not `incomplete`.
    hier = fmt_loop("pdbx_heterogeneity_hierarchy", HIER_OCC_FIELDS, [
        ["base", ".", ".", ".", ".", "1.0", "."],
        ["edo_A", "siteA", "base", "single", "refined", ".", "compositional"],
        ["edo_B", "siteB", "base", "single", "refined", ".", "compositional"],
    ])
    rel = fmt_loop("pdbx_occupancy_relationship",
                   ["id", "type", "target", "enforced", "details"],
                   [["1", "equal", "edo_A", "annotation",
                     "'NCS-related copies restrained to equal occupancy'"]])
    mem = fmt_loop("pdbx_occupancy_relationship_member",
                   ["relationship_id", "state_id"],
                   [["1", "edo_B"]])
    write_cif(
        "constructed_ncs_lock.cif", "constructed_ncs_lock",
        """
CONSTRUCTED -- not deposited data. Two copies of a real 1EJG tripeptide related by a proper
NCS operator (a 2-fold, then a 16 A translation), each carrying one ethylene glycol built to
its correct internal geometry (C-C 1.512 A / C-O 1.423 A) in the equivalent site, at the same
partial occupancy. No deposited file can carry the tie itself: the restraint that produced the
equal occupancies is discarded at deposition, which is the gap this proposal is about.
        """, atoms,
        cut_note("the two sites sit in different branches and neither is the other's parent, "
                 "so no parent link can say their occupancies are locked together"),
        alt_groups(members), hier, rel, mem)


def main():
    os.makedirs(OUT, exist_ok=True)
    print("carving examples from deposited entries ->", OUT)
    minimal()
    rotamer()
    ca_site()
    gln8_split()
    apo_bound()
    apo_bound_occ()
    arg74_clash()
    two_pocket()
    ncs_lock()


if __name__ == "__main__":
    main()
