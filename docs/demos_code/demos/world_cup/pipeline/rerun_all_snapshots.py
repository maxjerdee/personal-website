"""
rerun_all_snapshots.py — Rerun DS and Stan models at each forecast level
with correct training data cutoffs, then update predictions_history.json.

For each snapshot:
  1. Fetch competitive match data filtered to the cutoff date
  2. Run DS model (grouped hierarchy / coupled) on aggregated win-count graph
     (WC teams only, draws excluded — matching gml_export.py in ranking_applications)
  3. Run Stan Davidson no-PELE (hierarchy only / independent) on filtered matches
  4. Update the snapshot's pairwise matrices in predictions_history.json

Run from the world_cup demo directory:
    python pipeline/rerun_all_snapshots.py [--dry-run] [--only LABEL]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).parent))

PIPELINE_DIR = Path(__file__).parent
DEMO_DIR     = PIPELINE_DIR.parent
CACHE_DIR    = PIPELINE_DIR / "data"
HISTORY_PATH = DEMO_DIR / "predictions_history.json"

# (snapshot label, before_date) — before_date excludes matches ON OR AFTER this date
SNAPSHOT_CONFIGS = [
    ("Before Round of 32",    "2026-06-28"),   # first R32 match
    ("Before Round of 16",    "2026-07-04"),   # first R16 match
    ("Before Quarter-finals", "2026-07-09"),   # first QF match
    ("Before Semi-finals",    "2026-07-14"),   # first SF match
    ("Finals",                "2026-07-19"),   # the Final (include SF results)
]


# ── DS model ──────────────────────────────────────────────────────────────────

def _run_ds(matches: list[dict], out_csv: Path) -> None:
    """Run DS community model matching the reference ranking_applications approach.

    Builds a MultiDiGraph with one edge per match:
      - win  → dominant edge (winner → loser)
      - draw/shootout → neutral edge (p1 → p2, treated symmetrically by the model)
    Uses bradley_terry_ties so draws contribute to the likelihood.
    All teams included (same as Stan) for community structure regularization.
    """
    import networkx as nx
    import directedstructure as ds
    from fetch import WC_2026, display_name

    wc_norm = {t.replace(" ", "_") for t in WC_2026}

    G = nx.MultiDiGraph()
    for m in matches:
        p1, p2 = m["p1"], m["p2"]
        for n in (p1, p2):
            if n not in G:
                raw = n.replace("_", " ")
                G.add_node(n, in_wc2026=int(raw in WC_2026))
        if m.get("tie") or (not m["win1"] and not m["win2"]):
            G.add_edge(p1, p2, type="neutral")
        elif m["win1"]:
            G.add_edge(p1, p2, type="dominant")
        else:
            G.add_edge(p2, p1, type="dominant")

    print(f"  [ds] Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges "
          f"({sum(1 for _,_,d in G.edges(data=True) if d['type']=='dominant')} dominant, "
          f"{sum(1 for _,_,d in G.edges(data=True) if d['type']=='neutral')} neutral)")

    config = ds.Config(hierarchy_model="bradley_terry_ties")
    result = ds.fit(
        config, G,
        num_chains=4,
        samples_per_chain=10000,
        burn_sweeps=1000,
        seed=42,
        timeout=7200.0,
    )
    print(f"  [ds] Fit complete. {result}")

    node_order = result._node_order
    raw = result.samples_df()
    score_cols = [f"{node}_score" for node in node_order if f"{node}_score" in raw.columns]
    score_df = raw[score_cols].copy()
    score_df = score_df.rename(columns={f"{n}_score": n for n in node_order})
    disp_rename = {n: display_name(n) for n in node_order if display_name(n) != n}
    if disp_rename:
        score_df = score_df.rename(columns=disp_rename)
    score_df.to_csv(out_csv, index=False)
    print(f"  [ds] Score samples written → {out_csv}  ({len(score_df)} samples × {len(score_cols)} teams)")


# ── Stan hierarchy-only model ─────────────────────────────────────────────────

def _run_stan_hierarchy_only(matches: list[dict]) -> dict:
    """Run Davidson model WITHOUT PELE prior (hierarchy only / independent)."""
    from stan_model import run_davidson
    return run_davidson(matches, num_chains=4, num_samples=500)


# ── DS pairwise matrix builder ────────────────────────────────────────────────

def _build_ds_pairwise(display_teams: list[str], csv_path: Path) -> dict[str, dict[str, float]]:
    """Build pairwise_ko_ds from DS score samples CSV."""
    import numpy as np
    import pandas as pd

    df = pd.read_csv(csv_path)
    # Columns are team names; select only the WC teams we need
    available = [t for t in display_teams if t in df.columns]
    if len(available) < len(display_teams):
        missing = set(display_teams) - set(available)
        print(f"  [ds] Warning: {len(missing)} teams missing from DS scores: {missing}")
    s = df[available].values  # (n_samples, n_teams)

    def pairwise(scores, teams):
        out = {}
        for i, a in enumerate(teams):
            out[a] = {}
            for j, b in enumerate(teams):
                if i == j:
                    continue
                p = float(np.mean(1 / (1 + np.exp(scores[:, j] - scores[:, i]))))
                out[a][b] = round(p, 4)
        return out

    return pairwise(s, available)


# ── Stan pairwise matrix builder ──────────────────────────────────────────────

def _build_stan_pairwise(
    display_teams: list[str],
    posterior: dict,
) -> dict[str, dict[str, float]]:
    from fetch import display_name
    from stan_model import match_probs_ko

    s_samples  = posterior["s_samples"]
    nu_samples = posterior["nu_samples"]
    stan_teams = posterior["teams"]
    stan_index = {t: i for i, t in enumerate(stan_teams)}

    # Normalise display names to Stan names
    def _to_norm(display: str) -> str | None:
        # Try direct match, then reverse-lookup through display_name
        if display in stan_index:
            return display
        for t in stan_teams:
            if display_name(t) == display:
                return t
        return None

    matrix: dict[str, dict[str, float]] = {}
    for a in display_teams:
        na = _to_norm(a)
        matrix[a] = {}
        for b in display_teams:
            if a == b:
                continue
            nb = _to_norm(b)
            ia = stan_index.get(na) if na else None
            ib = stan_index.get(nb) if nb else None
            if ia is None or ib is None:
                matrix[a][b] = 0.5
                continue
            p_a, _ = match_probs_ko(s_samples[:, ia], s_samples[:, ib], nu_samples)
            matrix[a][b] = round(float(p_a), 4)
    return matrix


# ── Per-snapshot pipeline ─────────────────────────────────────────────────────

def rerun_snapshot(label: str, before_date: str, dry_run: bool = False) -> None:
    print(f"\n{'='*60}")
    print(f"Snapshot: {label!r}  (before {before_date})")
    print('='*60)

    history = json.loads(HISTORY_PATH.read_text())
    idx = next((i for i, s in enumerate(history["snapshots"]) if s["label"] == label), None)
    if idx is None:
        print(f"  ERROR: snapshot {label!r} not found in history. Skipping.")
        return

    snap = history["snapshots"][idx]

    # 1. Get 32 WC teams from live predictions.json
    live = json.loads((DEMO_DIR / "predictions.json").read_text())
    display_teams = list(live.get("teams", {}).keys())
    print(f"  WC teams: {len(display_teams)}")

    if dry_run:
        print("  [dry-run] Would run DS + Stan models. Skipping.")
        return

    # 2. Fetch matches filtered to cutoff
    from fetch import get_matches
    print(f"  Fetching matches before {before_date}...")
    matches, _ = get_matches(force_download=False, before_date=before_date)
    print(f"  {len(matches)} matches in training window")

    # 3. Run DS model (aggregated win-count graph, WC teams only)
    ds_csv = CACHE_DIR / f"ds_scores_{label.replace(' ', '_').replace('/', '_')}.csv"
    _run_ds(matches, ds_csv)

    # 4. Run Stan hierarchy-only model (all teams for full regularization)
    print(f"  [stan] {len(matches)} matches for Stan fit")
    print("  [stan] Fitting hierarchy-only Davidson model...")
    posterior_hier = _run_stan_hierarchy_only(matches)

    # 5. Build pairwise matrices
    print("  Building pairwise matrices...")
    pko_ds      = _build_ds_pairwise(display_teams, ds_csv)
    pko_matches = _build_stan_pairwise(display_teams, posterior_hier)

    # 6. Update snapshot
    snap["pairwise_ko_ds"]      = pko_ds
    snap["pairwise_ko_matches"] = pko_matches
    snap["snapshot_at"]         = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Write updated history
    HISTORY_PATH.write_text(json.dumps(history, indent=2, ensure_ascii=False))
    print(f"  Updated snapshot {label!r} in {HISTORY_PATH}")


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--dry-run", action="store_true", help="Show what would run, don't execute")
    p.add_argument("--only", default=None, metavar="LABEL",
                   help="Only rerun this snapshot label (partial match OK)")
    args = p.parse_args()

    for label, before_date in SNAPSHOT_CONFIGS:
        if args.only and args.only.lower() not in label.lower():
            continue
        rerun_snapshot(label, before_date, dry_run=args.dry_run)

    # Sync to docs/
    docs_history = Path("/mnt/c/Users/maxim/Documents/GitHub/GitHub/personal-website/docs/demos_code/demos/world_cup/predictions_history.json")
    if not args.dry_run and docs_history.exists():
        docs_history.write_text(HISTORY_PATH.read_text())
        print(f"\nSynced predictions_history.json → {docs_history}")

    print("\nDone.")


if __name__ == "__main__":
    main()
