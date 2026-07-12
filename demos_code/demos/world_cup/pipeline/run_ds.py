"""Run directedstructure on the WC2026 qualifying match network and plot results."""
import argparse
from pathlib import Path
import networkx as nx
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import directedstructure as ds

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--gml",        type=str, default=None,
                   help="Input GML file (default: output/wc2026_matches_all.gml)")
    p.add_argument("--output-csv", type=str, default=None,
                   help="Output CSV for score samples (default: output/wc2026_ds_score_samples.csv)")
    return p.parse_args()

_args = parse_args()
GML        = Path(_args.gml)        if _args.gml        else Path(__file__).parent / "wc2026_matches_all.gml"
OUT_SCORES = Path(__file__).parent / "wc2026_ds_scores.png"
OUT_GROUPS = Path(__file__).parent / "wc2026_ds_groups.png"
OUT_SAMPLES = Path(_args.output_csv) if _args.output_csv else Path(__file__).parent / "wc2026_ds_score_samples.csv"

# --- load (strip non-ASCII accented names) ---
with open(GML, encoding="utf-8") as f:
    lines = f.readlines()
clean = "".join(l.encode("ascii", "replace").decode("ascii") for l in lines)
G = nx.parse_gml(clean, label="label")
print(f"Graph: {G.number_of_nodes()} nations, {G.number_of_edges()} directed win-edges")

in_wc = {n: G.nodes[n].get("in_wc2026", 0) for n in G.nodes()}
strength = {n: G.nodes[n].get("strength", 0.0) for n in G.nodes()}

# --- fit ---
config = ds.Config(hierarchy_model="bradley_terry")
result = ds.fit(
    config, G,
    num_chains=4,
    samples_per_chain=500,
    burn_sweeps=1000,
    seed=42,
    timeout=600.0,
)
print(result)
print(result.parameter_df.to_string(index=False))

scores_df = result.scores_df.set_index("node")
teams = list(G.nodes())
ds_score = {t: scores_df.loc[t, "mean"] for t in teams if t in scores_df.index}
ds_score_std = {t: scores_df.loc[t, "std"] for t in teams if t in scores_df.index}

# orient: WC qualifiers should score higher
qual = [t for t in ds_score if in_wc[t] == 1]
non_qual = [t for t in ds_score if in_wc[t] == 0]
if np.mean([ds_score[t] for t in qual]) < np.mean([ds_score[t] for t in non_qual]):
    ds_score = {t: -s for t, s in ds_score.items()}

# --- figure 1: ds score vs pre-tournament strength, colored by WC qualification ---
fig, ax = plt.subplots(figsize=(8, 6))
colors = {0: "#aaaaaa", 1: "#e63946"}
for wc, label in [(0, "Did not qualify"), (1, "WC 2026 qualifier")]:
    ns = [t for t in ds_score if in_wc[t] == wc]
    ax.scatter([strength[t] for t in ns], [ds_score[t] for t in ns],
               color=colors[wc], label=label, s=20, alpha=0.7, edgecolors="none")

# annotate WC qualifiers
for t in qual:
    if t in ds_score:
        ax.annotate(t, (strength[t], ds_score[t]), fontsize=5, alpha=0.7,
                    xytext=(3, 0), textcoords="offset points")

ax.set_xlabel("Pre-tournament strength (existing ranking)")
ax.set_ylabel("ds inferred hierarchy score")
ax.set_title("WC 2026 Qualifying: ds score vs prior strength")
ax.legend(fontsize=9)
fig.tight_layout()
fig.savefig(OUT_SCORES, dpi=200)
print(f"Saved {OUT_SCORES}")

# --- figure 2: community assignments ---
partition = result.consensus_partition()
node_order = result._node_order
part_map = {node_order[i]: partition[i] for i in range(len(node_order))}
groups = sorted(set(part_map.values()))
num_groups = len(groups)
print(f"\nInferred {num_groups} communities")

