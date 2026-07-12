"""
simulate.py — Monte Carlo bracket simulation for WC 2026.

Given posterior samples from the Davidson model, simulates the remaining
tournament bracket N_SIMS times and tallies advancement probabilities.

Generic: works for any single-elimination bracket whose structure is passed in.
The bracket is defined as an ordered list of fixtures per round, where each
fixture references either known team names or 'TBD:<match_id>' placeholders
whose winners are resolved during simulation.
"""

from __future__ import annotations

import numpy as np

N_SIMS = 100_000


# ── Current bracket state (WC 2026, as of 2026-07-03) ────────────────────────
# Update `winner` fields as results come in.
# TBD teams: winner resolved by simulation.
#
# Convention for fixtures:
#   team_a, team_b: team name (normalised, underscores) or None (TBD)
#   winner:         team name if match complete, else None

WC_2026_BRACKET = {
    # R32 ordered for correct bracket tree structure:
    # Adjacent pairs (0,1), (2,3), (4,5), (6,7) feed into the same R16 match.
    # Left side top→bottom: feeds R16 M89, M90, M93, M94
    # Right side top→bottom: feeds R16 M91, M92, M95, M96
    "R32": [
        # Left — feeds M89 (r16_0: Paraguay vs France)
        {"id": "r32_2",  "team_a": "Germany",       "team_b": "Paraguay",                "winner": "Paraguay"},     # M74
        {"id": "r32_5",  "team_a": "France",         "team_b": "Sweden",                  "winner": "France"},       # M77
        # Left — feeds M90 (r16_1: Canada vs Morocco)
        {"id": "r32_0",  "team_a": "South_Africa",   "team_b": "Canada",                  "winner": "Canada"},       # M73
        {"id": "r32_3",  "team_a": "Netherlands",    "team_b": "Morocco",                 "winner": "Morocco"},      # M75
        # Left — feeds M93 (r16_2: Portugal vs Spain)
        {"id": "r32_11", "team_a": "Portugal",       "team_b": "Croatia",                 "winner": "Portugal"},     # M83
        {"id": "r32_10", "team_a": "Spain",          "team_b": "Austria",                 "winner": "Spain"},        # M84
        # Left — feeds M94 (r16_3: USA vs Belgium)
        {"id": "r32_9",  "team_a": "United_States",  "team_b": "Bosnia_and_Herzegovina",  "winner": "United_States"},# M81
        {"id": "r32_8",  "team_a": "Belgium",        "team_b": "Senegal",                 "winner": "Belgium"},      # M82
        # Right — feeds M91 (r16_4: Brazil vs Norway)
        {"id": "r32_1",  "team_a": "Brazil",         "team_b": "Japan",                   "winner": "Brazil"},       # M76
        {"id": "r32_4",  "team_a": "Ivory_Coast",    "team_b": "Norway",                  "winner": "Norway"},       # M78
        # Right — feeds M92 (r16_5: Mexico vs England)
        {"id": "r32_6",  "team_a": "Mexico",         "team_b": "Ecuador",                 "winner": "Mexico"},       # M79
        {"id": "r32_7",  "team_a": "England",        "team_b": "DR_Congo",                "winner": "England"},      # M80
        # Right — feeds M95 (r16_6: Argentina vs Egypt)
        {"id": "r32_14", "team_a": "Argentina",      "team_b": "Cape_Verde",              "winner": "Argentina"},    # M86
        {"id": "r32_13", "team_a": "Australia",      "team_b": "Egypt",                   "winner": "Egypt"},        # M88
        # Right — feeds M96 (r16_7: Switzerland vs Colombia)
        {"id": "r32_12", "team_a": "Switzerland",    "team_b": "Algeria",                 "winner": "Switzerland"},  # M85
        {"id": "r32_15", "team_a": "Colombia",       "team_b": "Ghana",                   "winner": "Colombia"},     # M87
    ],
    # R16 fixtures — ordered to match official bracket layout:
    #   Left side:  [0] M89 PAR/FRA, [1] M90 CAN/MOR → QF M97
    #               [2] M93 POR/ESP, [3] M94 USA/BEL  → QF M98  → SF1
    #   Right side: [4] M91 BRA/NOR, [5] M92 MEX/ENG  → QF M99
    #               [6] M95 ARG/EGY, [7] M96 SUI/COL  → QF M100 → SF2
    "R16": [
        {"id": "r16_0", "sources": ["r32_2",  "r32_5"],  "team_a": "Paraguay",      "team_b": "France",         "winner": "France",   "date": "2026-07-04"},  # M89
        {"id": "r16_1", "sources": ["r32_0",  "r32_3"],  "team_a": "Canada",        "team_b": "Morocco",        "winner": "Morocco",  "date": "2026-07-04"},  # M90
        {"id": "r16_2", "sources": ["r32_11", "r32_10"], "team_a": "Portugal",      "team_b": "Spain",          "winner": "Spain",    "date": "2026-07-06"},  # M93
        {"id": "r16_3", "sources": ["r32_9",  "r32_8"],  "team_a": "United_States", "team_b": "Belgium",        "winner": "Belgium",  "date": "2026-07-06"},  # M94
        {"id": "r16_4", "sources": ["r32_1",  "r32_4"],  "team_a": "Brazil",        "team_b": "Norway",         "winner": "Norway",   "date": "2026-07-05"},  # M91
        {"id": "r16_5", "sources": ["r32_6",  "r32_7"],  "team_a": "Mexico",        "team_b": "England",        "winner": "England",  "date": "2026-07-05"},  # M92
        {"id": "r16_6", "sources": ["r32_14", "r32_13"], "team_a": "Argentina",     "team_b": "Egypt",          "winner": "Argentina",    "date": "2026-07-07"},  # M95
        {"id": "r16_7", "sources": ["r32_12", "r32_15"], "team_a": "Switzerland",   "team_b": "Colombia",       "winner": "Switzerland",  "date": "2026-07-07"},  # M96
    ],
    "QF": [
        {"id": "qf_0", "sources": ["r16_0", "r16_1"], "team_a": "France",  "team_b": "Morocco", "winner": "France",  "date": "2026-07-09"},  # M97 left-top
        {"id": "qf_1", "sources": ["r16_2", "r16_3"], "team_a": "Spain",   "team_b": "Belgium", "winner": "Spain",   "date": "2026-07-10"},  # M98 left-bottom
        {"id": "qf_2", "sources": ["r16_4", "r16_5"], "team_a": None, "team_b": None, "winner": None, "date": "2026-07-11"},  # M99 right-top
        {"id": "qf_3", "sources": ["r16_6", "r16_7"], "team_a": None, "team_b": None, "winner": None, "date": "2026-07-11"},  # M100 right-bottom
    ],
    "SF": [
        {"id": "sf_0", "sources": ["qf_0", "qf_1"], "team_a": None, "team_b": None, "winner": None, "date": "2026-07-14"},  # SF1 (left)
        {"id": "sf_1", "sources": ["qf_2", "qf_3"], "team_a": None, "team_b": None, "winner": None, "date": "2026-07-15"},  # SF2 (right)
    ],
    "F": [
        {"id": "f_0", "sources": ["sf_0", "sf_1"], "team_a": None, "team_b": None, "winner": None, "date": "2026-07-19"},
    ],
}

