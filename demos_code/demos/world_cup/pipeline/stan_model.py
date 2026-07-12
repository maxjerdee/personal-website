"""
stan_model.py — Bayesian Davidson (Win/Draw/Loss) paired-comparison model via PyStan.

The Davidson model extends Bradley-Terry to allow ties. Each team i has latent
strength s_i. Given teams i and j:
  P(i wins)  ∝ exp(s_i)
  P(draw)    ∝ ν · exp((s_i + s_j) / 2)
  P(j wins)  ∝ exp(s_j)

ν > 0 controls the propensity for draws.
"""

import numpy as np

# ── PELE-informed prior variant ───────────────────────────────────────────────
# pele[i] is the standardised PELE score (centred, in units of 100 rating pts).
# Teams with no PELE data have pele[i] = 0, so their prior collapses to
# normal(0, sigma_pele) — i.e. same as a neutral prior.
#
# New hyperparameters:
#   alpha      — maps standardised PELE → log-strength scale
#   sigma_pele — global prior width (how tightly s[i] is pulled toward PELE)
STAN_CODE_PELE = """
data {
  int<lower=0> N;
  int<lower=0> M;
  array[M] int<lower=1, upper=N> p1;
  array[M] int<lower=1, upper=N> p2;
  array[M] int<lower=0, upper=1> win1;
  array[M] int<lower=0, upper=1> win2;
  array[M] int<lower=0, upper=1> is_tie;
  vector[N] pele;   // standardised PELE (centred, units of 100 pts); 0 = no data
}
parameters {
  vector[N] s;
  real alpha;
  real<lower=0> sigma_pele;
  real<lower=0> nu;
}
model {
  nu         ~ exponential(1);
  alpha      ~ normal(0, 2);
  sigma_pele ~ cauchy(0, 1);
  s          ~ normal(alpha * pele, sigma_pele);
  // soft sum-to-zero for identifiability
  target += normal_lpdf(sum(s) | 0, 0.001 * N);
  for (m in 1:M) {
    real si = s[p1[m]];
    real sj = s[p2[m]];
    real log_denom = log_sum_exp(
      log_sum_exp(si, sj),
      log(nu) + (si + sj) / 2.0
    );
    if (win1[m])
      target += si - log_denom;
    else if (win2[m])
      target += sj - log_denom;
    else
      target += log(nu) + (si + sj) / 2.0 - log_denom;
  }
}
"""

STAN_CODE = """
data {
  int<lower=0> N;
  int<lower=0> M;
  array[M] int<lower=1, upper=N> p1;
  array[M] int<lower=1, upper=N> p2;
  array[M] int<lower=0, upper=1> win1;
  array[M] int<lower=0, upper=1> win2;
  array[M] int<lower=0, upper=1> is_tie;
}
parameters {
  vector[N] s;
  real<lower=0> sigma;
  real<lower=0> nu;
}
model {
  sigma ~ cauchy(0, 1);
  nu    ~ exponential(1);
  s     ~ normal(0, sigma / sqrt(2.0));
  // soft sum-to-zero constraint for identifiability
  target += normal_lpdf(sum(s) | 0, 0.001 * N);
  for (m in 1:M) {
    real si = s[p1[m]];
    real sj = s[p2[m]];
    real log_denom = log_sum_exp(
      log_sum_exp(si, sj),
      log(nu) + (si + sj) / 2.0
    );
    if (win1[m])
      target += si - log_denom;
    else if (win2[m])
      target += sj - log_denom;
    else
      target += log(nu) + (si + sj) / 2.0 - log_denom;
  }
}
"""


