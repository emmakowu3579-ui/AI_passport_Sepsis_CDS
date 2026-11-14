#!/usr/bin/env python3
"""
Build empirical cohort scaler parameters (mean, sd) from all PhysioNet 2019
raw PSV trajectories in data/physionet_2019/raw_psv/ and de-standardize the colleague's 24 extracted patient
windows + Opus clinical notes for seamless integration into the Sepsis CDS app.

Outputs:
  - data/scaler.json                (compatible with extract_trajectories.py --scaler)
  - app/data/scaler.json            (browser-accessible scaler metadata)
  - app/data/colleague_cohort.json  (24 unscaled patients P01-P24 + Opus notes)
"""
import csv
import glob
import io
import json
import math
import os
import zipfile
from datetime import datetime, timezone

PSV_DIR = os.path.join("data", "physionet_2019", "raw_psv")
ICU_ZIP = "icu_trajectories.zip"
NOTES_ZIP = "patient_notes.zip"

SCALER_VARS = [
    "HR", "O2Sat", "Temp", "SBP", "MAP", "DBP", "Resp",
    "BUN", "Chloride", "Creatinine", "Glucose", "Hct", "Hgb",
    "WBC", "Platelets", "Lactate", "Bilirubin_total", "FiO2", "PaO2", "SaO2", "Age"
]

# Physiological clamp bounds after de-standardizing z-scores
CLAMP_BOUNDS = {
    "HR": (25.0, 220.0),
    "O2Sat": (50.0, 100.0),
    "Temp": (32.0, 42.5),
    "MAP": (25.0, 180.0),
    "Resp": (4.0, 60.0),
    "BUN": (1.0, 200.0),
    "Chloride": (70.0, 140.0),
    "Creatinine": (0.2, 18.0),
    "Glucose": (20.0, 800.0),
    "Hct": (10.0, 65.0),
    "Hgb": (3.0, 22.0),
    "WBC": (0.2, 80.0),
    "Platelets": (5.0, 950.0),
}


def compute_empirical_scaler():
    """Compute per-variable mean and sample SD across all raw PhysioNet PSV files."""
    files = sorted(glob.glob(os.path.join(PSV_DIR, "*.psv")))
    if not files:
        raise FileNotFoundError(f"No PSV files found in {PSV_DIR}")

    stats = {col: {"n": 0, "sum": 0.0, "sum_sq": 0.0} for col in SCALER_VARS}

    for path in files:
        with open(path, "r", encoding="utf-8") as fp:
            reader = csv.DictReader(fp, delimiter="|")
            for row in reader:
                for col in SCALER_VARS:
                    val_str = row.get(col, "")
                    if val_str and val_str != "NaN":
                        try:
                            val = float(val_str)
                            if math.isfinite(val):
                                s = stats[col]
                                s["n"] += 1
                                s["sum"] += val
                                s["sum_sq"] += val * val
                        except ValueError:
                            pass

    scaler = {}
    for col, s in stats.items():
        if s["n"] > 1:
            mean = s["sum"] / s["n"]
            var = max(1e-9, (s["sum_sq"] - (s["sum"] * s["sum"]) / s["n"]) / (s["n"] - 1))
            sd = math.sqrt(var)
            scaler[col] = {
                "mean": round(mean, 4),
                "sd": round(sd, 4),
                "n_obs": s["n"],
            }
    return scaler, len(files)


def unscale_value(z_str, col, scaler):
    """Convert z-score string to physical unit using scaler[col], clamped safely."""
    if not z_str or z_str == "NaN":
        return None
    try:
        z = float(z_str)
    except ValueError:
        return None
    if not math.isfinite(z) or col not in scaler:
        return None
    raw = z * scaler[col]["sd"] + scaler[col]["mean"]
    if col in CLAMP_BOUNDS:
        lo, hi = CLAMP_BOUNDS[col]
        raw = max(lo, min(hi, raw))
    return round(raw, 2)


