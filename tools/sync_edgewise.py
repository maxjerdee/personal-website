"""Vendor the built edgewise explorer into this site, served at /edgewise.

    python tools/sync_edgewise.py            # show what would change
    python tools/sync_edgewise.py --apply    # build and copy
    python tools/sync_edgewise.py --check    # exit 1 if the copy is stale (for CI)

WHY VENDOR IT. The explorer has its own repo and its own Pages deployment, but
maxjerdee.com/edgewise should be genuinely part of this site: one domain, no
iframe, no redirect, and a local preview that works with no network. So the
built app is copied in as a Quarto resource. The cost is a sync step when
edgewise changes, which --check turns into a build failure rather than a
silently stale copy -- the same arrangement as the networks data.

It works from a sub-path because edgewise's vite config sets `base: './'`, so
every asset reference is relative. Nothing here rewrites URLs.

THE BACK LINK. The vendored copy gets one small fixed link to the rest of the
site, injected here rather than added to edgewise. The explorer is standalone
and should stay that way in its own repo: this is a fact about being hosted
inside a personal site, not about the tool. Injecting at sync time also means
edgewise's own deployment is unaffected.

BUILT FROM A REF, NOT FROM A WORKING TREE. The build happens in a throwaway
`git worktree` at origin/main (or whatever --ref names), never in the edgewise
checkout. That checkout is shared with other sessions and is routinely dirty:
building there would bake whatever someone had in progress into a page
published under your name, and the result could not be traced to any commit.

That is not hypothetical. At the time of writing, edgewise's tree carries an
uncommitted web/vendor/directedstructure/dist/ds_core.mjs built from source
that exists only in somebody's working directory -- deliberately kept out of
the deploy. A working-tree build would have shipped it here regardless.

Building from the ref also means this copy matches what CI deployed, because CI
builds from the same committed tree.
"""
from __future__ import annotations

import argparse
import filecmp
import pathlib
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / "quarto_src" / "edgewise"
DEFAULT_SOURCE = ROOT.parent / "edgewise"

# A marker file recording which edgewise commit this copy was built from, so a
# stale vendored app can be identified without guessing from timestamps.
STAMP = "BUILT_FROM.txt"

BACK_LINK = """
<!-- Injected by personal-website/tools/sync_edgewise.py. Not part of edgewise:
     the explorer is standalone in its own repo, and this is only true of the
     copy hosted inside maxjerdee.com. -->
<style>
  #mj-back {
    position: fixed; left: 10px; bottom: 8px; z-index: 2147483000;
    font: 500 12px/1.4 Inter, system-ui, -apple-system, sans-serif;
    color: #64748b; text-decoration: none; padding: 4px 9px; border-radius: 6px;
    background: rgba(255,255,255,.82); border: 1px solid rgba(15,23,42,.10);
    backdrop-filter: blur(4px); transition: color .15s, border-color .15s;
  }
  #mj-back:hover { color: #0f172a; border-color: rgba(15,23,42,.28); }
  @media (prefers-color-scheme: dark) {
    #mj-back { color: #94a3b8; background: rgba(15,23,42,.72);
               border-color: rgba(148,163,184,.22); }
    #mj-back:hover { color: #e2e8f0; }
  }
  @media print { #mj-back { display: none; } }
</style>
<a id="mj-back" href="/" title="Back to maxjerdee.com">&#8592; Max Jerdee</a>
"""


def git(src: pathlib.Path, *args: str) -> str:
    return subprocess.run(["git", *args], cwd=src, capture_output=True,
                          text=True).stdout.strip()


def build(src: pathlib.Path) -> bool:
    print("  building edgewise (npm run build)")
    p = subprocess.run(["npm", "run", "build"], cwd=src / "web",
                       capture_output=True, text=True)
    if p.returncode != 0:
        print("  ! build failed:")
        for line in (p.stdout + p.stderr).splitlines()[-15:]:
            print("      " + line)
        return False
    return True