ROUND_ORDER = ["R32", "R16", "QF", "SF", "F"]


# ── Simulation ────────────────────────────────────────────────────────────────

def simulate_tournament(
    bracket: dict,
    s_samples: np.ndarray,    # shape (total_samples, N)
    nu_samples: np.ndarray,   # shape (total_samples,)
    team_index: dict[str, int],  # team name → 0-based index into s_samples cols
    n_sims: int = N_SIMS,
) -> dict[str, dict[str, float]]:
    """
    Monte Carlo tournament simulation.

    Returns:
      { team_name: { "R16": p, "QF": p, "SF": p, "F": p, "W": p } }
    for all active (non-eliminated) teams.
    """
    total_draws = s_samples.shape[0]
    round_keys  = [r for r in ROUND_ORDER if r != "R32"]  # track from R16 onward

    # Tally dict: team → round → count
    all_teams = list(team_index.keys())
    tally: dict[str, dict[str, int]] = {
        t: {k: 0 for k in round_keys + ["W"]} for t in all_teams
    }

    # Precompute R32 winners (fixed results + simulated TBDs)
    r32_winners = _precompute_r32_winners(bracket["R32"], s_samples, nu_samples, team_index)

    # Build R16 teams from R32 results (some are pre-known)
    r16_fixtures = _resolve_r16_from_r32(bracket["R16"], bracket["R32"])

    for sim_k in range(n_sims):
        draw_idx = sim_k % total_draws
        s_k  = s_samples[draw_idx]
        nu_k = nu_samples[draw_idx]

        # Start from the R16 (R32 already resolved)
        survivors: dict[str, str] = {}  # match_id → winner

        # Resolve pending R32 TBDs for this sim
        for m in bracket["R32"]:
            if m["winner"]:
                survivors[m["id"]] = m["winner"]
            else:
                a = m["team_a"]
                b = m["team_b"]
                if a and b:
                    w = _simulate_ko(a, b, s_k, nu_k, team_index)
                    survivors[m["id"]] = w

        # Simulate R16 → F
        for round_key in ["R16", "QF", "SF", "F"]:
            for m in bracket[round_key]:
                # Resolve teams from sources if not pre-set
                ta = m["team_a"] or (survivors.get(m["sources"][0]) if "sources" in m else None)
                tb = m["team_b"] or (survivors.get(m["sources"][1]) if "sources" in m else None)

                if not ta or not tb:
                    continue  # can't resolve yet

                if m["winner"]:
                    w = m["winner"]
                else:
                    w = _simulate_ko(ta, tb, s_k, nu_k, team_index)

                survivors[m["id"]] = w

                if round_key == "F":
                    if w in tally:
                        tally[w]["W"] += 1
                else:
                    # The winner advances to the NEXT round
                    next_round = _next_round(round_key)
                    if next_round and w in tally:
                        tally[w][next_round] += 1

                # Count BOTH teams as having REACHED this round
                for team in [ta, tb]:
                    if team and team in tally and round_key in tally[team]:
                        tally[team][round_key] += 1

    # Normalise tallies by n_sims
    probs: dict[str, dict[str, float]] = {}
    for team, counts in tally.items():
        probs[team] = {k: counts[k] / n_sims for k in counts}

    return probs


