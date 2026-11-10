import os
import json

LABELS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "raw_guidelines", "antimicrobial_labels"))

for fname in os.listdir(LABELS_DIR):
    if fname.endswith(".json"):
        fpath = os.path.join(LABELS_DIR, fname)
        with open(fpath, "r", encoding="utf-8") as f:
            data = json.load(f)
        results = data.get("results", [{}])[0]
        name = fname.replace("_fda_label.json", "").upper()
        dosage = results.get("dosage_and_administration", ["N/A"])[0][:300]
        warnings = results.get("warnings_and_cautions", results.get("warnings", ["N/A"]))[0][:300]
        print(f"\n============================\nDRUG: {name}")
        print(f"DOSAGE SNIPPET:\n{dosage}...")
        print(f"\nWARNINGS SNIPPET:\n{warnings}...")
