"""Scaffold the network spotlight notes from the networks repo's own records.

    python tools/build_spotlights.py                 # only what does not exist
    python tools/build_spotlights.py --force         # rewrite the FACTS, keep prose
    python tools/build_spotlights.py --networks-dir ../networks

One note per category, a section per network, each with an interactive embed and
the facts about that network: counts, what it is, how it was collected, its rights,
and where it came from. Those all come from the networks repo -- the GML's own
graph attributes, its entry.json, its README -- so they cannot drift from the data
the way a hand-copied summary would.

WHAT THIS DOES NOT WRITE. Your thoughts about each network. Every section ends with
a marked block for them, and `--force` regenerates the facts around those blocks
while leaving whatever is inside them alone. So a rebuild after the data changes
does not cost you your prose, and nothing appears under your name that you did not
write.

The marker pair is exact; do not edit the marker lines themselves.
"""
from __future__ import annotations

import argparse
import collections
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "quarto_src" / "notes" / "2025"

BEGIN = "<!-- THOUGHTS:{slug} -- your prose goes below; regeneration preserves it -->"
END = "<!-- /THOUGHTS:{slug} -->"

# Category -> (file slug, title, blurb). The order is the order they read in.
CATEGORIES = {
    "Social": ("spotlight_social", "Network spotlight: social",
               "People, characters and animals, and the ties between them."),
    "Informational": ("spotlight_informational", "Network spotlight: informational",
                      "Things that refer to, cite, depend on or contain one another."),
    "Biological": ("spotlight_biological", "Network spotlight: biological",
                   "Who eats whom, who pollinates what, and one animal's nervous system."),
    "Economic": ("spotlight_economic", "Network spotlight: economic",
                 "Trade, hiring and travel: networks where the edges move something."),
    "Geographic": ("spotlight_geographic", "Network spotlight: geographic",
                   "Networks with real coordinates, drawn on the map they live on."),
    "Synthetic": ("spotlight_synthetic", "Network spotlight: synthetic",
                  "Networks sampled from a model, where the right answer is known."),
}

# A sensible interactive view per network: what to colour by, and how to lay it
# out. Taken from the network's own manifest defaults unless it needs an override.
OVERRIDES = {
    "chickens": "layout=coord&coordYAttr=value&labelAttr=label&edgeOpacity=0.7",
    "pollinator": "layout=coord&coordXAttr=group&colorAttr=group&labelAttr=label",
}


def graph_attrs(p: pathlib.Path) -> dict[str, str]:
    head = p.read_text(encoding="utf-8", errors="replace").split("node [", 1)[0]
    return {k: v for k, v in re.findall(r'^\s*(\w+)\s+"((?:[^"\\]|\\.)*)"', head, re.M)}


def counts(p: pathlib.Path) -> tuple[int, int, bool]:
    t = p.read_text(encoding="utf-8", errors="replace")
    return (len(re.findall(r"\bnode\s*\[", t)), len(re.findall(r"\bedge\s*\[", t)),
            bool(re.search(r"^\s*directed 1", t, re.M)))


def unescape(s: str) -> str:
    return s.replace("&#62;", ">").replace("&#38;", "&").replace('\\"', '"')


def params_for(stem: str, entry: dict) -> str:
    if stem in OVERRIDES:
        return OVERRIDES[stem]
    o = entry.get("options") or {}
    # Only the keys that change what a reader sees; the rest are already the
    # network's own defaults and repeating them in a URL adds nothing.
    keep = [(k, o[k]) for k in ("layout", "colorAttr", "sizeAttr", "labelAttr",
                                "coordXAttr", "coordYAttr", "edgeOpacity", "edgeScale")
            if o.get(k) not in (None, "", "none", "default")]
    return "&".join(f"{k}={v}" for k, v in keep)


