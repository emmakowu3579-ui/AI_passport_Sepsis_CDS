import urllib.request
import os

url = "https://physionet-open.s3.amazonaws.com/challenge-2019/1.0.0/training/training_setA/p000001.psv"
local_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "physionet_2019", "p000001.psv"))

os.makedirs(os.path.dirname(local_path), exist_ok=True)

req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req, timeout=15) as resp:
    data = resp.read()
    with open(local_path, "wb") as f:
        f.write(data)

print(f"Downloaded p000001.psv ({len(data)} bytes).")
with open(local_path, "r") as f:
    lines = [f.readline() for _ in range(15)]
print("Header & first rows:")
for l in lines[:6]:
    print(l.strip())
