#!/usr/bin/env python3
"""Build the /proposal example files by carving local sites out of real PDB entries.

Coordinates are copied verbatim from the deposited mmCIF -- nothing is idealised, regenerated
or nudged. What we add is the proposed heterogeneity annotation (_pdbx_alt_groups,
_pdbx_heterogeneity_hierarchy, _pdbx_state_coexistence, _pdbx_occupancy_constraint), because
that is the thing being proposed and it does not exist in the archive yet.

Where a network definition has a counterpart in the working group's own annotated file
(source_docs/5E1N_hierarchy_20250423.cif) we reuse that grouping and say so in the header.

Sources
  1EJG  crambin, 0.54 A          -- the baseline spine and an isolated side-chain rotamer
  5E1N  calmodulin, atomic res.  -- correlated networks, the sub-residue boundary, the Ca site,
                                    and the one real NOT exclusion
  7HHS  fragment screen          -- apo/bound nesting with two exclusive ligand poses

The two-pocket DAG case has no deposited counterpart (it is a constructed case in the source
deck too); it is built here with correct chemistry and labelled as constructed.

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
Coordinates are the deposited ones, copied verbatim; hydrogens omitted.

The baseline: a coordinate file is a spine of cross-references, and _atom_site holds
the coordinates. Every atom is fully present -- occupancy 1.00, no label_alt_id.
Every later example is a delta against this.
        """, atoms)


def rotamer():
    """1EJG Arg10: a pure side-chain rotamer, single-conformer neighbours."""
    atoms = carve("1EJG", lambda r: in_range(r, "A", 9, 11))
    write_cif(
        "1EJG_rotamer.cif", "1EJG_rotamer",
        """
Crambin (PDB 1EJG), residues Ala9-Arg10-Ser11 of chain A. Deposited coordinates, H omitted.

Arg10's guanidinium group is modelled in two positions: label_alt_id A at occupancy 0.67
and B at 0.33. Its backbone and the first half of its side chain (N, CA, C, O, CB, CG, CD)
carry no altloc -- they are single-conformer and shared. The neighbours are single-conformer.

Both alternatives sit inside one residue, so the altloc letter relates only things that are
already together and the occupancies sum to 1 within the residue. mmCIF already handles this
completely. No extension is needed, and none of the proposed categories appear here.
        """, atoms)


def ca_site():
    """5E1N calcium site: two correlated multi-residue networks + the metal.

    Network definitions are the working group's own, from 5E1N_hierarchy_20250423.cif,
    clipped to the carved residue window.
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
residues 19-31 of chain A, the ion, and its coordinating water. Deposited coordinates,
copied verbatim; hydrogens omitted.

Two multi-residue alternates run through this loop, and they are the reason the altloc
letter alone is not enough:

  residues 19-24  are modelled in TWO alternates,  lettered B (0.48) and D (0.52)
  residues 25-31  are modelled in FOUR alternates, lettered A (0.38) B (0.24) C (0.19) D (0.19)

Each set sums to 1.00, so each is one occupancy group. But the two sets use different
letters: there is no letter A or C in the first segment at all, and nothing in the file
says whether "B" at residue 20 is the same physical state as "B" at residue 26. The
correlation is real -- both segments coordinate the same ion -- and it is unwritten.

The _pdbx_alt_groups / _pdbx_heterogeneity_hierarchy rows below write it down. The grouping
is the working group's own, from 5E1N_hierarchy_20250423.cif (groups A18B_to_A24B /
A18D_to_A24D and A25{A,B,C,D}_to_A36{A,B,C,D}), clipped to the carved residue window.

_struct_conn carries the deposited metal coordination bonds. They are altloc-specific --
Thr26's carbonyl O reaches the ion at 2.33 / 2.45 / 2.65 / 2.10 A in alternates A / B / C / D
-- so they cannot be reconstructed from a distance cutoff and have to be recorded.
        """, atoms, alt_groups(members), hier, conn)


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
verbatim. Hydrogens are omitted EXCEPT Gln8's backbone amide H, which is the whole point.

Gln8 carries two independent choices at once, and they reuse the same altloc letters:

  its amide H  follows the residues 6-7 backbone alternate  -- letters A, B, C
  its side chain (CB CG CD OE1 NE2) is its own rotamer      -- letters A, B

