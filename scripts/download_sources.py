import os
import sys
import urllib.request
import zipfile

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
GUIDELINES_DIR = os.path.join(DATA_DIR, "raw_guidelines")
PHYSIONET_DIR = os.path.join(DATA_DIR, "physionet_2019")

os.makedirs(GUIDELINES_DIR, exist_ok=True)
os.makedirs(PHYSIONET_DIR, exist_ok=True)

def download_file(url, target_path, description):
    print(f"\n--- Checking {description} ---")
    if os.path.exists(target_path) and os.path.getsize(target_path) > 1000:
        print(f"Already downloaded: {target_path} ({os.path.getsize(target_path):,} bytes)")
        return True
    
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as response:
            status = response.status
            total_size = response.headers.get('Content-Length')
            content_type = response.headers.get('Content-Type')
            print(f"HTTP Status: {status}, Type: {content_type}, Size: {total_size}")
            
            with open(target_path, 'wb') as f:
                downloaded = 0
                while True:
                    chunk = response.read(65536)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
            print(f"Saved to {target_path} ({downloaded:,} bytes)")
            return True
    except Exception as e:
        print(f"Failed to download {description} from {url}: {e}")
        return False

if __name__ == "__main__":
    print(f"Target data directory: {DATA_DIR}")
    
    # 1. Surviving Sepsis Campaign 2021 XML from NCBI PMC
    ssc_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=PMC8486643&retmode=xml"
    download_file(ssc_url, os.path.join(GUIDELINES_DIR, "SSC_2021_PMC8486643.xml"), "SSC 2021 Guidelines XML")

    # 2. Sepsis-3 Consensus Definitions XML from NCBI PMC
    sepsis3_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=PMC4968574&retmode=xml"
    download_file(sepsis3_url, os.path.join(GUIDELINES_DIR, "Sepsis3_Consensus_PMC4968574.xml"), "Sepsis-3 Consensus XML")

    # 3. Check PhysioNet URL variants
    physionet_urls = [
        "https://physionet.org/files/challenge-2019/1.0.0/training_setA.zip",
        "https://physionet.org/content/challenge-2019/1.0.0/training_setA.zip"
    ]
    for p_url in physionet_urls:
        success = download_file(p_url, os.path.join(PHYSIONET_DIR, "training_setA.zip"), f"PhysioNet 2019 Set A ({p_url})")
        if success:
            break