def run_davidson(
    matches: list[dict],
    num_chains: int = 4,
    num_samples: int = 1000,
) -> dict:
    """
    Fit the Davidson model via PyStan.

    Parameters
    ----------
    matches : list of {p1, p2, win1, win2, tie}  (normalised team names)
    num_chains : number of MCMC chains
    num_samples : samples per chain

    Returns
    -------
    dict with keys:
      teams       – ordered list of team name strings
      s_mean      – posterior mean of s per team (np.ndarray, shape N)
      s_std       – posterior std of s per team
      nu_mean     – posterior mean of ν
      s_samples   – full posterior (np.ndarray, shape [chains*samples, N])
      nu_samples  – full posterior of ν (np.ndarray, shape [chains*samples])
    """
    import stan  # lazy import so module can be imported without stan installed

    teams = sorted({m["p1"] for m in matches} | {m["p2"] for m in matches})
    team_index = {t: i + 1 for i, t in enumerate(teams)}  # 1-indexed for Stan

    stan_data = {
        "N": len(teams),
        "M": len(matches),
        "p1":     [team_index[m["p1"]]  for m in matches],
        "p2":     [team_index[m["p2"]]  for m in matches],
        "win1":   [m["win1"]            for m in matches],
        "win2":   [m["win2"]            for m in matches],
        "is_tie": [m["tie"]             for m in matches],
    }

    print(f"[stan] Fitting Davidson model: N={len(teams)} teams, M={len(matches)} matches")
    model = stan.build(STAN_CODE, data=stan_data)
    fit   = model.sample(num_chains=num_chains, num_samples=num_samples)

    s_samples  = fit["s"]           # shape (N, chains*samples) in PyStan 3
    nu_samples = fit["nu"].flatten()

    # PyStan 3 returns (param_dim, total_samples)
    if s_samples.ndim == 2 and s_samples.shape[0] == len(teams):
        s_samples = s_samples.T      # → (total_samples, N)

    s_mean = s_samples.mean(axis=0)
    s_std  = s_samples.std(axis=0)

    print(f"[stan] Done. ν̄ = {nu_samples.mean():.3f}")

    return {
        "teams":     teams,
        "s_mean":    s_mean,
        "s_std":     s_std,
        "nu_mean":   float(nu_samples.mean()),
        "s_samples": s_samples,   # (total_samples, N)
        "nu_samples": nu_samples,
    }


STAN_CODE_PELE_FIXED = """
data {
  int<lower=0> N;
  int<lower=0> M;
  array[M] int<lower=1, upper=N> p1;
  array[M] int<lower=1, upper=N> p2;
  array[M] int<lower=0, upper=1> win1;
  array[M] int<lower=0, upper=1> win2;
  array[M] int<lower=0, upper=1> is_tie;
  vector[N] pele;
  real<lower=0> sigma_pele;  // shared across all teams; non-WC teams have pele=0 so N(0, sigma_pele)
}
parameters {
  vector[N] s;
  real alpha;
  real<lower=0> nu;
}
model {
  nu    ~ exponential(1);
  alpha ~ normal(0, 2);
  s     ~ normal(alpha * pele, sigma_pele);
  target += normal_lpdf(sum(s) | 0, 0.001 * N);
  for (m in 1:M) {
    real si = s[p1[m]];
    real sj = s[p2[m]];
    real log_denom = log_sum_exp(
      log_sum_exp(si, sj),
      log(nu) + (si + sj) / 2.0
    );
    if (win1[m])
      target += si - log_denom;
    else if (win2[m])
      target += sj - log_denom;
    else
      target += log(nu) + (si + sj) / 2.0 - log_denom;
  }
}
"""


