import os
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

PHYSIONET_RAW_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "physionet_2019", "raw_psv"))
HEADERS = {'User-Agent': 'Mozilla/5.0'}

def fetch_single_patient(pid):
    filename = f"p{pid:06d}.psv"
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

if __name__ == "__main__":
    print("Downloading patients 101 to 200 in parallel...")
    with ThreadPoolExecutor(max_workers=12) as executor:
        futures = {executor.submit(fetch_single_patient, i): i for i in range(101, 201)}
        for future in as_completed(futures):
            future.result()
    print(f"Total files now in {PHYSIONET_RAW_DIR}: {len(os.listdir(PHYSIONET_RAW_DIR))}")
