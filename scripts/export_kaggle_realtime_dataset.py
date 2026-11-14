#!/usr/bin/env python3
"""
Package raw PhysioNet 2019 ICU trajectories into a single Kaggle-ready ZIP archive
aligned strictly with the real-time bedside streaming schema used by the Sepsis CDS web app.

Why this format:
  - Physical bedside units (no offline dataset-level z-scoring) matching live telemetry
    in app/js/predictiveModel.js and app/data/physionet_cohort.json.
  - Strictly ordered hourly arrival sequence (patient_id, ICULOS) with raw intermittent
    lab/vital missingness preserved (NaN when not measured at hour t), allowing causal
    forward-fill (LOCF) + missingness/staleness counters without future leakage.
  - Causal 6-hour forward forecast target: SepsisLabel = 1 begins 6 hours prior to clinical
    Sepsis-3 onset (t_sepsis - 6h) per PhysioNet Challenge 2019 definition.

Outputs (gitignored under data/kaggle_export/):
  - data/kaggle_export/sepsis_realtime_hourly.csv
  - data/kaggle_export/sepsis_realtime_cohort.zip
      containing:
        * sepsis_realtime_hourly.csv
        * patient_manifest.csv
        * DATASET_README.md
"""
import csv
import glob
import io
import os
import zipfile

PSV_DIR = os.path.join("data", "physionet_2019", "raw_psv")
OUT_DIR = os.path.join("data", "kaggle_export")
OUT_CSV = os.path.join(OUT_DIR, "sepsis_realtime_hourly.csv")
OUT_ZIP = os.path.join(OUT_DIR, "sepsis_realtime_cohort.zip")

README_TEXT = """# Real-Time ICU Sepsis 6-Hour Forecasting Cohort (PhysioNet 2019, N={n_patients:,})

## Real-Time Streaming Schema
Each row represents one hourly ICU bedside tick `(patient_id, ICULOS)` ordered chronologically.
Unlike offline z-scored medoid snapshots, all measurements remain in raw physical clinical units:

- **Timeline & Static Admission Fields:** `patient_id`, `ICULOS` (hours since ICU admission), `Age` (years), `Gender` (0=Female, 1=Male), `HospAdmTime` (hours before ICU admission), `Unit1`, `Unit2`.
- **Hourly Bedside Vitals:** `HR` (bpm), `O2Sat` (%), `Temp` (deg C), `SBP` (mmHg), `MAP` (mmHg), `DBP` (mmHg), `Resp` (breaths/min), `EtCO2`.
- **Asynchronous Blood Gas & Laboratory Draws (`NaN` between draws):** `Lactate` (mmol/L), `Creatinine` (mg/dL), `BUN` (mg/dL), `Bilirubin_total` (mg/dL), `Bilirubin_direct`, `WBC` (K/uL), `Platelets` (K/uL), `Glucose` (mg/dL), `FiO2` (fraction/pct), `pH`, `PaCO2`, `SaO2`, `BaseExcess`, `HCO3`, `Hgb`, `Hct`, `Chloride`, `Potassium`, `Magnesium`, `Calcium`, `Phosphate`, `AST`, `Alkalinephos`, `TroponinI`, `PTT`, `Fibrinogen`.
- **Forecast Target (`SepsisLabel`):** Binary 6-hour forward onset indicator (`1` starting 6 hours before clinical Sepsis-3 onset `t_sepsis` per PhysioNet Challenge 2019).

## Causal Modeling & Evaluation Contract
1. **Strict Causality:** At hour `t`, features MUST be computed solely from history `<= t` (causal LOCF forward-fill, 6h/12h sliding trends, hours since last draw). Never compute global or future-window averages.
2. **Patient-Level Splitting:** Always split by `patient_id` (Stratified by `has_sepsis`) before fitting scalers, encoders, or models.
3. **Browser Parity:** Features using `HR, O2Sat, Temp, SBP, MAP, DBP, Resp, FiO2, BUN, Creatinine, Glucose, WBC, Platelets, Lactate, Bilirubin_total, pH, BaseExcess, Hgb, Hct, Chloride, Age, ICULOS` map directly 1:1 to `app/js/predictiveModel.js`.
"""


def export_dataset():
    psv_files = sorted(glob.glob(os.path.join(PSV_DIR, "*.psv")))
    if not psv_files:
        raise FileNotFoundError(f"No .psv files found in {PSV_DIR}")

    os.makedirs(OUT_DIR, exist_ok=True)

    header_cols = None
    manifest_rows = []
    total_rows = 0
    total_pos_rows = 0
    total_pos_pts = 0

    with open(OUT_CSV, "w", newline="", encoding="utf-8") as csv_out:
        writer = None

        for path in psv_files:
            pid = os.path.splitext(os.path.basename(path))[0]
            with open(path, "r", encoding="utf-8") as fp:
                reader = csv.DictReader(fp, delimiter="|")
                if header_cols is None:
                    header_cols = ["patient_id"] + list(reader.fieldnames)
                    writer = csv.writer(csv_out)
                    writer.writerow(header_cols)

                rows = list(reader)
                if not rows:
                    continue

                first_pos_idx = None
                pos_count = 0
                for idx, row in enumerate(rows):
                    lbl = row.get("SepsisLabel", "0")
                    if lbl == "1":
                        pos_count += 1
                        if first_pos_idx is None:
                            first_pos_idx = idx
                    out_row = [pid] + [
                        "" if (row.get(col) in (None, "", "NaN")) else row.get(col)
                        for col in reader.fieldnames
                    ]
                    writer.writerow(out_row)

                has_sepsis = 1 if pos_count > 0 else 0
                total_pos_pts += has_sepsis
                total_pos_rows += pos_count
                total_rows += len(rows)

                t_first_1 = rows[first_pos_idx].get("ICULOS", "") if first_pos_idx is not None else ""
                est_onset = ""
                if t_first_1 != "":
                    try:
                        est_onset = str(int(float(t_first_1)) + 6)
                    except ValueError:
                        est_onset = ""

                manifest_rows.append({
                    "patient_id": pid,
                    "n_hours": len(rows),
                    "has_sepsis": has_sepsis,
                    "pos_hours": pos_count,
                    "t_first_label1_iculos": t_first_1,
                    "est_t_sepsis_iculos": est_onset,
                    "age": rows[0].get("Age", ""),
                    "gender": rows[0].get("Gender", ""),
                    "hosp_adm_time": rows[0].get("HospAdmTime", ""),
                })

    manifest_buf = io.StringIO()
    m_fields = list(manifest_rows[0].keys())
    m_writer = csv.DictWriter(manifest_buf, fieldnames=m_fields)
    m_writer.writeheader()
    m_writer.writerows(manifest_rows)

    with zipfile.ZipFile(OUT_ZIP, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        zf.write(OUT_CSV, arcname="sepsis_realtime_hourly.csv")
        zf.writestr("patient_manifest.csv", manifest_buf.getvalue())
        zf.writestr("DATASET_README.md", README_TEXT.format(n_patients=len(manifest_rows)).strip() + "\n")

    zip_mb = os.path.getsize(OUT_ZIP) / (1024.0 * 1024.0)
    print(f"Exported {len(manifest_rows)} patients ({total_pos_pts} sepsis+, {total_rows} hourly rows, {total_pos_rows} pos rows)")
    print(f"CSV: {OUT_CSV}")
    print(f"ZIP: {OUT_ZIP} ({zip_mb:.2f} MB)")


if __name__ == "__main__":
    export_dataset()