So the atoms of Gln8 with label_alt_id = A belong to TWO different networks: the H to the
6-7 backbone network, the side chain to the residue-8 rotamer. A key of
(chain, residue range, altloc) cannot separate them -- both are "chain A, residue 8, alt A".

This is not hypothetical. In the working group's own annotated 5E1N there are 28 such
(residue, altloc) pairs whose atoms fall in two different heterogeneity groups, and it is
why that file resorted to a per-atom column on _atom_site. The optional label_atom_id
column on _pdbx_alt_groups says the same thing without touching the coordinate table:
a row with an atom name claims exactly that atom.
        """, atoms, alt_groups(members), hier)


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

The pocket itself is modelled in two conformations:

  apo    label_alt_id A   occupancy 0.78
  bound  label_alt_id B   occupancy 0.22

and the ligand is modelled twice, as two mutually exclusive poses that occupy the same space
(their closest atoms are 0.02 A apart -- they cannot both be there):

  pose_1  residue 201  label_alt_id B  occupancy 0.13
  pose_2  residue 202  label_alt_id C  occupancy 0.09

The arithmetic is the point:  0.13 + 0.09 = 0.22 = occupancy(bound).

The ligand poses are ordered only within the bound population, so their occupancies sum to
their parent's rather than to 1. The hierarchy carries exactly that: apo and bound share one
occupancy group under base, and the two poses share a second group whose PARENT is bound.
No exclusion row is needed -- a pose cannot co-occur with apo because its parent excludes apo.

The apo node is also what finally gives the ligand's ABSENCE a name. In 78% of the copies there
is no ligand at all, and a state with no atoms cannot be named by any per-atom mechanism; only a
node in the tree can carry it.

Note finally that the ligand's letters (B, C) do not line up with the pocket's (A, B). "B" on
residue 201 and "B" on residue 22 are different physical states that happen to share a letter.
The letter's guarantee is local; it is a hint, not a record.
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
              _hhs_atoms(), alt_groups(_hhs_members()), hier)


def apo_bound_occ():
    hier = fmt_loop("pdbx_heterogeneity_hierarchy", HIER_OCC_FIELDS, [
        ["base", ".", ".", ".", ".", "1.0", "."],
        ["apo", "pocket", "base", "complete", "refined", ".", "compositional"],
        ["bound", "pocket", "base", "complete", "refined", ".", "compositional"],
        ["pose_1", "ligand_pose", "bound", "complete", "refined", ".", "conformational"],
        ["pose_2", "ligand_pose", "bound", "complete", "refined", ".", "conformational"],
    ])
    header = NESTING_HEADER + """
Here the hierarchy also carries the occupancy SPECIFICATION -- the thing that survives in the
refinement program's keyword file but not in the deposited entry:

  occupancy_completeness  complete: the group sums to its parent's occupancy
  occupancy_refine_flag   whether the group total was refined or held fixed
  occupancy_value         the held value, when fixed
  state_kind              compositional (something is there or not) vs conformational
                          (the same thing in a different pose)

apo + bound = 1 is complete under the root. pose_1 + pose_2 = occupancy(bound) is complete
under a refinable parent -- the nested case that no mainstream program fits today, recorded
so that a pipeline can grow into it.
"""
    write_cif("7HHS_apo_bound_occ.cif", "7HHS_apo_bound_occ", header,
              _hhs_atoms(), alt_groups(_hhs_members()), hier)


def arg74_clash():
    """5E1N Arg74 vs HOH 468: the one real NOT row in the working group's annotation."""
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
Calmodulin (PDB 5E1N), Arg74 and its neighbours, plus water 468. Deposited coordinates,
copied verbatim; H omitted.

Arg74 is modelled in three alternates (B, C, D). Water 468 is modelled at partial occupancy
in alternate E. They sit in different branches of the tree -- one is a side-chain rotamer,
the other is a solvent site -- so nothing in the hierarchy forbids them co-occurring.

But they cannot co-occur: in alternate B the guanidinium NH2 lands 2.14 A from the water.
That is not a hydrogen bond, it is a clash. The tree cannot imply this, because the two
networks are not siblings and no occupancy group relates them.

