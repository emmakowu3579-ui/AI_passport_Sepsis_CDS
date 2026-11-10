import os
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(BASE_DIR, "data")
GUIDELINES_DIR = os.path.join(DATA_DIR, "raw_guidelines")
DRUGS_DIR = os.path.join(GUIDELINES_DIR, "antimicrobial_labels")
PHYSIONET_RAW_DIR = os.path.join(DATA_DIR, "physionet_2019", "raw_psv")

os.makedirs(DRUGS_DIR, exist_ok=True)
os.makedirs(PHYSIONET_RAW_DIR, exist_ok=True)

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

def download_drug_labels():
    print("\n--- 1. Downloading Official FDA Package Inserts & Dosing Protocols ---")
    drugs = [
        {"name": "vancomycin", "query": "vancomycin"},
        {"name": "piperacillin_tazobactam", "query": "piperacillin+AND+tazobactam"},
        {"name": "cefepime", "query": "cefepime"},
        {"name": "meropenem", "query": "meropenem"},
        {"name": "gentamicin", "query": "gentamicin"}
    ]
    
    for item in drugs:
        dname = item["name"]
        outfile = os.path.join(DRUGS_DIR, f"{dname}_fda_label.json")
        if os.path.exists(outfile) and os.path.getsize(outfile) > 1000:
            print(f"  [Exists] {dname} FDA label already saved.")
            continue
            
        url = f"https://api.fda.gov/drug/label.json?search=openfda.generic_name:{item['query']}&limit=1"
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                with open(outfile, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2)
                print(f"  [Downloaded] {dname} -> {os.path.basename(outfile)} ({os.path.getsize(outfile):,} bytes)")
        except Exception as e:
            print(f"  [Error] {dname}: {e}")

def fetch_single_patient(patient_id):
    filename = f"p{patient_id:06d}.psv"
    target_path = os.path.join(PHYSIONET_RAW_DIR, filename)
    if os.path.exists(target_path) and os.path.getsize(target_path) > 100:
        return filename, "exists"
        
    url = f"https://physionet-open.s3.amazonaws.com/challenge-2019/1.0.0/training/training_setA/{filename}"
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=10) as resp:
            content = resp.read()
            with open(target_path, "wb") as f:
                f.write(content)
            return filename, "downloaded"
    except Exception as e:
        return filename, f"error: {e}"

def download_physionet_patients_parallel(num_patients=100):
    print(f"\n--- 2. Downloading PhysioNet 2019 Patient Files in Parallel (1 to {num_patients}) ---")
    downloaded = 0
    existing = 0
    errors = 0
    
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(fetch_single_patient, i): i for i in range(1, num_patients + 1)}
        for future in as_completed(futures):
            fname, status = future.result()
            if status == "downloaded":
                downloaded += 1
            elif status == "exists":
                existing += 1
            else:
                errors += 1
                
    total_files = len(os.listdir(PHYSIONET_RAW_DIR))
    print(f"  Done: {downloaded} downloaded, {existing} already existed, {errors} errors.")
    print(f"  Total files in {PHYSIONET_RAW_DIR}: {total_files}")

if __name__ == "__main__":
    download_drug_labels()
    download_physionet_patients_parallel(num_patients=100)
