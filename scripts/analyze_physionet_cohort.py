import os
import glob
import csv
import math

PHYSIONET_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "physionet_2019", "raw_psv"))

def parse_val(v):
    if v is None or v == "" or v == "NaN" or v == "nan":
        return None
    try:
        return float(v)
    except:
        return None

def analyze_all():
    files = sorted(glob.glob(os.path.join(PHYSIONET_DIR, "p*.psv")))
    print(f"Analyzing {len(files)} patient files in {PHYSIONET_DIR} using Python standard library...")
    
    summary = []
    
    for fpath in files:
        pid = os.path.basename(fpath).replace(".psv", "")
        with open(fpath, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f, delimiter="|")
            rows = list(reader)
            
        hours = len(rows)
        if hours == 0:
            continue
            
        # Parse fields and forward-fill
        ffill = {}
        processed_rows = []
        for r in rows:
            p_row = {}
            for k, v in r.items():
                val = parse_val(v)
                if val is not None:
                    ffill[k] = val
                p_row[k] = ffill.get(k, None)
            processed_rows.append(p_row)
            
        # Check sepsis label
        has_sepsis = False
        onset_hour = None
        for i, pr in enumerate(processed_rows):
            lbl = pr.get("SepsisLabel")
            if lbl == 1.0:
                has_sepsis = True
                if onset_hour is None:
                    onset_hour = pr.get("ICULOS", i + 1)
                    
        # Compute SOFA and key markers
        max_sofa = 0
        max_renal = 0
        min_map = 999
        max_lactate = 0
        max_hr = 0
        max_wbc = 0
        
        for pr in processed_rows:
            # Cardiovascular
            map_v = pr.get("MAP")
            cv_score = 0
            if map_v is not None:
                if map_v < min_map: min_map = map_v
                if map_v < 70: cv_score = 1
                
            # Renal
            cr = pr.get("Creatinine")
            renal_score = 0
            if cr is not None:
                if cr >= 5.0: renal_score = 4
                elif cr >= 3.5: renal_score = 3
                elif cr >= 2.0: renal_score = 2
                elif cr >= 1.2: renal_score = 1
            if renal_score > max_renal: max_renal = renal_score
            
            # Coagulation
            plt = pr.get("Platelets")
            coag_score = 0
            if plt is not None:
                if plt < 20: coag_score = 4
                elif plt < 50: coag_score = 3
                elif plt < 100: coag_score = 2
                elif plt < 150: coag_score = 1
                
            # Liver
            bili = pr.get("Bilirubin_total")
            liver_score = 0
            if bili is not None:
                if bili >= 12.0: liver_score = 4
                elif bili >= 6.0: liver_score = 3
                elif bili >= 2.0: liver_score = 2
                elif bili >= 1.2: liver_score = 1
                
            # Respiration
            fio2 = pr.get("FiO2")
            sao2 = pr.get("SaO2") if pr.get("SaO2") is not None else pr.get("O2Sat")
            resp_score = 0
            if fio2 is not None and fio2 > 0 and sao2 is not None:
                ratio = sao2 / fio2
                if ratio < 100: resp_score = 4
                elif ratio < 200: resp_score = 3
                elif ratio < 300: resp_score = 2
                elif ratio < 400: resp_score = 1
                
            total_sofa = cv_score + renal_score + coag_score + liver_score + resp_score
            if total_sofa > max_sofa:
                max_sofa = total_sofa
                
            lact = pr.get("Lactate")
            if lact is not None and lact > max_lactate:
                max_lactate = lact
                
            hr = pr.get("HR")
            if hr is not None and hr > max_hr:
                max_hr = hr
                
            wbc = pr.get("WBC")
            if wbc is not None and wbc > max_wbc:
                max_wbc = wbc
                
        age = processed_rows[0].get("Age")
        gender = processed_rows[0].get("Gender")
        
        # Categorize
        if has_sepsis and min_map < 65 and max_lactate >= 2.0:
            category = "Septic Shock"
        elif has_sepsis and onset_hour and onset_hour > 1:
            category = "Pre-Sepsis Transition"
        elif max_renal >= 2:
            category = "Acute Kidney Injury (AKI) Dysfunction"
        elif not has_sepsis and ((max_hr > 90) or (max_wbc > 12)):
            category = "Non-Sepsis SIRS Control"
        else:
            category = "Stable Control"
            
        summary.append({
            "pid": pid,
            "hours": hours,
            "age": round(age, 1) if age is not None else "N/A",
            "gender": "M" if gender == 1.0 else "F",
            "has_sepsis": has_sepsis,
            "onset_hour": int(onset_hour) if onset_hour is not None else "-",
            "max_sofa": max_sofa,
            "max_renal": max_renal,
            "min_map": round(min_map, 1) if min_map < 900 else "-",
            "max_lactate": round(max_lactate, 1) if max_lactate > 0 else "-",
            "max_hr": round(max_hr, 1) if max_hr > 0 else "-",
            "category": category
        })
        
    counts = {}
    for s in summary:
        c = s["category"]
        counts[c] = counts.get(c, 0) + 1
        
    print("\n--- Distribution of Categories across 100 patients ---")
    for k, v in sorted(counts.items(), key=lambda x: -x[1]):
        print(f"  {k:38}: {v} patients")
        
    print("\n--- Candidate Highlights by Archetype ---")
    for cat in ["Pre-Sepsis Transition", "Septic Shock", "Acute Kidney Injury (AKI) Dysfunction", "Non-Sepsis SIRS Control"]:
        matching = [s for s in summary if s["category"] == cat]
        print(f"\n[{cat}] ({len(matching)} available):")
        for m in matching[:5]:
            print(f"  ID: {m['pid']} | Hours: {m['hours']:2d} | Age: {m['age']} | Sex: {m['gender']} | Onset: {m['onset_hour']} | MaxSOFA: {m['max_sofa']} | MinMAP: {m['min_map']} | MaxLact: {m['max_lactate']}")

if __name__ == "__main__":
    analyze_all()