def stage(dist: pathlib.Path, stamp: str, into: pathlib.Path) -> None:
    """A copy of dist with the back link injected and the provenance recorded."""
    if into.exists():
        shutil.rmtree(into)
    shutil.copytree(dist, into)
    index = into / "index.html"
    html = index.read_text(encoding="utf-8")
    if "mj-back" not in html:
        # Before </body> so it cannot be overwritten by the app's own render.
        html = (html.replace("</body>", BACK_LINK + "</body>", 1)
                if "</body>" in html else html + BACK_LINK)
        index.write_text(html, encoding="utf-8")
    (into / STAMP).write_text(stamp + "\n", encoding="utf-8")


def differs(a: pathlib.Path, b: pathlib.Path) -> list[str]:
    """Paths that differ between two trees, '' if identical."""
    out = []
    if not b.exists():
        return ["(no vendored copy yet)"]
    a_files = {p.relative_to(a).as_posix() for p in a.rglob("*") if p.is_file()}
    b_files = {p.relative_to(b).as_posix() for p in b.rglob("*") if p.is_file()}
    out += [f"+ {n}" for n in sorted(a_files - b_files)]
    out += [f"- {n}" for n in sorted(b_files - a_files)]
    out += [f"~ {n}" for n in sorted(a_files & b_files)
            if not filecmp.cmp(a / n, b / n, shallow=False)]
    return out


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--check", action="store_true",
                    help="exit 1 if the vendored copy is not what a build produces")
    ap.add_argument("--ref", default="origin/main",
                    help="the edgewise commit to build (default: origin/main, what CI deploys)")
    ap.add_argument("--edgewise-dir", type=pathlib.Path, default=DEFAULT_SOURCE)
    args = ap.parse_args(argv[1:])

    src = args.edgewise_dir.resolve()
    if not (src / "web" / "package.json").exists():
        print(f"no edgewise checkout at {src}")
        return 1

    subprocess.run(["git", "fetch", "--quiet", "origin"], cwd=src)
    head = git(src, "rev-parse", "--short", args.ref)
    if not head:
        print(f"  ! {args.ref} does not resolve in {src}")
        return 1
    print(f"source: {src}  {args.ref} = {head}")

    # A throwaway checkout of that commit, so nothing in the shared working tree
    # can reach the build. node_modules is symlinked rather than reinstalled:
    # it is a build dependency, not a source, and installing it again would take
    # minutes to produce the same thing.
    tree = ROOT / ".edgewise-build"
    if tree.exists():
        subprocess.run(["git", "worktree", "remove", "--force", str(tree)], cwd=src,
                       capture_output=True)
        shutil.rmtree(tree, ignore_errors=True)
    r = subprocess.run(["git", "worktree", "add", "--detach", str(tree), head],
                       cwd=src, capture_output=True, text=True)
    if r.returncode != 0:
        print("  ! could not create a worktree:\n" + r.stdout + r.stderr)
        return 1
    try:
        mods = src / "web" / "node_modules"
        target = tree / "web" / "node_modules"
        if mods.exists() and not target.exists():
            target.symlink_to(mods, target_is_directory=True)
        if not build(tree):
            return 1
        dist = tree / "web" / "dist"
        if not (dist / "index.html").exists():
            print(f"  ! no {dist}/index.html after the build")
            return 1
        staged = ROOT / ".edgewise-staged"
        stamp = f"{args.ref} = {head}"
        stage(dist, stamp, staged)
    finally:
        subprocess.run(["git", "worktree", "remove", "--force", str(tree)], cwd=src,
                       capture_output=True)
        shutil.rmtree(tree, ignore_errors=True)

    diff = differs(staged, DEST)
    if not diff:
        shutil.rmtree(staged)
        print("\nalready in sync.")
        return 0
    for d in diff[:15]:
        print("  " + d)
    if len(diff) > 15:
        print(f"  ... and {len(diff) - 15} more")

    if args.check:
        shutil.rmtree(staged)
        print(f"\nOUT OF SYNC: {len(diff)} difference(s). Run with --apply.")
        return 1
    if not args.apply:
        shutil.rmtree(staged)
        print(f"\n{len(diff)} difference(s). Re-run with --apply.")
        return 0

    if DEST.exists():
        shutil.rmtree(DEST)
    shutil.move(str(staged), str(DEST))
    print(f"\nvendored {stamp} into {DEST.relative_to(ROOT)}")
    print("Quarto copies it through as a resource; served at /edgewise.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
