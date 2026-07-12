"""
run_pipeline.py — Single entry point: fetch → model → pairwise matrix → write JSON.

The bracket UI derives all advancement probabilities analytically from the
pairwise KO matrix, so Monte Carlo simulation is not needed here.

Usage:
    python pipeline/run_pipeline.py               # full pipeline (fetch + Stan + pairwise)
    python pipeline/run_pipeline.py --no-refit    # skip Stan, reuse cached posterior
    python pipeline/run_pipeline.py --force-fetch # ignore CSV cache, re-download

New results are auto-detected from the martj42 CSV (no manual bracket editing needed).
Manual `winner` entries in WC_2026_BRACKET still work as overrides.

Outputs (relative to the demo folder, one level above pipeline/):
    predictions.json         — consumed by the bracket UI
    predictions_history.json — snapshot archive for retrospective
"""

from __future__ import annotations

import argparse
import json
import pickle
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from fetch import (
    display_name, team_flag, get_matches, ISO_CODES,
    download_results, get_shootout_winners_map,
    resolve_bracket, auto_fill_winners,
)
from simulate import WC_2026_BRACKET

PIPELINE_DIR    = Path(__file__).parent          # pipeline/
DEMO_DIR        = PIPELINE_DIR.parent            # world_cup/ (demo root, serves the UI)
CACHE_DIR       = PIPELINE_DIR / "data"          # pipeline/data/ — gitignored cache
POSTERIOR_CACHE         = CACHE_DIR / "posterior_cache.pkl"
POSTERIOR_MATCHES_CACHE = CACHE_DIR / "posterior_pele_cache.pkl"  # free-PELE ≈ match-only

# Outputs written into the demo root so the UI can load them directly
OUTPUT_DIR              = DEMO_DIR
EXTRA_OUTPUT_PATHS:  list[Path] = []
EXTRA_HISTORY_PATHS: list[Path] = []

# ── Argument parsing ──────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--no-refit",    action="store_true",
                   help="Skip Stan fitting, reuse cached posterior samples")
    p.add_argument("--force-fetch", action="store_true",
                   help="Ignore CSV cache and re-download from source")
    p.add_argument("--before-date", default=None, metavar="YYYY-MM-DD",
                   help="Exclude training matches on or after this date (for historical snapshots)")
    p.add_argument("--snapshot-label", default=None,
                   help="If set, write only pairwise matrices into this snapshot label in predictions_history.json")
    p.add_argument("--ds-samples", default=None, metavar="PATH",
                   help="Path to DS score samples CSV (default: output/wc2026_ds_score_samples.csv)")
    return p.parse_args()


# ── Pipeline ──────────────────────────────────────────────────────────────────