def run_davidson_pele_fixed(
    matches: list[dict],
    pele_scores: dict[str, float],
    sigma_pele: float,
    num_chains: int = 4,
    num_samples: int = 1000,
) -> dict:
    """
    Davidson model with PELE-informed prior, sigma_pele fixed (not inferred).

    Fixing sigma_pele lets us directly control how tightly s[i] is pulled toward
    the PELE ordering.  alpha (the scale mapping) is still inferred so the model
    can match its own magnitude rather than being over-constrained.

    sigma_pele guidance (in log-strength units):
      ~2.2  — effectively free (what the data infers naturally)
      ~1.0  — moderate: PELE ordering matters, data can still override
      ~0.5  — tight: data needs strong evidence to deviate from PELE ranking
    """
    import stan

    teams = sorted({m["p1"] for m in matches} | {m["p2"] for m in matches})
    team_index = {t: i + 1 for i, t in enumerate(teams)}

    available = [pele_scores[t] for t in teams if t in pele_scores]
    pele_mean = float(np.mean(available))
    pele_vec  = np.array([
        (pele_scores[t] - pele_mean) / 100.0 if t in pele_scores else 0.0
        for t in teams
    ])

    n_pele = sum(1 for t in teams if t in pele_scores)
    print(f"[stan/pele-fixed] σ_pele={sigma_pele}  "
          f"{n_pele} WC teams get PELE prior mean, {len(teams)-n_pele} non-WC get N(0,σ)")

    stan_data = {
        "N":          len(teams),
        "M":          len(matches),
        "p1":         [team_index[m["p1"]]  for m in matches],
        "p2":         [team_index[m["p2"]]  for m in matches],
        "win1":       [m["win1"]            for m in matches],
        "win2":       [m["win2"]            for m in matches],
        "is_tie":     [m["tie"]             for m in matches],
        "pele":       pele_vec.tolist(),
        "sigma_pele": sigma_pele,
    }

    print(f"[stan/pele-fixed] sigma_pele={sigma_pele}  N={len(teams)}  M={len(matches)}")
    model = stan.build(STAN_CODE_PELE_FIXED, data=stan_data)
    fit   = model.sample(num_chains=num_chains, num_samples=num_samples)

    s_samples      = fit["s"]
    nu_samples     = fit["nu"].flatten()
    alpha_samples  = fit["alpha"].flatten()

    if s_samples.ndim == 2 and s_samples.shape[0] == len(teams):
        s_samples = s_samples.T

    s_mean = s_samples.mean(axis=0)
    s_std  = s_samples.std(axis=0)

    lo, hi = np.percentile(alpha_samples, [5, 95])
    print(f"[stan/pele-fixed] Done. ν̄={nu_samples.mean():.3f}  "
          f"ᾱ={alpha_samples.mean():.3f} 90%CI=[{lo:.3f},{hi:.3f}]")

    return {
        "teams":         teams,
        "s_mean":        s_mean,
        "s_std":         s_std,
        "nu_mean":       float(nu_samples.mean()),
        "s_samples":     s_samples,
        "nu_samples":    nu_samples,
        "alpha_samples": alpha_samples,
        "alpha_mean":    float(alpha_samples.mean()),
        "sigma_pele":    sigma_pele,
    }