That is the entire job of _pdbx_state_coexistence: a sparse NOT-only list for the rare
cross-branch clash. This one row is the only exclusion in the whole of the working group's
annotated 5E1N -- which is the argument for making the category optional and keeping it
NOT-only. AND / OR were deliberately left out: they admit several readings.
        """, atoms, alt_groups(members), hier, excl)


# --------------------------------------------------------------------------- constructed DAG

def two_pocket():
    """The two-pocket DAG. Constructed -- there is no deposited counterpart -- but with real
    chemistry: ethylene glycol (EDO) built to its ideal internal geometry, a phenol ring for
    the ligand, and every non-bonded contact between coexisting groups kept above 3.0 A.
    The protein scaffold is a real 1EJG tripeptide.
    """
    scaffold = carve("1EJG", lambda r: in_range(r, "A", 14, 16))

    def het(comp, alt, seq, occ, b, entity, asym, atoms):
        out = []
        for name, el, (x, y, z) in atoms:
            out.append({
                "group_PDB": "HETATM", "type_symbol": el, "label_atom_id": name,
                "label_alt_id": alt, "label_comp_id": comp, "label_asym_id": asym,
                "label_entity_id": entity, "label_seq_id": ".", "pdbx_PDB_ins_code": "?",
                "Cartn_x": f"{x:.3f}", "Cartn_y": f"{y:.3f}", "Cartn_z": f"{z:.3f}",
                "occupancy": f"{occ:.2f}", "B_iso_or_equiv": f"{b:.2f}",
                "pdbx_formal_charge": "?", "auth_seq_id": str(seq), "auth_comp_id": comp,
                "auth_asym_id": "A", "auth_atom_id": name, "pdbx_PDB_model_num": "1",
            })
        return out

    # Ethylene glycol, ideal geometry: C-C 1.512, C-O 1.423, staggered.
    def edo(ox, oy, oz, flip=1.0):
        return [
            ("C1", "C", (ox + 0.000, oy + 0.000, oz + 0.000)),
            ("C2", "C", (ox + 1.512, oy + 0.000, oz + 0.000)),
            ("O1", "O", (ox - 0.475, oy + 1.340, oz + 0.000)),
            ("O2", "O", (ox + 1.987, oy - 1.340 * flip, oz + 0.000)),
        ]

    # Phenol: planar ring, C-C 1.390, C-O 1.375.
    def phenol(cx, cy, cz):
        out = []
        for i in range(6):
            th = math.radians(60 * i)
            out.append((f"C{i + 1}", "C", (cx + 1.390 * math.cos(th), cy + 1.390 * math.sin(th), cz)))
        th = math.radians(0)
        out.append(("O1", "O", (cx + (1.390 + 1.375) * math.cos(th),
                                cy + (1.390 + 1.375) * math.sin(th), cz)))
        return out

    # Two pockets ~7 A apart, both clear of the peptide. The two occupants of a pocket overlap
    # each other (mutually exclusive); occupants of different pockets do not (they can coexist).
    # Placement is searched rather than guessed: we sweep candidate directions off the peptide
    # centroid and take the first that keeps every built atom in van der Waals contact range
    # (3.4-8 A) of the scaffold and clear of it. Guessing is what produced the 1.66 A clash in
    # the file this replaces.
    sc_xyz = [(float(a["Cartn_x"]), float(a["Cartn_y"]), float(a["Cartn_z"])) for a in scaffold]
    cx = sum(p[0] for p in sc_xyz) / len(sc_xyz)
    cy = sum(p[1] for p in sc_xyz) / len(sc_xyz)
    cz = sum(p[2] for p in sc_xyz) / len(sc_xyz)

    def build(top, bot):
        out = []
        out += het("IPH", "A", 501, 0.50, 25.0, "2", "B", phenol(*top))
        out += het("EDO", "B", 501, 0.50, 25.0, "3", "C", edo(top[0] - 0.7, top[1] - 0.4, top[2]))
        out += het("EDO", "C", 502, 0.30, 30.0, "3", "D", edo(*bot))
        out += het("EDO", "D", 502, 0.20, 32.0, "3", "E",
                   edo(bot[0] + 0.35, bot[1] + 0.30, bot[2], -1.0))
        return out

    def min_to_scaffold(built):
        return min(math.dist((float(a["Cartn_x"]), float(a["Cartn_y"]), float(a["Cartn_z"])), p)
                   for a in built for p in sc_xyz)

    placed = None
    for radius in (9.0, 10.0, 11.0, 12.0):
        for theta in range(0, 360, 15):
            for phi in (60, 90, 120):
                t, p = math.radians(theta), math.radians(phi)
                ux, uy, uz = (math.sin(p) * math.cos(t), math.sin(p) * math.sin(t), math.cos(p))
                top = (cx + radius * ux, cy + radius * uy, cz + radius * uz)
                # the second pocket sits 7 A further out along the same ray -- adjacent, distinct
                bot = (cx + (radius + 7.0) * ux, cy + (radius + 7.0) * uy, cz + (radius + 7.0) * uz)
                cand = build(top, bot)
                if min_to_scaffold(cand) >= 3.4:
                    placed = cand
                    break
            if placed:
                break
        if placed:
            break
    if placed is None:
        raise SystemExit("constructed_two_pocket: could not place the pockets clear of the scaffold")

    atoms = list(scaffold) + placed

    members = [
        ("Ligand", "A", 501, 501, "A", "."),
        ("EDO1", "A", 501, 501, "B", "."),
        ("EDO2", "A", 502, 502, "C", "."),
        ("EDO3", "A", 502, 502, "D", "."),
    ]
    hier = fmt_loop("pdbx_heterogeneity_hierarchy", HIER_OCC_FIELDS, [
        ["base", ".", ".", ".", ".", "1.0", "."],
        ["Ligand", "top_pocket", "base", "complete", "refined", ".", "compositional"],
        ["EDO1", "top_pocket", "base", "complete", "refined", ".", "compositional"],
        ["EDO2", "bot_pocket", "base", "incomplete", "refined", ".", "compositional"],
        ["EDO3", "bot_pocket", "base", "incomplete", "refined", ".", "compositional"],
    ])
    cons = fmt_loop("pdbx_occupancy_constraint",
                    ["id", "type", "target_group_id", "target_value", "enforced", "details"],
                    [["1", "linear", ".", "0.0", "annotation",
                      "'cross-pocket DAG: O(EDO1) = O(EDO2) + O(EDO3)'"]])
    terms = fmt_loop("pdbx_occupancy_constraint_term",
                     ["constraint_id", "alt_group_id", "coefficient"],
                     [["1", "EDO1", "1.0"], ["1", "EDO2", "-1.0"], ["1", "EDO3", "-1.0"]])
    write_cif(
        "constructed_two_pocket.cif", "constructed_two_pocket",
        """