def run(args) -> None:
    import copy
    OUTPUT_DIR.mkdir(exist_ok=True)

    # 1. Fetch match data (for Stan training) + raw results (for bracket auto-fill)
    matches, _ = get_matches(force_download=args.force_fetch, before_date=args.before_date)
    raw_results = download_results(force=args.force_fetch)
    shootout_map = get_shootout_winners_map(force_download=args.force_fetch)

    # 2. Auto-fill bracket winners from martj42 data
    bracket = resolve_bracket(copy.deepcopy(WC_2026_BRACKET))
    pre_fill_bracket = copy.deepcopy(bracket)  # save state before auto-fill
    bracket, n_new = auto_fill_winners(bracket, raw_results, shootout_map)
    bracket = resolve_bracket(bracket)          # propagate newly found winners
    if n_new:
        print(f"[pipeline] Auto-filled {n_new} new match result(s) from martj42.")

    # 3. Fit Davidson model (or load cached posterior)
    if args.no_refit and POSTERIOR_CACHE.exists():
        print("[pipeline] Loading cached posterior from", POSTERIOR_CACHE)
        with open(POSTERIOR_CACHE, "rb") as f:
            posterior = pickle.load(f)
    else:
        from stan_model import run_davidson
        posterior = run_davidson(matches)
        CACHE_DIR.mkdir(exist_ok=True)
        with open(POSTERIOR_CACHE, "wb") as f:
            pickle.dump(posterior, f)
        print(f"[pipeline] Posterior cached to {POSTERIOR_CACHE}")

    # 4. Load secondary (matches-only) posterior if available
    posterior_matches = None
    if POSTERIOR_MATCHES_CACHE.exists():
        with open(POSTERIOR_MATCHES_CACHE, "rb") as f:
            posterior_matches = pickle.load(f)
        print(f"[pipeline] Loaded matches posterior from {POSTERIOR_MATCHES_CACHE}")

    # 5. Build pairwise KO matrices and output JSON (using auto-filled bracket)
    ds_samples_path = Path(args.ds_samples) if args.ds_samples else None
    out = _build_json(posterior, posterior_matches, bracket=bracket, ds_samples_path=ds_samples_path)

    history_path = OUTPUT_DIR / "predictions_history.json"
    history = json.loads(history_path.read_text()) if history_path.exists() else {"snapshots": []}

    # 5b. Snapshot-update mode: only patch pairwise matrices for a named snapshot.
    if args.snapshot_label:
        target = args.snapshot_label
        idx = next((i for i, s in enumerate(history["snapshots"]) if s["label"] == target), None)
        if idx is None:
            print(f"[pipeline] ERROR: no snapshot with label {target!r}")
            return
        snap = history["snapshots"][idx]
        snap["pairwise_ko"] = out.get("pairwise_ko", {})
        for key in ("pairwise_ko_pele", "pairwise_ko_ds", "pairwise_ko_ds_pele",
                    "pairwise_ko_matches", "team_score_stats"):
            if key in out:
                snap[key] = out[key]
        snap["snapshot_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        print(f"[pipeline] Updated pairwise matrices for snapshot {target!r}")
        hist_payload = json.dumps(history, indent=2, ensure_ascii=False)
        for p in [history_path] + EXTRA_HISTORY_PATHS:
            p.write_text(hist_payload, encoding="utf-8")
            print(f"[pipeline] History written → {p}")
        print("[pipeline] Done.")
        return

    # 6. Snapshot archive: save a snapshot whenever the round label changes.
    #    This fires on every pipeline run (not just when n_new > 0), so that
    #    manually pre-set winners still generate historical snapshots.
    label = _snapshot_label(bracket)
    last_label = history["snapshots"][-1]["label"] if history["snapshots"] else None
    if label != last_label:
        snap = {
            "label":      label,
            "snapshot_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "pairwise_ko": out.get("pairwise_ko", {}),
            "bracket":    _build_bracket_json(pre_fill_bracket),
        }
        history["snapshots"].append(snap)
        print(f"[pipeline] Snapshot saved: {label!r}")
    else:
        print(f"[pipeline] Snapshot unchanged: {label!r}")

    # 7. Write predictions.json
    payload = json.dumps(out, indent=2, ensure_ascii=False)
    for p in [OUTPUT_DIR / "predictions.json"] + EXTRA_OUTPUT_PATHS:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(payload, encoding="utf-8")
        print(f"[pipeline] Written → {p}")

    # 8. Write predictions_history.json
    hist_payload = json.dumps(history, indent=2, ensure_ascii=False)
    for p in [history_path] + EXTRA_HISTORY_PATHS:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(hist_payload, encoding="utf-8")
        print(f"[pipeline] History written → {p}")

    print("[pipeline] Done.")


def _snapshot_label(bracket: dict) -> str:
    """Return a label describing what's NEXT (first round with any unfilled result)."""
    labels = {"R16": "Round of 16", "QF": "Quarter-finals", "SF": "Semi-finals", "F": "Final"}
    for round_key in ["R16", "QF", "SF", "F"]:
        if any(not f.get("winner") for f in bracket.get(round_key, [])):
            return f"Before {labels.get(round_key, round_key)}"
    return "Complete"


def _build_json(
    posterior: dict,
    posterior_matches: dict | None = None,
    bracket: dict | None = None,
    ds_samples_path: "Path | None" = None,
) -> dict:
    if bracket is None:
        bracket = WC_2026_BRACKET
    s_samples  = posterior["s_samples"]   # (total_samples, N_stan_teams)
    nu_samples = posterior["nu_samples"]
    stan_teams = posterior["teams"]       # normalised names
    stan_index = {t: i for i, t in enumerate(stan_teams)}

    # Collect all 32 R32 teams (includes eliminated teams for full bracket display)
    all_teams_norm: list[str] = []
    for m in bracket.get("R32", []):
        for key in ("team_a", "team_b"):
            t = m.get(key)
            if t and t not in all_teams_norm:
                all_teams_norm.append(t)

    # Build teams dict: display_name → {flag, iso}
    teams_out: dict[str, dict] = {}
    for t_norm in all_teams_norm:
        name = display_name(t_norm)
        teams_out[name] = {
            "flag": team_flag(t_norm),
            "iso":  ISO_CODES.get(t_norm, ""),
        }

    # Build pairwise KO matrices for all 32 teams (display names as keys)
    pairwise_pele = _build_pairwise_matrix(
        all_teams_norm, s_samples, nu_samples, stan_index
    )
    out: dict = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "tournament":   "FIFA World Cup 2026",
        "rounds":       ["R32", "R16", "QF", "SF", "F", "W"],
        "round_labels": {
            "R32": "Round of 32",
            "R16": "Round of 16",
            "QF":  "Quarter-finals",
            "SF":  "Semi-finals",
            "F":   "Final",
            "W":   "Champion",
        },
        "teams":            teams_out,
        "pairwise_ko_pele": pairwise_pele,
        "pairwise_ko":      pairwise_pele,  # default
        "bracket":          _build_bracket_json(bracket),
    }
    if posterior_matches is not None:
        sm = posterior_matches["s_samples"]
        nm = posterior_matches["nu_samples"]
        idx_m = {t: i for i, t in enumerate(posterior_matches["teams"])}
        out["pairwise_ko_matches"] = _build_pairwise_matrix(
            all_teams_norm, sm, nm, idx_m
        )
        print("[pipeline] Both pairwise matrices built.")

    # DS score samples (community-aware Bradley-Terry model)
    if ds_samples_path is None:
        ds_samples_path = CACHE_DIR / "wc2026_ds_score_samples.csv"
    if ds_samples_path.exists():
        out.update(_build_ds_matrices(all_teams_norm, ds_samples_path))
        print("[pipeline] DS pairwise matrices built.")

    return out