def run_davidson_odds(
    matches: list[dict],
    odds_fixtures: list[dict],
    num_chains: int = 4,
    num_samples: int = 1000,
) -> dict:
    """
    Davidson model with Pinnacle KO log-odds as additional likelihood terms.

    Under Davidson, log(p_home_ko / p_away_ko) = s_home - s_away exactly.
    Each market line is treated as a noisy observation of that difference:
        log_odds_ko[k] ~ normal(s_home - s_away, sigma_market)
    where sigma_market is inferred, capturing how much the market deviates
    from pure strength differences (bracket uncertainty, public money, etc.).

    odds_fixtures : list of parsed match dicts from fetch_odds.parse_h2h()
    """
    import stan, math

    teams = sorted({m["p1"] for m in matches} | {m["p2"] for m in matches})
    team_index = {t: i + 1 for i, t in enumerate(teams)}

    def _norm(name: str) -> str:
        return name.replace(" ", "_")

    odds_home, odds_away, log_odds_ko = [], [], []
    skipped = []
    for f in odds_fixtures:
        h = _norm(f["home"])
        a = _norm(f["away"])
        if h not in team_index or a not in team_index:
            skipped.append(f"{f['home']} vs {f['away']}")
            continue
        odds_home.append(team_index[h])
        odds_away.append(team_index[a])
        log_odds_ko.append(f["log_odds_ko"])
    if skipped:
        print(f"[stan/odds] Skipped (teams not in match data): {skipped}")

    stan_data = {
        "N": len(teams),
        "M": len(matches),
        "p1":           [team_index[m["p1"]]  for m in matches],
        "p2":           [team_index[m["p2"]]  for m in matches],
        "win1":         [m["win1"]            for m in matches],
        "win2":         [m["win2"]            for m in matches],
        "is_tie":       [m["tie"]             for m in matches],
        "K":            len(odds_home),
        "odds_home":    odds_home,
        "odds_away":    odds_away,
        "log_odds_ko":  log_odds_ko,
    }

    stan_code = """
data {
  int<lower=0> N;
  int<lower=0> M;
  array[M] int<lower=1, upper=N> p1;
  array[M] int<lower=1, upper=N> p2;
  array[M] int<lower=0, upper=1> win1;
  array[M] int<lower=0, upper=1> win2;
  array[M] int<lower=0, upper=1> is_tie;
  int<lower=0> K;
  array[K] int<lower=1, upper=N> odds_home;
  array[K] int<lower=1, upper=N> odds_away;
  vector[K] log_odds_ko;
}
parameters {
  vector[N] s;
  real<lower=0> sigma;
  real<lower=0> nu;
  real<lower=0> sigma_mkt;
}
model {
  sigma     ~ cauchy(0, 1);
  nu        ~ exponential(1);
  sigma_mkt ~ cauchy(0, 0.5);
  s         ~ normal(0, sigma / sqrt(2.0));
  target += normal_lpdf(sum(s) | 0, 0.001 * N);
  for (m in 1:M) {
    real si = s[p1[m]];
    real sj = s[p2[m]];
    real log_denom = log_sum_exp(
      log_sum_exp(si, sj),
      log(nu) + (si + sj) / 2.0
    );
    if (win1[m])
      target += si - log_denom;
    else if (win2[m])
      target += sj - log_denom;
    else
      target += log(nu) + (si + sj) / 2.0 - log_denom;
  }
  // Market log-odds: log(p_home_ko / p_away_ko) = s_i - s_j under Davidson
  for (k in 1:K) {
    log_odds_ko[k] ~ normal(s[odds_home[k]] - s[odds_away[k]], sigma_mkt);
  }
}
"""

    print(f"[stan/odds] Fitting Davidson+market model: N={len(teams)}, M={len(matches)}, K={len(odds_home)}")
    model = stan.build(stan_code, data=stan_data)
    fit   = model.sample(num_chains=num_chains, num_samples=num_samples)

    s_samples       = fit["s"]
    nu_samples      = fit["nu"].flatten()
    sigma_mkt_samps = fit["sigma_mkt"].flatten()

    if s_samples.ndim == 2 and s_samples.shape[0] == len(teams):
        s_samples = s_samples.T

    s_mean = s_samples.mean(axis=0)
    s_std  = s_samples.std(axis=0)

    print(f"[stan/odds] Done. ν̄={nu_samples.mean():.3f}  σ̄_mkt={sigma_mkt_samps.mean():.3f}")

    return {
        "teams":            teams,
        "s_mean":           s_mean,
        "s_std":            s_std,
        "nu_mean":          float(nu_samples.mean()),
        "s_samples":        s_samples,
        "nu_samples":       nu_samples,
        "sigma_mkt_samples": sigma_mkt_samps,
        "sigma_mkt_mean":   float(sigma_mkt_samps.mean()),
    }