def section(d: pathlib.Path, entry: dict) -> str:
    stem = d.name
    gml = d / f"{stem}.gml"
    a = graph_attrs(gml)
    n, m, directed = counts(gml)
    label = entry.get("label", stem)
    key = entry.get("key") or {}
    node_k = (key.get("node") or {}).get("full") or ""
    edge_k = (key.get("edge") or {}).get("full") or ""

    L = [f"## {label} {{#{stem.replace('_', '-')}}}", ""]
    L += ["```{=html}",
          f'<div class="ew-embed" data-network="{stem}.gml"',
          f'     data-params="{params_for(stem, entry)}"',
          f'     data-caption="{label} — {n} nodes, {m} edges, '
          f'{"directed" if directed else "undirected"}"></div>',
          "```", ""]
    if node_k or edge_k:
        L += ["| | |", "|---|---|"]
        if node_k:
            L.append(f"| **A node** | {node_k} |")
        if edge_k:
            L.append(f"| **An edge** | {edge_k} |")
        L.append("")
    if a.get("attribution") or a.get("selfContained"):
        L += [unescape(a.get("attribution") or a.get("selfContained")), ""]

    bits = []
    if a.get("source"):
        bits.append(" ".join(f"[source]({u.strip()})" for u in a["source"].split(";")))
    bits.append(f"[data and build script](https://github.com/maxjerdee/networks/tree/main/networks/{stem})")
    L += ["*" + " · ".join(bits) + "*", ""]
    if a.get("license"):
        L += [f"**Licence.** {unescape(a['license'])}", ""]

    L += [BEGIN.format(slug=stem), "", "*(thoughts to come)*", "",
          END.format(slug=stem), ""]
    return "\n".join(L)


def existing_thoughts(path: pathlib.Path) -> dict[str, str]:
    """slug -> whatever is between that slug's markers in the current file."""
    if not path.exists():
        return {}
    text = path.read_text(encoding="utf-8")
    out = {}
    for m in re.finditer(r"<!-- THOUGHTS:(\w[\w-]*) --[^>]*-->\n(.*?)\n<!-- /THOUGHTS:\1 -->",
                         text, re.S):
        out[m.group(1)] = m.group(2)
    return out


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--networks-dir", type=pathlib.Path, default=ROOT.parent / "networks")
    ap.add_argument("--force", action="store_true",
                    help="rewrite the generated facts, preserving each THOUGHTS block")
    args = ap.parse_args(argv[1:])

    src = (args.networks_dir / "networks").resolve()
    if not src.is_dir():
        print(f"no networks checkout at {src.parent}")
        return 1

    by_cat = collections.defaultdict(list)
    for d in sorted(p for p in src.iterdir() if p.is_dir()):
        ej = d / "entry.json"
        if not ej.exists():
            continue
        e = json.loads(ej.read_text(encoding="utf-8"))
        by_cat[e.get("category", "Other")].append((e.get("order", 999), d, e))

    unknown = set(by_cat) - set(CATEGORIES)
    if unknown:
        print(f"  ! no spotlight file defined for category/ies: {sorted(unknown)}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for cat, (slug, title, blurb) in CATEGORIES.items():
        items = sorted(by_cat.get(cat, []))
        if not items:
            continue
        path = OUT_DIR / f"{slug}.qmd"
        if path.exists() and not args.force:
            print(f"  {path.name}: exists, left alone (use --force)")
            continue
        kept = existing_thoughts(path)

        head = [
            "---",
            f'title: "{title}"',
            f'description: "{blurb} Each network as a live figure, with where it came '
            'from and what it may be used for."',
            "categories:",
            "  - Networks",
            "  - Spotlight",
            "date: 09/26/26",
            "---",
            "",
            "{{< include ../../assets/html/edgewise-embed.html >}}",
            "",
            blurb,
            "",
            "Every figure here is live: drag a node, hover for a name, and *Open with "
            "controls* gives you the same view in a full window with the colouring and "
            "layout options exposed. The data, and the script that rebuilds each one "
            "from its source, are in the "
            "[`networks`](https://github.com/maxjerdee/networks) repository.",
            "",
        ]
        body = []
        for _, d, e in items:
            sec = section(d, e)
            if d.name in kept:
                # Put the author's own prose back between the markers.
                sec = re.sub(
                    r"(<!-- THOUGHTS:%s --[^>]*-->\n).*?(\n<!-- /THOUGHTS:%s -->)" % (d.name, d.name),
                    lambda m: m.group(1) + kept[d.name] + m.group(2), sec, flags=re.S)
            body.append(sec)
        path.write_text("\n".join(head) + "\n" + "\n".join(body), encoding="utf-8")
        n_kept = sum(1 for _, d, _ in items if d.name in kept)
        print(f"  {path.name}: {len(items)} networks"
              + (f", {n_kept} thoughts block(s) preserved" if n_kept else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
