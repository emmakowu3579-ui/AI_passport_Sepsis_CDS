import os
import glob
import csv
import json
import math

RAW_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "physionet_2019", "raw_psv"))
OUTPUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "curated"))
os.makedirs(OUTPUT_DIR, exist_ok=True)

TARGET_COHORT = {
    "Septic Shock": [
        "p000009", "p000078", "p000171", "p000203", "p000265", "p000305"
    ],
    "Pre-Sepsis Transition": [
        "p000011", "p000015", "p000018", "p000022", "p000028", "p000055"
    ],
    "Acute Kidney Injury (AKI) Dysfunction": [
        "p000002", "p000007", "p000019", "p000023", "p000033", "p000062"
    ],
    "Non-Sepsis SIRS Control": [
        "p000001", "p000003", "p000004", "p000006", "p000012", "p000014", "p000020"
    ]
}

def parse_float(val):
    if val is None or val == "" or val == "NaN" or val == "nan":
        return None
    try:
        return float(val)
    except:
        return None

def compute_sofa_scores(row):
    # Cardiovascular SOFA
    # 0: MAP >= 70, 1: MAP < 70 (without vasopressors)
    # 2: Dopamine <= 5 or dobutamine any dose
    # 3: Norepinephrine <= 0.1 ug/kg/min or Epinephrine <= 0.1
    # 4: Norepinephrine > 0.1 ug/kg/min or Epinephrine > 0.1
    map_v = row.get("MAP")
    sofa_cv = 0
    if map_v is not None:
        if map_v < 70:
            sofa_cv = 1

    # Renal SOFA (Creatinine mg/dL)
    # 0: < 1.2, 1: 1.2-1.9, 2: 2.0-3.4, 3: 3.5-4.9, 4: >= 5.0
    cr = row.get("Creatinine")
    sofa_renal = 0
    if cr is not None:
        if cr >= 5.0: sofa_renal = 4
        elif cr >= 3.5: sofa_renal = 3
        elif cr >= 2.0: sofa_renal = 2
        elif cr >= 1.2: sofa_renal = 1

    # Coagulation SOFA (Platelets x 10^3/uL)
    # 0: >= 150, 1: < 150, 2: < 100, 3: < 50, 4: < 20
    plt = row.get("Platelets")
    sofa_coag = 0
    if plt is not None:
        if plt < 20: sofa_coag = 4
        elif plt < 50: sofa_coag = 3
        elif plt < 100: sofa_coag = 2
        elif plt < 150: sofa_coag = 1

    # Liver SOFA (Bilirubin_total mg/dL)
    # 0: < 1.2, 1: 1.2-1.9, 2: 2.0-5.9, 3: 6.0-11.9, 4: >= 12.0
    bili = row.get("Bilirubin_total")
    sofa_liver = 0
    if bili is not None:
        if bili >= 12.0: sofa_liver = 4
        elif bili >= 6.0: sofa_liver = 3
        elif bili >= 2.0: sofa_liver = 2
        elif bili >= 1.2: sofa_liver = 1

    # Respiration SOFA (SaO2/FiO2 proxy or PaO2/FiO2)
    # 0: >= 400, 1: < 400, 2: < 300, 3: < 200, 4: < 100
    fio2 = row.get("FiO2")
    sao2 = row.get("SaO2") if row.get("SaO2") is not None else row.get("O2Sat")
    sofa_resp = 0
    if fio2 is not None and fio2 > 0 and sao2 is not None:
        # FiO2 in PhysioNet is usually decimal (0.21 - 1.0) or percentage (21 - 100)
        f_val = fio2 if fio2 <= 1.0 else fio2 / 100.0
        ratio = sao2 / f_val
        if ratio < 100: sofa_resp = 4
        elif ratio < 200: sofa_resp = 3
        elif ratio < 300: sofa_resp = 2
        elif ratio < 400: sofa_resp = 1

    total_sofa = sofa_cv + sofa_renal + sofa_coag + sofa_liver + sofa_resp
    return {
        "sofa_total": total_sofa,
        "sofa_cv": sofa_cv,
        "sofa_renal": sofa_renal,
        "sofa_coag": sofa_coag,
        "sofa_liver": sofa_liver,
        "sofa_resp": sofa_resp
    }