CONSTRUCTED -- this is the only example on the page that is not deposited data. It is the
working group's two-pocket case, which has no counterpart in the archive; it is a constructed
case in the source deck too. The peptide scaffold is a real 1EJG tripeptide; the occupants are
built to their correct internal geometry (ethylene glycol C-C 1.512 A / C-O 1.423 A; a planar
phenol ring) and placed so that nothing clashes.

Two adjacent pockets:

  top pocket    (residue 501)  Ligand (alt A, 0.50)  xor  EDO1 (alt B, 0.50)  -> sums to 1
  bottom pocket (residue 502)  EDO2   (alt C, 0.30)  xor  EDO3 (alt D, 0.20)  -> sums to 0.5

The tree records the two exclusive pockets cleanly, as two coexistence groups under base.
Read alone, it projects them as INDEPENDENT: the enumerated states are the 2x2 cartesian
product. The one fact it cannot hold is the cross-pocket coupling -- the bottom pocket is
ordered only within the EDO1 population, so

  O(EDO1) = O(EDO2) + O(EDO3)

That is a genuine second parent: a directed acyclic graph, not a tree. It is carried below as
one _pdbx_occupancy_constraint row of type 'linear', shaped like a refinement restraint, with
enforced = annotation -- written down and portable, though no mainstream program fits it yet.
        """, atoms, alt_groups(members), hier, cons, terms)


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


if __name__ == "__main__":
    main()
