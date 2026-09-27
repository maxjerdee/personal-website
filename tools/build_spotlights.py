"""Scaffold the network spotlight notes from the networks repo's own records.

    python tools/build_spotlights.py                 # only what does not exist
    python tools/build_spotlights.py --force         # rewrite the FACTS, keep prose
    python tools/build_spotlights.py --networks-dir ../networks

One note per category, a section per network, each with an interactive embed and
the facts about that network: counts, what it is, how it was collected, its rights,
and where it came from. Those all come from the networks repo -- the GML's own
graph attributes and catalogue header -- so they cannot drift from the data the
way a hand-copied summary would.

THE SET IS THE PUBLISHED SET. These notes document exactly the networks in the
public repo, which is exactly what edgewise ships, so a source link from the
explorer always resolves. A network still being worked on lives in the private
workspace repo and has no section here until it graduates. That means a network
moving back to the workspace REMOVES its section -- see --check and the orphan
handling below, because losing prose that way would be silent otherwise.

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
import html
import json
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "quarto_src" / "notes" / "2025"
# Prose for a network that has left the published set. Kept out of the rendered
# site, but kept: a network moving back to the workspace is a normal event in
# this workflow, and it must not cost someone their writing.
ORPHAN_DIR = ROOT / "tools" / "orphaned_thoughts"

_entry_from_header = None       # set by main() from the networks repo's own parser

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


def load_gmlheader(src_repo: pathlib.Path):
    """The networks repo owns the header format; import its parser, don't copy it.

    A second implementation here would be a second thing to keep in step, and the
    one that silently disagrees is the one nobody notices.
    """
    tools = src_repo / "tools"
    if not (tools / "gmlheader.py").exists():
        raise SystemExit(f"no gmlheader.py in {tools} -- is --networks-dir right?")
    sys.path.insert(0, str(tools))
    from gmlheader import entry_from_header          # noqa: E402
    return entry_from_header


def load_entry(d: pathlib.Path) -> dict | None:
    """The catalogue entry, from the GML header (entry.json is gone)."""
    gml = d / f"{d.name}.gml"
    if not gml.exists():
        return None
    return _entry_from_header(gml)


def graph_attrs(p: pathlib.Path) -> dict[str, str]:
    """A network's provenance: the GML header's four short fields, plus the
    long-form licence and attribution from the folder's attribution.json.

    The paragraphs used to be in the header. They moved out so a data file
    carries only what has to travel with it -- which makes the spotlight the
    place the full text is actually read, so it has to be rendered here.
    """
    head = p.read_text(encoding="utf-8", errors="replace").split("node [", 1)[0]
    attrs = {k: v for k, v in re.findall(r'^\s*(\w+)\s+"((?:[^"\\]|\\.)*)"', head, re.M)}
    rec = p.parent / "attribution.json"
    if rec.exists():
        attrs.update(json.loads(rec.read_text(encoding="utf-8")))
    return attrs


def counts(p: pathlib.Path) -> tuple[int, int, bool]:
    t = p.read_text(encoding="utf-8", errors="replace")
    return (len(re.findall(r"\bnode\s*\[", t)), len(re.findall(r"\bedge\s*\[", t)),
            bool(re.search(r"^\s*directed 1", t, re.M)))


def unescape(s: str) -> str:
    """Undo GML's escaping, for text about to be rendered as prose.

    The networks repo keeps every published GML ASCII-only and entity-escaped,
    so a name with an accent, or an arrow, arrives here as `&#233;` or `&#62;`.
    This was a hand-written list of the two entities that happened to appear;
    html.unescape handles the whole set, which matters now that the escaping is
    systematic rather than incidental -- the next accented author name would
    otherwise have rendered as its own entity, in public, under their name.
    """
    return html.unescape(s).replace('\\"', '"')


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
    if a.get("author"):
        # `author` means the creator of the original data, never this repo.
        bits.append(unescape(a["author"]))
    # ...and compiledBy is who built this particular file from it, where that was
    # real work. Absent for a network transcribed as published -- and suppressed
    # when it is the same person as the author, which is the case for the networks
    # made here and would otherwise read "Max Jerdee, compiled by Max Jerdee".
    if a.get("compiledBy") and a.get("compiledBy") != a.get("author"):
        bits.append(f"compiled by {unescape(a['compiledBy'])}")
    if a.get("source"):
        bits.append(" ".join(f"[source]({u.strip()})" for u in a["source"].split(";")))
    bits.append(f"[data and build script](https://github.com/maxjerdee/networks/tree/main/networks/{stem})")
    L += ["*" + " · ".join(bits) + "*", ""]
    if a.get("license"):
        # The prose licence, not the SPDX id: a reader needs the terms, and for
        # several of these the true answer is a sentence, not an identifier.
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
    ap.add_argument("--publish", action="store_true",
                    help="drop `draft: true`, so the notes go public on the next render")
    ap.add_argument("--draft", action="store_true",
                    help="force `draft: true`, even on a note already published")
    ap.add_argument("--check", action="store_true",
                    help="verify the notes cover exactly the published networks; write nothing")
    args = ap.parse_args(argv[1:])

    src_repo = args.networks_dir.resolve()
    src = (src_repo / "networks").resolve()
    if not src.is_dir():
        print(f"no networks checkout at {src_repo}")
        return 1

    global _entry_from_header
    _entry_from_header = load_gmlheader(src_repo)

    by_cat = collections.defaultdict(list)
    for d in sorted(p for p in src.iterdir() if p.is_dir()):
        e = load_entry(d)
        if e is None:
            continue
        by_cat[e.get("category", "Other")].append((e.get("order", 999), d, e))

    published = {d.name for items in by_cat.values() for _, d, _ in items}
    documented = set()
    for slug, _, _ in CATEGORIES.values():
        documented |= set(existing_thoughts(OUT_DIR / f"{slug}.qmd"))

    if args.check:
        # The correspondence the whole arrangement rests on: the notes document
        # exactly what is published, so a source link from the explorer always
        # resolves and nothing published is undocumented.
        missing = sorted(published - documented)
        extra = sorted(documented - published)
        for n in missing:
            print(f"  UNDOCUMENTED {n}: published, but no spotlight section")
        for n in extra:
            print(f"  ORPHANED {n}: has a spotlight section but is not published "
                  "(moved back to the workspace?)")
        if missing or extra:
            print(f"\n{len(missing) + len(extra)} mismatch(es). "
                  "Run without --check to regenerate.")
            return 1
        print(f"{len(published)} published networks, all documented, nothing extra.")
        return 0

    unknown = set(by_cat) - set(CATEGORIES)
    if unknown:
        print(f"  ! no spotlight file defined for category/ies: {sorted(unknown)}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    orphaned: list[str] = []
    for cat, (slug, title, blurb) in CATEGORIES.items():
        items = sorted(by_cat.get(cat, []))
        path = OUT_DIR / f"{slug}.qmd"
        if not items:
            # Every network in this category has left the published set. Skipping
            # would leave the old note in place, still documenting networks that
            # are no longer published and still linking to folders that 404 --
            # which is exactly the drift --check exists to catch, so remove it.
            if path.exists():
                for slug_, prose in existing_thoughts(path).items():
                    if prose.strip() and prose.strip() != "*(thoughts to come)*":
                        ORPHAN_DIR.mkdir(parents=True, exist_ok=True)
                        out = ORPHAN_DIR / f"{slug_}.md"
                        out.write_text(
                            f"# {slug_}\n\nSaved from {path.name} when its whole category left "
                            f"the published set.\n\n" + prose.strip() + "\n", encoding="utf-8")
                        orphaned.append(f"{slug_} -> {out.relative_to(ROOT)}")
                path.unlink()
                print(f"  {path.name}: removed, no published networks in this category")
            continue
        if path.exists() and not args.force:
            print(f"  {path.name}: exists, left alone (use --force)")
            continue
        kept = existing_thoughts(path)
        # Per file, and never inferred from a sibling: with neither flag, a note
        # keeps the draft state it already has, and a new one starts as a draft.
        if args.publish:
            is_draft = False
        elif args.draft or not path.exists():
            is_draft = True
        else:
            is_draft = re.search(r"^draft:\s*true\s*$",
                                 path.read_text(encoding="utf-8"), re.M) is not None
        # Prose for a network that is no longer published would vanish with its
        # section. Networks move back to the workspace by design here, so this is
        # a normal event, not an error -- but a silent one would cost writing.
        for slug, prose in kept.items():
            if slug in published or not prose.strip() or prose.strip() == "*(thoughts to come)*":
                continue
            ORPHAN_DIR.mkdir(parents=True, exist_ok=True)
            out = ORPHAN_DIR / f"{slug}.md"
            out.write_text(
                f"# {slug}\n\nSaved from {path.name} when {slug} left the published set.\n"
                f"Paste it back into its section if the network is published again.\n\n"
                + prose.strip() + "\n", encoding="utf-8")
            orphaned.append(f"{slug} -> {out.relative_to(ROOT)}")

        head = [
            "---",
            f'title: "{title}"',
            f'description: "{blurb} Each network as a live figure, with where it came '
            'from and what it may be used for."',
            "categories:",
            "  - Networks",
            "  - Spotlight",
            "date: 09/26/26",
        ] + ([
            # Renders as an empty stub and appears in no listing or search, so
            # the note can sit in the repo while the prose is still being
            # written. `QUARTO_PROFILE=drafting quarto preview` shows it;
            # regenerate with --publish when it is ready.
            "draft: true",
        ] if is_draft else []) + [
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
    if orphaned:
        print(f"\n{len(orphaned)} network(s) left the published set; their prose was saved, "
              "not deleted:")
        for o in orphaned:
            print("  " + o)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