def run_davidson_pele(
    matches: list[dict],
    pele_scores: dict[str, float],
    num_chains: int = 4,
    num_samples: int = 1000,
) -> dict:
    """
    Fit the Davidson model with a PELE-informed prior on team strengths.

    pele_scores : dict mapping normalised team name → raw PELE WC rating.
                  Teams absent from this dict get pele[i] = 0 (neutral prior).

    Extra keys in the returned dict (beyond run_davidson):
      alpha_samples     — posterior draws of alpha (PELE scaling)
      sigma_pele_samples — posterior draws of sigma_pele
      alpha_mean / sigma_pele_mean — posterior means
    """
    import stan

    teams = sorted({m["p1"] for m in matches} | {m["p2"] for m in matches})
    team_index = {t: i + 1 for i, t in enumerate(teams)}

    # Standardise PELE: centre by mean of available scores, scale by 100 pts.
    available = [pele_scores[t] for t in teams if t in pele_scores]
    pele_mean = float(np.mean(available))
    pele_vec = np.array([
        (pele_scores[t] - pele_mean) / 100.0 if t in pele_scores else 0.0
        for t in teams
    ])

    stan_data = {
        "N": len(teams),
        "M": len(matches),
        "p1":     [team_index[m["p1"]]  for m in matches],
        "p2":     [team_index[m["p2"]]  for m in matches],
        "win1":   [m["win1"]            for m in matches],
        "win2":   [m["win2"]            for m in matches],
        "is_tie": [m["tie"]             for m in matches],
        "pele":   pele_vec.tolist(),
    }

    print(f"[stan/pele] Fitting Davidson+PELE model: N={len(teams)} teams, M={len(matches)} matches")
    print(f"[stan/pele] PELE prior coverage: {sum(t in pele_scores for t in teams)}/{len(teams)} teams")
    model = stan.build(STAN_CODE_PELE, data=stan_data)
    fit   = model.sample(num_chains=num_chains, num_samples=num_samples)

    s_samples          = fit["s"]
    nu_samples         = fit["nu"].flatten()
    alpha_samples      = fit["alpha"].flatten()
    sigma_pele_samples = fit["sigma_pele"].flatten()

    if s_samples.ndim == 2 and s_samples.shape[0] == len(teams):
        s_samples = s_samples.T

    s_mean = s_samples.mean(axis=0)
    s_std  = s_samples.std(axis=0)

    print(f"[stan/pele] Done. ν̄={nu_samples.mean():.3f}  "
          f"ᾱ={alpha_samples.mean():.3f}  σ̄_pele={sigma_pele_samples.mean():.3f}")

    return {
        "teams":              teams,
        "s_mean":             s_mean,
        "s_std":              s_std,
        "nu_mean":            float(nu_samples.mean()),
        "s_samples":          s_samples,
        "nu_samples":         nu_samples,
        "alpha_samples":      alpha_samples,
        "sigma_pele_samples": sigma_pele_samples,
        "alpha_mean":         float(alpha_samples.mean()),
        "sigma_pele_mean":    float(sigma_pele_samples.mean()),
        "pele_vec":           pele_vec,
        "pele_mean":          pele_mean,
    }


# ── Win probability helpers ───────────────────────────────────────────────────

def match_probs(
    s_i: np.ndarray,
    s_j: np.ndarray,
    nu: np.ndarray,
) -> tuple[float, float, float]:
    """
    Posterior-averaged win/draw/loss probabilities for team i vs team j.
    All inputs are 1-D arrays of the same length (posterior draws).
    Returns (p_win_i, p_draw, p_win_j).
    """
    exp_i   = np.exp(s_i)
    exp_j   = np.exp(s_j)
    exp_geo = nu * np.exp((s_i + s_j) / 2.0)
    denom   = exp_i + exp_j + exp_geo

    p_win_i = float(np.mean(exp_i   / denom))
    p_draw  = float(np.mean(exp_geo / denom))
    p_win_j = float(np.mean(exp_j   / denom))
    return p_win_i, p_draw, p_win_j


def match_probs_ko(
    s_i: np.ndarray,
    s_j: np.ndarray,
    nu: np.ndarray,
) -> tuple[float, float]:
    """
    Renormalised win probability for knockout (no draws), ignoring ν.
    Returns (p_win_i_ko, p_win_j_ko).
    """
    p_i, _, p_j = match_probs(s_i, s_j, nu)
    total = p_i + p_j
    return p_i / total, p_j / total
