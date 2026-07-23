#!/usr/bin/env python3
"""Check the /proposal page's cross-references against the things they point at.

tsc and next build never read prose, and check_examples.py only measures geometry -- so a <Tok>
naming a network that does not exist, a <Cat> whose category is not in the dictionary, or a <Ref>
to a deleted anchor all ship green. This reads them.

NOTE the endpoint bug the handoff flagged: an earlier version of this check accepted a residue
range if ANY residue in it existed, so `A/19-31` passed on the strength of 20-31. Both endpoints
are checked here.
"""
import json
import re
import sys

REPO = "/Users/rtviii/dev/mmcif-browser"
PAGE = f"{REPO}/app/src/components/proposal/ProposalPage.tsx"
EX = f"{REPO}/app/public/examples/het"

src = open(PAGE).read()
het = json.load(open(f"{REPO}/app/public/data/dictionary.het.json"))
fail = []


def load_atoms(path):
    lines = open(path).read().splitlines()
    i = 0
    while i < len(lines):
        if lines[i].strip() == "loop_":
            j, names = i + 1, []
            while j < len(lines) and lines[j].strip().startswith("_"):
                names.append(lines[j].strip())
                j += 1
            if names and names[0].startswith("_atom_site."):
                cols = [n.split(".", 1)[1] for n in names]
                idx = {c: k for k, c in enumerate(cols)}
                out = []
                while j < len(lines) and lines[j].strip() and not lines[j].startswith("#"):
                    p = lines[j].split()
                    if len(p) < len(cols):
                        break
                    out.append((p[idx["auth_asym_id"]], int(p[idx["auth_seq_id"]]),
                                p[idx["label_atom_id"]], p[idx["label_alt_id"]]))
                    j += 1
                return out
            i = j
            continue
        i += 1
    return []


def load_networks(path):
    out = set()
    for m in re.finditer(r"^_pdbx_alt_groups\.alt_group_id\s*$", open(path).read(), re.M):
        pass
    lines = open(path).read().splitlines()
    i = 0
    while i < len(lines):
        if lines[i].strip() == "loop_":
            j, names = i + 1, []
            while j < len(lines) and lines[j].strip().startswith("_"):
                names.append(lines[j].strip())
                j += 1
            if names and names[0].startswith("_pdbx_alt_groups."):
                cols = [n.split(".", 1)[1] for n in names]
                k = cols.index("alt_group_id")
                while j < len(lines) and lines[j].strip() and not lines[j].startswith("#"):
                    p = lines[j].split()
                    if len(p) < len(cols):
                        break
                    out.add(p[k])
                    j += 1
                return out
            i = j
            continue
        i += 1
    return out


# ---------------------------------------------------------------- 1. <Tok> inside each figure
# Each StageFigure block owns the Toks in its brief; resolve them against that figure's own file.
figs = 0
toks = 0
for m in re.finditer(r"<StageFigure\b(.*?)\n\s{12}/>", src, re.S):
    block = m.group(1)
    fid = re.search(r'id="([^"]+)"', block)
    url = re.search(r'fileUrl="/examples/het/([^"]+)"', block)
    if not (fid and url):
        continue
    figs += 1
    path = f"{EX}/{url.group(1)}"
    atoms = load_atoms(path)
    nets = load_networks(path)
    chains_seqs = {(c, s) for c, s, _, _ in atoms}
    named = {(c, s, a) for c, s, a, _ in atoms}
    alts = {al for _, _, _, al in atoms if al not in ".?"}

    for t in re.finditer(r'<Tok\s+net="([^"]+)"', block):
        toks += 1
        if t.group(1) not in nets:
            fail.append(f"{fid.group(1)}: Tok net={t.group(1)!r} not a network in {url.group(1)}")
    for t in re.finditer(r'<Tok\s+altloc="([^"]+)"', block):
        toks += 1
        if t.group(1) not in alts:
            fail.append(f"{fid.group(1)}: Tok altloc={t.group(1)!r} not an altloc in {url.group(1)}")
    for t in re.finditer(r'<Tok\s+res="([^"]+)"', block):
        toks += 1
        v = t.group(1)
        mm = re.match(r"^([A-Za-z0-9]+)/(\d+)(?:-(\d+))?$", v)
        if not mm:
            fail.append(f"{fid.group(1)}: Tok res={v!r} unparseable")
            continue
        ch, lo = mm.group(1), int(mm.group(2))
        hi = int(mm.group(3)) if mm.group(3) else lo
        # BOTH endpoints, not "any residue in the span" -- that is the bug that let A/19-31 pass.
        for end in (lo, hi):
            if (ch, end) not in chains_seqs:
                fail.append(f"{fid.group(1)}: Tok res={v!r} -> residue {ch}/{end} does not exist "
                            f"in {url.group(1)}")
    for t in re.finditer(r'<Tok\s+atom="([^"]+)"', block):
        toks += 1
        v = t.group(1)
        mm = re.match(r"^([A-Za-z0-9]+)/(\d+)/(\S+)$", v)
        if not mm:
            fail.append(f"{fid.group(1)}: Tok atom={v!r} unparseable")
            continue
        key = (mm.group(1), int(mm.group(2)), mm.group(3))
        if key not in named:
            fail.append(f"{fid.group(1)}: Tok atom={v!r} does not exist in {url.group(1)}")

