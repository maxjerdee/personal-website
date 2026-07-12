"""
fetch.py — Download and filter international football results.

Source: martj42/international_results (updated daily, no auth required).
Filters to competitive matches involving WC 2026 teams since qualifying start.
"""

import time
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
import requests

# ── Config ────────────────────────────────────────────────────────────────────

RESULTS_URL = (
    "https://raw.githubusercontent.com/martj42/international_results"
    "/master/results.csv"
)
SHOOTOUTS_URL = (
    "https://raw.githubusercontent.com/martj42/international_results"
    "/master/shootouts.csv"
)
CACHE_PATH = Path(__file__).parent / "data" / "results_cache.csv"
SHOOTOUTS_CACHE_PATH = Path(__file__).parent / "data" / "shootouts_cache.csv"
CACHE_MAX_AGE_SECONDS = 3600  # re-download if older than 1 hour
QUALIFYING_START = "2023-09-01"

WC_2026 = {
    # CONMEBOL
    "Argentina", "Brazil", "Colombia", "Ecuador", "Uruguay", "Paraguay",
    # UEFA
    "England", "France", "Germany", "Spain", "Portugal", "Netherlands",
    "Belgium", "Norway", "Switzerland", "Austria", "Croatia", "Sweden",
    "Scotland", "Bosnia and Herzegovina", "Czech Republic", "Turkey",
    # CAF
    "Morocco", "Senegal", "Egypt", "Algeria", "Ghana", "Tunisia",
    "Ivory Coast", "South Africa", "Cape Verde", "DR Congo",
    # AFC
    "Japan", "South Korea", "Australia", "Iran", "Saudi Arabia",
    "Qatar", "Jordan", "Iraq", "Uzbekistan",
    # CONCACAF
    "United States", "Mexico", "Canada", "Panama", "Haiti", "Curaçao",
    # OFC
    "New Zealand",
}

# Shorter display names for the UI
DISPLAY_NAMES = {
    "Bosnia and Herzegovina": "Bosnia & Herz.",
    "United States": "USA",
    "South Korea": "South Korea",
    "Ivory Coast": "Ivory Coast",
    "South Africa": "South Africa",
    "Cape Verde": "Cape Verde",
    "DR Congo": "DR Congo",
    "New Zealand": "New Zealand",
    "Saudi Arabia": "Saudi Arabia",
    "Czech Republic": "Czech Republic",
    "Curaçao": "Curaçao",
}

# Country flag emoji map (common WC 2026 teams)
FLAGS = {
    "Argentina": "🇦🇷", "Brazil": "🇧🇷", "Colombia": "🇨🇴", "Ecuador": "🇪🇨",
    "Uruguay": "🇺🇾", "Paraguay": "🇵🇾", "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "France": "🇫🇷",
    "Germany": "🇩🇪", "Spain": "🇪🇸", "Portugal": "🇵🇹", "Netherlands": "🇳🇱",
    "Belgium": "🇧🇪", "Norway": "🇳🇴", "Switzerland": "🇨🇭", "Austria": "🇦🇹",
    "Croatia": "🇭🇷", "Sweden": "🇸🇪", "Scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
    "Bosnia and Herzegovina": "🇧🇦", "Czech Republic": "🇨🇿", "Turkey": "🇹🇷",
    "Morocco": "🇲🇦", "Senegal": "🇸🇳", "Egypt": "🇪🇬", "Algeria": "🇩🇿",
    "Ghana": "🇬🇭", "Tunisia": "🇹🇳", "Ivory Coast": "🇨🇮",
    "South Africa": "🇿🇦", "Cape Verde": "🇨🇻", "DR Congo": "🇨🇩",
    "Japan": "🇯🇵", "South Korea": "🇰🇷", "Australia": "🇦🇺", "Iran": "🇮🇷",
    "Saudi Arabia": "🇸🇦", "Qatar": "🇶🇦", "Jordan": "🇯🇴", "Iraq": "🇮🇶",
    "Uzbekistan": "🇺🇿", "United States": "🇺🇸", "Mexico": "🇲🇽",
    "Canada": "🇨🇦", "Panama": "🇵🇦", "Haiti": "🇭🇹", "Curaçao": "🇨🇼",
    "New Zealand": "🇳🇿",
}


# ── Download / cache ──────────────────────────────────────────────────────────

def _cache_is_fresh(path: Path = CACHE_PATH) -> bool:
    if not path.exists():
        return False
    age = time.time() - path.stat().st_mtime
    return age < CACHE_MAX_AGE_SECONDS