# FIFA confederation membership for label assignment
CONF_MEMBERS = {
    "UEFA":     {"Albania","Andorra","Armenia","Austria","Azerbaijan","Belarus","Belgium",
                 "Bosnia and Herzegovina","Bulgaria","Croatia","Cyprus","Czech Republic",
                 "Denmark","England","Estonia","Faroe Islands","Finland","France","Georgia",
                 "Germany","Gibraltar","Greece","Hungary","Iceland","Ireland","Israel","Italy",
                 "Kazakhstan","Kosovo","Latvia","Liechtenstein","Lithuania","Luxembourg","Malta",
                 "Moldova","Montenegro","Netherlands","North Macedonia","Northern Ireland",
                 "Norway","Poland","Portugal","Romania","Russia","San Marino","Scotland",
                 "Serbia","Slovakia","Slovenia","Spain","Sweden","Switzerland","Turkey",
                 "Ukraine","Wales"},
    "CONMEBOL": {"Argentina","Bolivia","Brazil","Chile","Colombia","Ecuador","Paraguay",
                 "Peru","Uruguay","Venezuela"},
    "CONCACAF": {"Antigua and Barbuda","Aruba","Bahamas","Barbados","Belize","Bermuda",
                 "Canada","Cayman Islands","Costa Rica","Cuba","Curacao","Dominican Republic",
                 "El Salvador","Grenada","Guatemala","Guyana","Haiti","Honduras","Jamaica",
                 "Mexico","Nicaragua","Panama","Puerto Rico","Saint Kitts and Nevis",
                 "Saint Lucia","Saint Vincent and the Grenadines","Suriname",
                 "Trinidad and Tobago","United States","US Virgin Islands"},
    "CAF":      {"Algeria","Angola","Benin","Botswana","Burkina Faso","Burundi","Cameroon",
                 "Cape Verde","Central African Republic","Chad","Comoros","Congo","DR Congo",
                 "Djibouti","Egypt","Equatorial Guinea","Eritrea","Eswatini","Ethiopia",
                 "Gabon","Gambia","Ghana","Guinea","Guinea-Bissau","Ivory Coast","Kenya",
                 "Lesotho","Liberia","Libya","Madagascar","Malawi","Mali","Mauritania",
                 "Mauritius","Morocco","Mozambique","Namibia","Niger","Nigeria","Rwanda",
                 "Sao Tome and Principe","Senegal","Sierra Leone","Somalia","South Africa",
                 "South Sudan","Sudan","Tanzania","Togo","Tunisia","Uganda","Zambia","Zimbabwe"},
    "AFC":      {"Afghanistan","Australia","Bahrain","Bangladesh","Bhutan","Brunei","Cambodia",
                 "China","Chinese Taipei","Guam","Hong Kong","India","Indonesia","Iran","Iraq",
                 "Japan","Jordan","Kuwait","Kyrgyzstan","Laos","Lebanon","Macao","Malaysia",
                 "Maldives","Mongolia","Myanmar","Nepal","North Korea","Oman","Pakistan",
                 "Palestine","Philippines","Qatar","Saudi Arabia","Singapore","South Korea",
                 "Sri Lanka","Syria","Tajikistan","Thailand","Timor-Leste","Turkmenistan",
                 "United Arab Emirates","Uzbekistan","Vietnam","Yemen"},
    "OFC":      {"American Samoa","Cook Islands","Fiji","New Caledonia","New Zealand",
                 "Papua New Guinea","Samoa","Solomon Islands","Tahiti","Tonga","Vanuatu"},
}

def get_confederation(name):
    for conf, members in CONF_MEMBERS.items():
        if name in members:
            return conf
    return "Other"

# Dynamically assign labels: dominant confederation + relative score rank within confederation
def assign_group_labels(groups, part_map, ds_score):
    # Compute mean score and dominant confederation per group
    group_info = {}
    for g in groups:
        members = [t for t in part_map if part_map[t] == g and t in ds_score]
        if not members:
            group_info[g] = {"conf": "Other", "mean": 0, "n": 0}
            continue
        conf_counts = {}
        for t in members:
            c = get_confederation(t)
            conf_counts[c] = conf_counts.get(c, 0) + 1
        dominant = max(conf_counts, key=conf_counts.get)
        group_info[g] = {
            "conf": dominant,
            "mean": sum(ds_score[t] for t in members) / len(members),
            "n": len(members),
        }

    # Assign level suffix (high/mid/low) within each confederation
    CONF_LABEL = {
        "UEFA": "Europe", "CONMEBOL": "S. America", "CONCACAF": "CONCACAF",
        "CAF": "Africa", "AFC": "Asia", "OFC": "Oceania", "Other": "Other",
    }
    # Special case: CONCACAF top group (Mexico/Canada/USA) → "N. America"
    # Identify it as the CONCACAF group with highest mean score
    concacaf_groups = sorted(
        [g for g, info in group_info.items() if info["conf"] == "CONCACAF"],
        key=lambda g: -group_info[g]["mean"]
    )

    levels = ["high", "mid", "low"]
    labels = {}
    for conf in ["UEFA", "CONMEBOL", "CONCACAF", "CAF", "AFC", "OFC", "Other"]:
        conf_groups = sorted(
            [g for g, info in group_info.items() if info["conf"] == conf],
            key=lambda g: -group_info[g]["mean"]
        )
        base = CONF_LABEL[conf]
        if len(conf_groups) == 1:
            # Single group for this confederation: no level suffix needed
            g = conf_groups[0]
            # Special case: top CONCACAF group → N. America
            if conf == "CONCACAF" and concacaf_groups and g == concacaf_groups[0]:
                labels[g] = "N. America"
            else:
                labels[g] = base
        else:
            for i, g in enumerate(conf_groups):
                if conf == "CONCACAF" and g == concacaf_groups[0]:
                    labels[g] = "N. America"
                elif len(conf_groups) == 2:
                    labels[g] = f"{base} ({'high' if i == 0 else 'low'})"
                else:
                    labels[g] = f"{base} ({levels[min(i, 2)]})"
    return labels