def _simulate_ko(
    team_a: str,
    team_b: str,
    s_k: np.ndarray,
    nu_k: float,
    team_index: dict[str, int],
) -> str:
    """Draw a winner for a single knockout fixture given one posterior draw."""
    if team_a not in team_index or team_b not in team_index:
        # Unknown team — use a coin flip
        return team_a if np.random.rand() < 0.5 else team_b

    ia = team_index[team_a]
    ib = team_index[team_b]
    exp_a = np.exp(s_k[ia])
    exp_b = np.exp(s_k[ib])
    p_a = exp_a / (exp_a + exp_b)
    return team_a if np.random.rand() < p_a else team_b


def _next_round(current: str) -> str | None:
    idx = ROUND_ORDER.index(current)
    if idx + 1 < len(ROUND_ORDER):
        return ROUND_ORDER[idx + 1]
    return None


def _precompute_r32_winners(r32, s_samples, nu_samples, team_index):
    """Return a map match_id → winner for all R32 matches."""
    result = {}
    for m in r32:
        result[m["id"]] = m["winner"]  # None if TBD
    return result


def _resolve_r16_from_r32(r16_fixtures, r32_fixtures):
    r32_by_id = {m["id"]: m for m in r32_fixtures}
    resolved = []
    for f in r16_fixtures:
        ta = f["team_a"]
        tb = f["team_b"]
        if not ta and "sources" in f:
            src0 = r32_by_id.get(f["sources"][0], {})
            ta = src0.get("winner")
        if not tb and "sources" in f:
            src1 = r32_by_id.get(f["sources"][1], {})
            tb = src1.get("winner")
        resolved.append({**f, "team_a": ta, "team_b": tb})
    return resolved


# ── Fixture probability summary ───────────────────────────────────────────────

def fixture_probs(
    team_a: str,
    team_b: str,
    s_samples: np.ndarray,
    nu_samples: np.ndarray,
    team_index: dict[str, int],
) -> dict:
    """
    Return {p_a, p_draw, p_b, p_a_ko} for a head-to-head fixture.
    Uses the full posterior (no simulation).
    """
    from stan_model import match_probs, match_probs_ko

    if team_a not in team_index or team_b not in team_index:
        return {"p_a": None, "p_draw": None, "p_b": None, "p_a_ko": None}

    ia = team_index[team_a]
    ib = team_index[team_b]
    s_a = s_samples[:, ia]
    s_b = s_samples[:, ib]

    p_a, p_draw, p_b = match_probs(s_a, s_b, nu_samples)
    p_a_ko, _ = match_probs_ko(s_a, s_b, nu_samples)

    return {
        "p_a": round(p_a, 4),
        "p_draw": round(p_draw, 4),
        "p_b": round(p_b, 4),
        "p_a_ko": round(p_a_ko, 4),
    }