def download_results(force: bool = False) -> pd.DataFrame:
    """Download results CSV (or return cached version if recent enough)."""
    if not force and _cache_is_fresh(CACHE_PATH):
        print(f"[fetch] Using cached data ({CACHE_PATH})")
        return pd.read_csv(CACHE_PATH, parse_dates=["date"])

    print(f"[fetch] Downloading from {RESULTS_URL}")
    r = requests.get(RESULTS_URL, timeout=30)
    r.raise_for_status()
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_bytes(r.content)
    print(f"[fetch] Saved to {CACHE_PATH}")
    return pd.read_csv(CACHE_PATH, parse_dates=["date"])


def download_shootouts(force: bool = False) -> set[tuple[str, str, str]]:
    """
    Download penalty shootout records and return a set of (date, home_team, away_team)
    tuples (as strings) for matches decided by penalties.
    These matches should be treated as draws in training data regardless of score.
    """
    if not force and _cache_is_fresh(SHOOTOUTS_CACHE_PATH):
        df = pd.read_csv(SHOOTOUTS_CACHE_PATH, parse_dates=["date"])
    else:
        print(f"[fetch] Downloading shootouts from {SHOOTOUTS_URL}")
        r = requests.get(SHOOTOUTS_URL, timeout=30)
        r.raise_for_status()
        SHOOTOUTS_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        SHOOTOUTS_CACHE_PATH.write_bytes(r.content)
        df = pd.read_csv(SHOOTOUTS_CACHE_PATH, parse_dates=["date"])

    return {
        (str(row["date"].date()), row["home_team"], row["away_team"])
        for _, row in df.iterrows()
    }


# ── Filter & format ───────────────────────────────────────────────────────────

def _normalise_name(name: str) -> str:
    return name.replace(" ", "_")


def build_match_list(
    df: pd.DataFrame,
    shootouts: set[tuple[str, str, str]] | None = None,
    before_date: str | None = None,
) -> tuple[list[dict], list[str]]:
    """
    Filter raw results DataFrame and return:
      - matches: list of {p1, p2, win1, win2, tie}  (names normalised)
      - teams:   sorted list of unique team name strings (normalised)

    Matches in `shootouts` (decided by extra time / penalties) are recorded as
    draws regardless of the score, since the decisive outcome is noise.
    """
    shootouts = shootouts or set()

    # 1. Completed matches only
    df = df.dropna(subset=["home_score", "away_score"])

    # 2. Competitive only (no friendlies)
    df = df[df["tournament"] != "Friendly"]

    # 3. Since qualifying era
    df = df[df["date"] >= QUALIFYING_START]

    # 3b. Optional date ceiling (for historical snapshot reruns)
    if before_date:
        df = df[df["date"] < before_date]

    # 4. Keep only recognised confederation competitions and their qualifiers.
    # Excludes invitationals (Kirin Cup, King's Cup), sub-regional minnow events
    # (Pacific Games, CONCACAF Series, Gulf Cup), and non-FIFA competitions.
    KEEP_TOURNAMENTS = {
        "FIFA World Cup qualification",
        "FIFA World Cup",
        "UEFA Euro qualification",
        "UEFA Euro",
        "UEFA Nations League",
        "African Cup of Nations qualification",
        "African Cup of Nations",
        "AFC Asian Cup qualification",
        "AFC Asian Cup",
        "CONCACAF Nations League",
        "Copa América",
        "Copa América qualification",
        "Gold Cup",
        "Gold Cup qualification",
        "Arab Cup",
        "Arab Cup qualification",
        "ASEAN Championship",
        "ASEAN Championship qualification",
        "Oceania Nations Cup",
        "Oceania Nations Cup qualification",
    }
    df = df[df["tournament"].isin(KEEP_TOURNAMENTS)].reset_index(drop=True)

    print(f"[fetch] {len(df)} matches after filtering")

    matches = []
    n_shootout_overrides = 0
    for _, row in df.iterrows():
        p1 = _normalise_name(row["home_team"])
        p2 = _normalise_name(row["away_team"])
        hs = int(row["home_score"])
        as_ = int(row["away_score"])
        date_str = str(row["date"].date()) if hasattr(row["date"], "date") else str(row["date"])[:10]
        if (date_str, row["home_team"], row["away_team"]) in shootouts:
            # Decided by extra time/penalties — treat as draw to avoid noise signal
            win1, win2, tie = 0, 0, 1
            n_shootout_overrides += 1
        elif hs > as_:
            win1, win2, tie = 1, 0, 0
        elif as_ > hs:
            win1, win2, tie = 0, 1, 0
        else:
            win1, win2, tie = 0, 0, 1
        matches.append({"p1": p1, "p2": p2, "win1": win1, "win2": win2, "tie": tie})

    if n_shootout_overrides:
        print(f"[fetch] {n_shootout_overrides} match(es) overridden to draw (extra time / penalties)")
    all_teams = sorted({m["p1"] for m in matches} | {m["p2"] for m in matches})
    return matches, all_teams