def build_colleague_cohort(scaler):
    """Load P01-P24 from icu_trajectories.zip & patient_notes.zip and de-standardize."""
    if not os.path.exists(ICU_ZIP) or not os.path.exists(NOTES_ZIP):
        raise FileNotFoundError("Missing icu_trajectories.zip or patient_notes.zip")

    notes_map = {}
    with zipfile.ZipFile(NOTES_ZIP, "r") as nz:
        for name in nz.namelist():
            if name.endswith(".txt"):
                pid = name.split("_")[0]
                notes_map[pid] = nz.read(name).decode("utf-8").strip()

    patients = []
    with zipfile.ZipFile(ICU_ZIP, "r") as iz:
        manifest_rows = list(csv.DictReader(io.StringIO(iz.read("manifest.csv").decode("utf-8"))))

        for m in manifest_rows:
            pid = m["patient_id"]
            csv_path = f"patients/{m['file']}"
            rows = list(csv.DictReader(io.StringIO(iz.read(csv_path).decode("utf-8"))))

            stratum = m["stratum"]
            category = "Sepsis Throughout (Colleague Window)" if stratum == "sepsis_throughout" else "Non-Sepsis Control (Colleague Window)"
            age_val = round(float(m["age"]), 1)

            timeline = []
            sepsis_onset_hour = None

            for idx, r in enumerate(rows):
                iculos = int(float(r["ICULOS"]))
                sepsis_label = int(float(r["SepsisLabel"])) if r.get("SepsisLabel") else 0
                if sepsis_label == 1 and sepsis_onset_hour is None:
                    sepsis_onset_hour = iculos

                # De-standardized raw units for deterministic SOFA & CDS evaluation
                hr = unscale_value(r.get("HR"), "HR", scaler)
                o2sat = unscale_value(r.get("O2Sat"), "O2Sat", scaler)
                temp = unscale_value(r.get("Temp"), "Temp", scaler)
                map_val = unscale_value(r.get("MAP"), "MAP", scaler)
                resp = unscale_value(r.get("Resp"), "Resp", scaler)

                creatinine = unscale_value(r.get("Creatinine"), "Creatinine", scaler)
                platelets = unscale_value(r.get("Platelets"), "Platelets", scaler)
                bun = unscale_value(r.get("BUN"), "BUN", scaler)
                wbc = unscale_value(r.get("WBC"), "WBC", scaler)
                glucose = unscale_value(r.get("Glucose"), "Glucose", scaler)
                hgb = unscale_value(r.get("Hgb"), "Hgb", scaler)
                hct = unscale_value(r.get("Hct"), "Hct", scaler)
                chloride = unscale_value(r.get("Chloride"), "Chloride", scaler)

                # Store original z-scores so clinicians can compare both representations
                z_scores = {}
                for zcol in ["HR", "O2Sat", "Temp", "MAP", "Resp", "BUN", "Chloride", "Creatinine", "Glucose", "Hct", "Hgb", "WBC", "Platelets"]:
                    if r.get(zcol):
                        try:
                            z_scores[zcol] = round(float(r[zcol]), 3)
                        except ValueError:
                            pass

                timeline.append({
                    "hour": iculos,
                    "hour_in_window": idx,
                    "sepsis_label": sepsis_label,
                    "vitals": {
                        "hr": hr,
                        "o2sat": o2sat,
                        "temp_c": temp,
                        "map": map_val,
                        "sbp": None,
                        "dbp": None,
                        "resp": resp,
                    },
                    "labs": {
                        "lactate_mmol_l": None,
                        "lactate_mg_dl": None,
                        "creatinine_mg_dl": creatinine,
                        "platelets_k_ul": platelets,
                        "bilirubin_total_mg_dl": None,
                        "wbc_k_ul": wbc,
                        "bun_mg_dl": bun,
                        "glucose_mg_dl": glucose,
                        "hgb_g_dl": hgb,
                        "hct_pct": hct,
                        "chloride_meq_l": chloride,
                    },
                    "z_scores": z_scores,
                    "stale_labs": {
                        "Lactate": True,
                        "Creatinine": False,
                        "Platelets": False,
                        "Bilirubin_total": True,
                    },
                })

            patients.append({
                "patient_id": f"{pid} ({stratum})",
                "short_id": pid,
                "source": "colleague_extracted",
                "category": category,
                "stratum": stratum,
                "cluster": int(m["cluster"]),
                "cluster_size": int(m["cluster_size"]),
                "sepsis_onset_hour": sepsis_onset_hour,
                "demographics": {
                    "age": age_val,
                    "gender": "Unknown (De-identified)",
                    "hosp_adm_time": round(float(m["hosp_adm_time"]), 2),
                },
                "progress_note": notes_map.get(pid, ""),
                "timeline": timeline,
            })

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset": "Colleague Extracted ICU Trajectories (24 Patients, De-Standardized via Empirical PhysioNet Scaler)",
        "total_patients": len(patients),
        "patients": patients,
    }


def main():
    scaler, n_files = compute_empirical_scaler()
    os.makedirs("data", exist_ok=True)
    os.makedirs(os.path.join("app", "data"), exist_ok=True)

    # Save scaler.json in root data/ (for extract_trajectories.py) and app/data/
    with open(os.path.join("data", "scaler.json"), "w", encoding="utf-8") as f:
        json.dump(scaler, f, indent=2)
    with open(os.path.join("app", "data", "scaler.json"), "w", encoding="utf-8") as f:
        json.dump(scaler, f, indent=2)

    print(f"Computed empirical scaler from {n_files} PhysioNet PSV files -> data/scaler.json")
    for k in ["HR", "MAP", "Resp", "Creatinine", "Platelets", "Lactate"]:
        if k in scaler:
            print(f"  {k:12s}: mean={scaler[k]['mean']:8.3f}, sd={scaler[k]['sd']:8.3f} (n={scaler[k]['n_obs']})")

    colleague_data = build_colleague_cohort(scaler)
    out_path = os.path.join("app", "data", "colleague_cohort.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(colleague_data, f, indent=2)

    print(f"Built colleague cohort ({colleague_data['total_patients']} patients + Opus notes) -> {out_path}")


if __name__ == "__main__":
    main()