def process_patient(pid, category):
    fpath = os.path.join(RAW_DIR, f"{pid}.psv")
    if not os.path.exists(fpath):
        print(f"Warning: {fpath} not found.")
        return None

    with open(fpath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="|")
        raw_rows = list(reader)

    if not raw_rows:
        return None

    # Demographics from first row
    age = parse_float(raw_rows[0].get("Age"))
    gender_code = parse_float(raw_rows[0].get("Gender"))
    gender = "Male" if gender_code == 1.0 else "Female" if gender_code == 0.0 else "Unknown"
    hosp_adm_time = parse_float(raw_rows[0].get("HospAdmTime"))

    # State for Forward-Fill (LOCF)
    locf_state = {}
    last_measured_hour = {}
    hourly_records = []
    
    first_sepsis_hour = None
    max_total_sofa = 0

    for idx, r in enumerate(raw_rows):
        iculos = int(parse_float(r.get("ICULOS")) or (idx + 1))
        sepsis_label = int(parse_float(r.get("SepsisLabel")) or 0)
        if sepsis_label == 1 and first_sepsis_hour is None:
            first_sepsis_hour = iculos

        row_data = {}
        imputed_flags = {}

        # 41 columns from PhysioNet
        for col, raw_v in r.items():
            parsed_v = parse_float(raw_v)
            if parsed_v is not None:
                locf_state[col] = parsed_v
                last_measured_hour[col] = iculos
                imputed_flags[col] = False
            else:
                imputed_flags[col] = True

            # Use LOCF value if available
            row_data[col] = locf_state.get(col, None)

        # Dual Unit Lactate Normalization
        # Normal blood lactate is 0.5 - 2.0 mmol/L (4.5 - 18.0 mg/dL)
        # 1 mmol/L = 9.008 mg/dL
        raw_lact = row_data.get("Lactate")
        lact_mmol = None
        lact_mg_dl = None
        if raw_lact is not None:
            if raw_lact > 15.0:
                # Value was recorded in mg/dL
                lact_mg_dl = round(raw_lact, 2)
                lact_mmol = round(raw_lact / 9.008, 2)
            else:
                # Value was recorded in mmol/L
                lact_mmol = round(raw_lact, 2)
                lact_mg_dl = round(raw_lact * 9.008, 2)

        # Baseline defaults if labs never measured yet (standard clinical baseline)
        if row_data.get("Creatinine") is None: row_data["Creatinine"] = 0.9
        if row_data.get("Platelets") is None: row_data["Platelets"] = 240.0
        if row_data.get("Bilirubin_total") is None: row_data["Bilirubin_total"] = 0.6
        if row_data.get("O2Sat") is None and row_data.get("SaO2") is not None:
            row_data["O2Sat"] = row_data["SaO2"]
        elif row_data.get("O2Sat") is None:
            row_data["O2Sat"] = 98.0
        if row_data.get("FiO2") is None:
            row_data["FiO2"] = 0.21

        sofa = compute_sofa_scores(row_data)
        if sofa["sofa_total"] > max_total_sofa:
            max_total_sofa = sofa["sofa_total"]

        # Structured hourly record
        hourly_records.append({
            "hour": iculos,
            "sepsis_label": sepsis_label,
            "vitals": {
                "hr": round(row_data.get("HR"), 1) if row_data.get("HR") is not None else None,
                "sbp": round(row_data.get("SBP"), 1) if row_data.get("SBP") is not None else None,
                "dbp": round(row_data.get("DBP"), 1) if row_data.get("DBP") is not None else None,
                "map": round(row_data.get("MAP"), 1) if row_data.get("MAP") is not None else None,
                "resp": round(row_data.get("Resp"), 1) if row_data.get("Resp") is not None else None,
                "temp_c": round(row_data.get("Temp"), 1) if row_data.get("Temp") is not None else None,
                "o2sat": round(row_data.get("O2Sat"), 1) if row_data.get("O2Sat") is not None else None
            },
            "labs": {
                "lactate_mmol_l": lact_mmol,
                "lactate_mg_dl": lact_mg_dl,
                "creatinine_mg_dl": round(row_data.get("Creatinine"), 2) if row_data.get("Creatinine") is not None else None,
                "bun_mg_dl": round(row_data.get("BUN"), 1) if row_data.get("BUN") is not None else None,
                "wbc_k_ul": round(row_data.get("WBC"), 1) if row_data.get("WBC") is not None else None,
                "platelets_k_ul": round(row_data.get("Platelets"), 1) if row_data.get("Platelets") is not None else None,
                "bilirubin_total_mg_dl": round(row_data.get("Bilirubin_total"), 2) if row_data.get("Bilirubin_total") is not None else None,
                "glucose_mg_dl": round(row_data.get("Glucose"), 1) if row_data.get("Glucose") is not None else None,
                "fio2": round(row_data.get("FiO2"), 2) if row_data.get("FiO2") is not None else 0.21,
                "ph": round(row_data.get("pH"), 2) if row_data.get("pH") is not None else None,
                "base_excess": round(row_data.get("BaseExcess"), 1) if row_data.get("BaseExcess") is not None else None
            },
            "sofa": sofa,
            "stale_labs": {
                col: (col in last_measured_hour and (iculos - last_measured_hour[col] > 6))
                for col in ["Lactate", "Creatinine", "Platelets", "Bilirubin_total", "WBC"]
            }
        })

    # Summary narrative for UI display
    description = f"{gender}, {round(age)} yo. {category}. ICU stay: {len(hourly_records)} hours. Max SOFA: {max_total_sofa}."
    if first_sepsis_hour is not None:
        description += f" Sepsis-3 transition flagged at hour {first_sepsis_hour}."

    return {
        "patient_id": pid,
        "category": category,
        "demographics": {
            "age": round(age, 1) if age is not None else 65.0,
            "gender": gender,
            "hosp_adm_time_hours": hosp_adm_time
        },
        "description": description,
        "total_hours": len(hourly_records),
        "sepsis_onset_hour": first_sepsis_hour,
        "max_sofa_score": max_total_sofa,
        "timeline": hourly_records
    }

def build_cohort():
    print(f"Building 25-patient benchmark cohort from {RAW_DIR}...")
    cohort = []
    
    for category, pids in TARGET_COHORT.items():
        print(f"\nProcessing category: {category} ({len(pids)} patients)")
        for pid in pids:
            p_data = process_patient(pid, category)
            if p_data:
                cohort.append(p_data)
                print(f"  + Added {pid}: {p_data['total_hours']} hrs | Max SOFA: {p_data['max_sofa_score']} | Onset: {p_data['sepsis_onset_hour']}")

    output_path = os.path.join(OUTPUT_DIR, "physionet_cohort.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump({
            "generated_at": "2026-11-09",
            "dataset": "PhysioNet / Computing in Cardiology Challenge 2019",
            "total_patients": len(cohort),
            "categories": list(TARGET_COHORT.keys()),
            "patients": cohort
        }, f, indent=2)

    print(f"\nSuccessfully wrote {len(cohort)} patient trajectories to {output_path} ({os.path.getsize(output_path):,} bytes)!")

if __name__ == "__main__":
    build_cohort()