def get_matches(force_download: bool = False, before_date: str | None = None) -> tuple[list[dict], list[str]]:
    df = download_results(force=force_download)
    shootouts = download_shootouts(force=force_download)
    return build_match_list(df, shootouts, before_date=before_date)


def get_shootout_winners_map(force_download: bool = False) -> dict[tuple, str]:
    """Return {(date_str, home_team, away_team): winner_name} for penalty shootout matches."""
    if not force_download and _cache_is_fresh(SHOOTOUTS_CACHE_PATH):
        df = pd.read_csv(SHOOTOUTS_CACHE_PATH, parse_dates=["date"])
    else:
        r = requests.get(SHOOTOUTS_URL, timeout=30)
        r.raise_for_status()
        SHOOTOUTS_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        SHOOTOUTS_CACHE_PATH.write_bytes(r.content)
        df = pd.read_csv(SHOOTOUTS_CACHE_PATH, parse_dates=["date"])
    return {
        (str(row["date"].date()), row["home_team"], row["away_team"]): row["winner"]
        for _, row in df.iterrows()
        if pd.notna(row.get("winner", None))
    }


def resolve_bracket(bracket: dict) -> dict:
    """
    Propagate known winners forward to fill team_a/team_b in downstream fixtures.
    Processes rounds in order; a single pass is sufficient for a tree-structured bracket.
    """
    import copy
    bracket = copy.deepcopy(bracket)

    winner_of: dict[str, str] = {}
    for round_key in ["R32", "R16", "QF", "SF", "F"]:
        for fixture in bracket.get(round_key, []):
            if fixture.get("winner"):
                winner_of[fixture["id"]] = fixture["winner"]

    for round_key in ["R16", "QF", "SF", "F"]:
        for fixture in bracket.get(round_key, []):
            sources = fixture.get("sources", [])
            if len(sources) == 2:
                if not fixture.get("team_a"):
                    w = winner_of.get(sources[0])
                    if w:
                        fixture["team_a"] = w
                if not fixture.get("team_b"):
                    w = winner_of.get(sources[1])
                    if w:
                        fixture["team_b"] = w
            if fixture.get("winner"):
                winner_of[fixture["id"]] = fixture["winner"]

    return bracket


def auto_fill_winners(
    bracket: dict,
    results_df: pd.DataFrame,
    shootout_winners: dict[tuple, str] | None = None,
) -> tuple[dict, int]:
    """
    Auto-populate winner fields from fetched match data.

    For each fixture with winner=None, a known date, and both teams identified,
    looks up the result in results_df. Manual winners already set are preserved.

    Returns (updated_bracket, n_new_winners).
    """
    import copy
    bracket = copy.deepcopy(bracket)
    shootout_winners = shootout_winners or {}

    # Index results by (date, home_team, away_team) for O(1) lookup
    results_lookup: dict[tuple, pd.Series] = {}
    for _, row in results_df.iterrows():
        date_str = str(row["date"].date()) if hasattr(row["date"], "date") else str(row["date"])[:10]
        key = (date_str, str(row["home_team"]), str(row["away_team"]))
        results_lookup[key] = row

    n_new = 0
    for round_key in ["R32", "R16", "QF", "SF", "F"]:
        for fixture in bracket.get(round_key, []):
            if fixture.get("winner") is not None:
                continue
            team_a = fixture.get("team_a")
            team_b = fixture.get("team_b")
            date_str = fixture.get("date")
            if not team_a or not team_b or not date_str:
                continue

            # Normalized → raw (martj42 uses spaces)
            a_raw = team_a.replace("_", " ")
            b_raw = team_b.replace("_", " ")

            # Try both home/away orderings
            row = results_lookup.get((date_str, a_raw, b_raw))
            home_norm, away_norm = team_a, team_b
            if row is None:
                row = results_lookup.get((date_str, b_raw, a_raw))
                home_norm, away_norm = team_b, team_a
            if row is None:
                continue  # not yet in data

            # Check for incomplete match (NA scores)
            if pd.isna(row.get("home_score")) or pd.isna(row.get("away_score")):
                continue

            home_raw = home_norm.replace("_", " ")
            away_raw = away_norm.replace("_", " ")
            shootout_key = (date_str, home_raw, away_raw)

            if shootout_key in shootout_winners:
                winner_raw = shootout_winners[shootout_key]
                # Match back to normalized fixture team name
                if winner_raw.replace(" ", "_") == home_norm or winner_raw == home_norm:
                    fixture["winner"] = home_norm
                else:
                    fixture["winner"] = away_norm
            else:
                hs = int(row["home_score"])
                as_ = int(row["away_score"])
                if hs > as_:
                    fixture["winner"] = home_norm
                elif as_ > hs:
                    fixture["winner"] = away_norm
                # Draw with no shootout: skip (shouldn't occur in KO rounds)

            if fixture.get("winner"):
                n_new += 1

    return bracket, n_new