# ---------------------------------------------------------------- 2. <Cat> / <It> vs the dictionary
cats = 0
for m in re.finditer(r'<Cat\s+name="([^"]+)"', src):
    cats += 1
    if m.group(1) not in het["categories"]:
        fail.append(f"<Cat name={m.group(1)!r}> is not in dictionary.het.json")
its = 0
for m in re.finditer(r'<It\s+cat="([^"]+)"\s+field="([^"]+)"', src):
    its += 1
    name = f"_{m.group(1)}.{m.group(2)}"
    if name not in het["items"]:
        fail.append(f"<It cat={m.group(1)!r} field={m.group(2)!r}> -> {name} is not in the dictionary")

# --------------------------------------------- 2b. PROPOSED_CATEGORIES vs the fork, and the links
# The page links every name that already exists to the wwPDB dictionary browser, and withholds the
# link from the ones it proposes -- so "is it a link?" answers "does this exist today?". That only
# works while PROPOSED_CATEGORIES matches the fork exactly. Get it wrong in one direction and the
# page emits a 404 for a category wwPDB never published; wrong in the other and it silently claims
# a real category is ours.
base = json.load(open(f"{REPO}/app/public/data/dictionary.json"))
declared = set(re.findall(r"^\s*_category\.id\s+(\S+)\s*$",
                          open(f"{REPO}/pipeline/data/mmcif_pdbx_v50_het_ext.dic").read(), re.M))
listed = set(re.findall(r'"([a-z0-9_]+)",', src[src.index("const PROPOSED_CATEGORIES"):
                                                src.index("const DICT_URL")]))
if listed != declared:
    fail.append(f"PROPOSED_CATEGORIES != the fork's categories. "
                f"only in the page: {sorted(listed - declared)}; only in the .dic: {sorted(declared - listed)}")
# Cross-check against the base dictionary, which is built from the .dic wwPDB actually publishes:
# anything the page links must be in it, and anything it proposes must NOT be.
for c in {m.group(1) for m in re.finditer(r'<Cat\s+name="([^"]+)"', src)}:
    if c in listed and c in base["categories"]:
        fail.append(f"{c} is listed as proposed but already exists in the base dictionary")
    if c not in listed and c not in base["categories"]:
        fail.append(f"{c} would be linked to wwPDB but is not in the base dictionary -> 404")
for c, f_ in {(m.group(1), m.group(2)) for m in re.finditer(r'<It\s+cat="([^"]+)"\s+field="([^"]+)"', src)}:
    if c not in listed and f"_{c}.{f_}" not in base["items"]:
        fail.append(f"_{c}.{f_} would be linked to wwPDB but is not in the base dictionary -> 404")

# ---------------------------------------------------------------- 3. <Ref to> vs the section ids
ids = set(re.findall(r'<Section\s+id="([^"]+)"', src)) | set(
    re.findall(r"<Section\s*\n\s*id=\"([^\"]+)\"", src))
refs = 0
for m in re.finditer(r'<Ref\s+to="([^"]+)"', src):
    refs += 1
    if m.group(1) not in ids:
        fail.append(f'<Ref to="{m.group(1)}"> has no matching <Section id>')
for m in re.finditer(r'\bto:\s*"([a-z]+)",\n\s*where:', src):
    if m.group(1) not in ids:
        fail.append(f'Escalator to: "{m.group(1)}" has no matching <Section id>')

# ---------------------------------------------------------------- 4. nav rail vs reality
for m in re.finditer(r'\{\s*id:\s*"([^"]+)",\s*label:\s*"([^"]+)"\s*\}', src):
    if m.group(1) not in ids:
        fail.append(f'nav rail lists id "{m.group(1)}" but no <Section> has it')

print(f"figures {figs} · Tok {toks} · Cat {cats} · It {its} · Ref {refs} · section ids {len(ids)}")
if fail:
    print(f"\n{len(fail)} PROBLEM(S):")
    for f in fail:
        print("  -", f)
    sys.exit(1)
print("every Tok, Cat, It and Ref on the page resolves.")