GROUP_LABELS = assign_group_labels(groups, part_map, ds_score)

# Stable color per label (same label → same color regardless of group index)
LABEL_COLORS = {
    "Europe (high)":   "#1f77b4",
    "Europe (low)":    "#aec7e8",
    "Africa (high)":   "#d62728",
    "Africa (low)":    "#f7b6b6",
    "Asia (high)":     "#9467bd",
    "Asia (mid)":      "#c5b0d5",
    "Asia (low)":      "#e8d5f5",
    "N. America":      "#2ca02c",
    "CONCACAF (mid)":  "#98df8a",
    "CONCACAF (low)":  "#d4f0c8",
    "S. America":      "#ff7f0e",
    "Oceania":         "#8c564b",
}

# print top scorers per community
for g in groups:
    members = sorted([t for t in part_map if part_map[t] == g and t in ds_score],
                     key=lambda t: -ds_score[t])
    wc_count = sum(1 for t in members if in_wc.get(t, 0) == 1)
    label = GROUP_LABELS.get(g, f"Group {g}")
    print(f"  {label} ({len(members)} nations, {wc_count} WC qualifiers): "
          + ", ".join(f"{t}({ds_score[t]:.2f})" for t in members[:5]))

# scatter: ds score vs strength, colored by group label
fig2, ax2 = plt.subplots(figsize=(9, 6))
seen_labels = set()
for g in groups:
    members = [t for t in part_map if part_map[t] == g and t in ds_score]
    label = GROUP_LABELS.get(g, f"Group {g}")
    color = LABEL_COLORS.get(label, "#aaaaaa")
    leg_label = label if label not in seen_labels else None
    ax2.scatter([strength[t] for t in members], [ds_score[t] for t in members],
                color=color, s=20, alpha=0.8, edgecolors="none", label=leg_label)
    seen_labels.add(label)
    # mark WC qualifiers with a ring
    wc_m = [t for t in members if in_wc.get(t, 0) == 1]
    if wc_m:
        ax2.scatter([strength[t] for t in wc_m], [ds_score[t] for t in wc_m],
                    facecolors="none", edgecolors=color,
                    linewidths=1.2, s=55)

ax2.set_xlabel("Pre-tournament strength")
ax2.set_ylabel("ds hierarchy score")
ax2.set_title(f"WC 2026 Qualifying: {num_groups} inferred communities (rings = WC qualifiers)")
ax2.legend(fontsize=7, ncol=2, loc="upper left")
fig2.tight_layout()
fig2.savefig(OUT_GROUPS, dpi=200)
print(f"Saved {OUT_GROUPS}")

# --- write score samples ---
# Full posterior samples for each nation's hierarchy score (individual_depth units).
# Shape: (num_chains * samples_per_chain) rows x (1 + n_nations) columns.
# Columns: sample_id, then one column per nation (label).
samples = result.samples_df()
score_cols = [c for c in samples.columns if c not in ("sample_id", "chain_id", "group_depth", "individual_depth", "ties_parameter", "density_in", "density_out", "variation_in", "variation_out", "degree_correction", "num_groups")]
# scores_df has node names; samples_df uses _node_order indices -> map to names
node_order = result._node_order
score_sample_cols = {f"score_{i}": node_order[i] for i in range(len(node_order))}

# Rebuild: extract just the score columns from samples and rename to nation names
raw = result.samples_df()
score_cols_raw = [c for c in raw.columns if c.startswith("score_")]
score_samples = raw[["sample_id", "chain_id"] + score_cols_raw].copy()
score_samples = score_samples.rename(columns={f"score_{i}": node_order[i] for i in range(len(node_order))})
score_samples.to_csv(OUT_SAMPLES, index=False)
print(f"Saved {OUT_SAMPLES}  ({len(score_samples)} samples x {len(node_order)} nations)")