# ISO 3166-1 alpha-2 codes for flagcdn.com (normalised team names → ISO)
ISO_CODES: dict[str, str] = {
    "Argentina": "ar", "Australia": "au", "Austria": "at", "Belgium": "be",
    "Bosnia_and_Herzegovina": "ba", "Brazil": "br", "Canada": "ca",
    "Cape_Verde": "cv", "Colombia": "co", "Croatia": "hr",
    "Czech_Republic": "cz", "DR_Congo": "cd", "Ecuador": "ec",
    "Egypt": "eg", "England": "gb-eng", "France": "fr", "Germany": "de",
    "Ghana": "gh", "Haiti": "ht", "Iran": "ir", "Iraq": "iq",
    "Ivory_Coast": "ci", "Japan": "jp", "Jordan": "jo", "Mexico": "mx",
    "Morocco": "ma", "Netherlands": "nl", "New_Zealand": "nz", "Norway": "no",
    "Panama": "pa", "Paraguay": "py", "Portugal": "pt", "Qatar": "qa",
    "Saudi_Arabia": "sa", "Scotland": "gb-sct", "Senegal": "sn",
    "South_Africa": "za", "South_Korea": "kr", "Spain": "es",
    "Sweden": "se", "Switzerland": "ch", "Tunisia": "tn", "Turkey": "tr",
    "United_States": "us", "Uruguay": "uy", "Uzbekistan": "uz",
    "Algeria": "dz", "Ghana": "gh", "Curaçao": "cw",
    "New_Zealand": "nz", "Serbia": "rs", "Denmark": "dk", "Finland": "fi",
    "Ukraine": "ua", "Wales": "gb-wls", "Romania": "ro", "Hungary": "hu",
    "Slovakia": "sk", "Albania": "al", "Georgia": "ge", "Slovenia": "si",
    "Israel": "il", "Iceland": "is", "Greece": "gr", "North_Macedonia": "mk",
    "Montenegro": "me", "Kosovo": "xk", "Armenia": "am", "Cyprus": "cy",
    "Malta": "mt", "Kazakhstan": "kz", "Azerbaijan": "az",
    "Cameroon": "cm", "Mali": "ml", "Nigeria": "ng", "Burkina_Faso": "bf",
    "Guinea": "gn", "Tanzania": "tz", "Uganda": "ug", "Kenya": "ke",
    "Zambia": "zm", "Angola": "ao", "Libya": "ly", "Ethiopia": "et",
    "Rwanda": "rw", "Mozambique": "mz", "Comoros": "km", "Eswatini": "sz",
    "Namibia": "na", "Zimbabwe": "zw", "Botswana": "bw",
    "China": "cn", "Oman": "om", "Kuwait": "kw", "Bahrain": "bh",
    "Palestine": "ps", "Lebanon": "lb", "Syria": "sy", "Yemen": "ye",
    "Thailand": "th", "Vietnam": "vn", "Indonesia": "id",
    "Philippines": "ph", "Malaysia": "my", "Myanmar": "mm",
    "Tajikistan": "tj", "Kyrgyzstan": "kg", "Afghanistan": "af",
    "Venezuela": "ve", "Bolivia": "bo", "Peru": "pe", "Chile": "cl",
    "Jamaica": "jm", "Costa_Rica": "cr", "Honduras": "hn",
    "El_Salvador": "sv", "Guatemala": "gt", "Trinidad_and_Tobago": "tt",
    "Curacao": "cw",
}


def display_name(normalised: str) -> str:
    raw = normalised.replace("_", " ")
    return DISPLAY_NAMES.get(raw, raw)


def team_flag(normalised: str) -> str:
    raw = normalised.replace("_", " ")
    return FLAGS.get(raw, "")