def _build_ds_matrices(
    teams_norm: list[str],
    csv_path: "Path",
) -> dict:
    """
    Build pairwise_ko_ds (DS community model) and pairwise_ko_ds_pele
    (DS scores shifted 50% toward PELE ratings) from posterior sample CSV.
    """
    import numpy as np
    import pandas as pd
    from fetch import display_name as dn, ISO_CODES

    display_teams = [display_name(t) for t in teams_norm]

    df = pd.read_csv(csv_path)
    s = df[display_teams].values  # (n_samples, 16)

    # Load PELE ratings
    rankings_path = csv_path.parent / "rankings_comparison.csv"
    df_r = pd.read_csv(rankings_path)
    df_r["team"] = df_r["team"].replace({"United States": "USA", "Bosnia and Herzegovina": "Bosnia & Herz.", "Ivory Coast": "Ivory Coast", "DR Congo": "DR Congo", "Cape Verde": "Cape Verde"})
    df_r = df_r.set_index("team")
    mean_pele = float(df_r["pele_rating"].mean())
    pele = np.array([
        float(df_r.loc[t, "pele_rating"]) if t in df_r.index else mean_pele
        for t in display_teams
    ], dtype=float)

    mu_ds = s.mean(axis=0)
    pele_norm = (pele - pele.mean()) / pele.std() * mu_ds.std() + mu_ds.mean()
    s_shifted = s + 0.5 * (pele_norm - mu_ds)[np.newaxis, :]

    def pairwise(scores):
        out = {}
        for i, a in enumerate(display_teams):
            out[a] = {}
            for j, b in enumerate(display_teams):
                if i == j:
                    continue
                p = float(np.mean(1 / (1 + np.exp(scores[:, j] - scores[:, i]))))
                out[a][b] = round(p, 4)
        return out

    mat_ds = pairwise(s)
    mat_ds_pele = pairwise(s_shifted)

    # Score statistics for strength-distribution overlay in UI
    team_score_stats = {}
    for i, team in enumerate(display_teams):
        team_score_stats[team] = {
            "mean":     round(float(s_shifted[:, i].mean()), 4),
            "std":      round(float(s_shifted[:, i].std()),  4),
            "mean_raw": round(float(s[:, i].mean()), 4),
            "std_raw":  round(float(s[:, i].std()),  4),
        }

    return {
        "pairwise_ko_ds":      mat_ds,
        "pairwise_ko_ds_pele": mat_ds_pele,
        "pairwise_ko":         mat_ds_pele,  # default shown in UI
        "team_score_stats":    team_score_stats,
    }


def _build_pairwise_matrix(
    teams_norm: list[str],
    s_samples: "np.ndarray",
    nu_samples: "np.ndarray",
    stan_index: dict[str, int],
) -> dict[str, dict[str, float]]:
    """Posterior-averaged pairwise KO win probabilities for all bracket team pairs."""
    from stan_model import match_probs_ko

    matrix: dict[str, dict[str, float]] = {}
    for ta in teams_norm:
        name_a = display_name(ta)
        matrix[name_a] = {}
        ia = stan_index.get(ta)
        for tb in teams_norm:
            if ta == tb:
                continue
            name_b = display_name(tb)
            ib = stan_index.get(tb)
            if ia is None or ib is None:
                matrix[name_a][name_b] = 0.5
                continue
            p_a, _ = match_probs_ko(s_samples[:, ia], s_samples[:, ib], nu_samples)
            matrix[name_a][name_b] = round(float(p_a), 4)
    return matrix


def _build_bracket_json(bracket: dict) -> dict:
    """Convert WC_2026_BRACKET to JSON, normalised names → display names."""
    out: dict[str, list] = {}
    for round_key in ["R32", "R16", "QF", "SF", "F"]:
        fixtures = []
        for m in bracket.get(round_key, []):
            ta = m.get("team_a")
            tb = m.get("team_b")
            w  = m.get("winner")
            entry: dict = {
                "id":     m["id"],
                "team_a": display_name(ta) if ta else None,
                "team_b": display_name(tb) if tb else None,
                "winner": display_name(w)  if w  else None,
            }
            if m.get("date"):
                entry["date"] = m["date"]
            fixtures.append(entry)
        out[round_key] = fixtures
    return out


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    args = parse_args()
    run(args)
