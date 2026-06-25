"""
Parse the pinned PDBx/mmCIF dictionary into structured JSON artifacts.

Outputs (committed, consumed client-side by the Next.js app):
  app/public/data/dictionary.json  -- categories, items, types, groups (the "database")
  app/public/data/graph.json       -- category-level nodes + relational edges (the ER backbone)

Run: pipeline/.venv/bin/python pipeline/build_artifacts.py
"""
import hashlib
import json
import textwrap
import time
from pathlib import Path

from mmcif.io.IoAdapterPy import IoAdapterPy
from mmcif.api.DictionaryApi import DictionaryApi

ROOT = Path(__file__).resolve().parent.parent
DIC = ROOT / "pipeline" / "data" / "mmcif_pdbx_v50.dic"
OUT = ROOT / "app" / "public" / "data"
SOURCE_URL = "https://mmcif.wwpdb.org/dictionaries/ascii/mmcif_pdbx_v50.dic"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def reflow(s):
    """Reflow hard-wrapped dictionary prose into clean paragraphs.

    Dictionary descriptions are wrapped at ~60 cols with ragged indentation. Join
    wrapped lines within a paragraph into one line; keep blank-line paragraph breaks.
    """
    if not s:
        return None
    paras, cur = [], []
    for line in s.replace("\t", " ").splitlines():
        if line.strip() == "":
            if cur:
                paras.append(" ".join(cur))
                cur = []
        else:
            cur.append(line.strip())
    if cur:
        paras.append(" ".join(cur))
    out = "\n\n".join(p for p in paras if p)
    return out or None


def block(s):
    """Preserve literal example blocks (dedent, keep line structure)."""
    if not s:
        return None
    return textwrap.dedent(s.replace("\t", "    ")).strip("\n").rstrip() or None


def cat_of(item_name: str) -> str:
    """'_atom_site.label_entity_id' -> 'atom_site'"""
    return item_name.lstrip("_").split(".", 1)[0]


def main():
    t0 = time.time()
    io = IoAdapterPy()
    containers = io.readFile(str(DIC))
    d = DictionaryApi(containerList=containers, consolidate=True)
    print(f"loaded dictionary in {time.time() - t0:.1f}s")

    cat_names = sorted(d.getCategoryList())

    # --- type definitions (deduped; items reference a type by code) ---
    types = {}
    for tup in d.getDataTypeList():
        code = tup[0]
        types[code] = {
            "code": code,
            "primitive": tup[1] if len(tup) > 1 else None,
            "regex": tup[2] if len(tup) > 2 else None,
            "detail": None,  # filled below from a representative item
        }

    # --- category groups ---
    groups = {}
    for g in list(d.getCategoryGroups()):
        groups[g] = {
            "id": g,
            "description": reflow(d.getCategoryGroupDescription(g)),
            "parent": d.getCategoryGroupParent(g) if hasattr(d, "getCategoryGroupParent") else None,
            "categories": sorted(d.getCategoryGroupCategories(g) or []),
        }

    categories = {}
    items = {}
    # edge_key (childCat, parentCat) -> list of {child, parent}
    edge_links = {}

    for cat in cat_names:
        attrs = d.getAttributeNameList(cat) or []
        categories[cat] = {
            "name": cat,
            "description": reflow(d.getCategoryDescription(cat)),
            "groups": d.getCategoryGroupList(cat) or [],
            "keys": d.getCategoryKeyList(cat) or [],
            "mandatory": d.getCategoryMandatoryCode(cat),
            "examples": [block(e[0]) for e in (d.getCategoryExampleList(cat) or []) if e and e[0]],
            "items": sorted(attrs),
        }

        for attr in attrs:
            name = f"_{cat}.{attr}"
            type_code = d.getTypeCode(cat, attr)
            if type_code and type_code in types and types[type_code]["detail"] is None:
                types[type_code]["detail"] = reflow(d.getTypeDetail(cat, attr))

            enums = d.getEnumListWithDetail(cat, attr) or []
            parents = d.getFullParentList(cat, attr) or []

            rec = {
                "name": name,
                "category": cat,
                "attribute": attr,
                "description": reflow(d.getDescription(cat, attr)),
                "type": type_code,
                "mandatory": d.getMandatoryCode(cat, attr),
                "units": d.getUnits(cat, attr),
                "default": d.getDefaultValue(cat, attr),
            }
            if enums:
                rec["enums"] = [[v, reflow(det)] for v, det in enums]
            ex = d.getExampleList(cat, attr) or []
            ex = [block(e[0]) for e in ex if e and e[0]]
            if ex:
                rec["examples"] = ex
            bnd = d.getBoundaryList(cat, attr) or []
            if bnd:
                rec["boundaries"] = bnd
            aliases = d.getItemAliasList(cat, attr) or []
            if aliases:
                rec["aliases"] = [list(a) for a in aliases]
            if parents:
                rec["parents"] = parents
            items[name] = rec

            # relational edges: child -> parent (foreign key -> primary key)
            for p in parents:
                pcat = cat_of(p)
                key = (cat, pcat)
                edge_links.setdefault(key, []).append({"child": name, "parent": p})

    # --- assemble graph.json (category-level backbone) ---
    nodes = [
        {
            "id": cat,
            "label": cat,
            "groups": categories[cat]["groups"],
            "numItems": len(categories[cat]["items"]),
            "numKeys": len(categories[cat]["keys"]),
        }
        for cat in cat_names
    ]
    edges = []
    for i, ((child_cat, parent_cat), links) in enumerate(sorted(edge_links.items())):
        edges.append(
            {
                "id": f"e{i}",
                "source": child_cat,   # the referencing (foreign-key) category
                "target": parent_cat,  # the referenced (primary-key) category
                "self": child_cat == parent_cat,
                "count": len(links),
                "links": links,
            }
        )

    meta = {
        "title": d.getDictionaryTitle(),
        "version": d.getDictionaryVersion(),
        "source_url": SOURCE_URL,
        "source_file": DIC.name,
        "source_sha256": sha256(DIC),
        "num_categories": len(categories),
        "num_items": len(items),
        "num_edges": len(edges),
        "num_groups": len(groups),
    }

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "dictionary.json").write_text(
        json.dumps(
            {"meta": meta, "types": types, "groups": groups,
             "categories": categories, "items": items},
            indent=None, separators=(",", ":"), ensure_ascii=False,
        )
    )
    (OUT / "graph.json").write_text(
        json.dumps({"meta": meta, "nodes": nodes, "edges": edges},
                   indent=None, separators=(",", ":"), ensure_ascii=False)
    )

    # --- sanity checks: fail loudly on a broken parse ---
    assert len(categories) > 400, f"too few categories: {len(categories)}"
    assert len(items) > 4000, f"too few items: {len(items)}"
    assert "atom_site" in categories and "entity" in categories
    assert items["_atom_site.group_PDB"].get("enums") == [["ATOM", None], ["HETATM", None]]
    assert items["_atom_site.label_entity_id"].get("parents") == ["_entity.id"]
    assert any(e["source"] == "atom_site" and e["target"] == "entity" for e in edges)

    print(f"OK  dict v{meta['version']}  sha {meta['source_sha256'][:12]}")
    print(f"    categories={meta['num_categories']}  items={meta['num_items']}  "
          f"edges={meta['num_edges']}  groups={meta['num_groups']}  types={len(types)}")
    for f in ("dictionary.json", "graph.json"):
        kb = (OUT / f).stat().st_size / 1024
        print(f"    {f}: {kb:.0f} KB")
    print(f"done in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
