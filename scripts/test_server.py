import http.server
import socketserver
import threading
import urllib.request
import json
import os

PORT = 8009
APP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "app"))

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=APP_DIR, **kwargs)

socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(("", PORT), CustomHandler)
t = threading.Thread(target=httpd.serve_forever, daemon=True)
t.start()

print("Testing app HTTP endpoints...")
try:
    with urllib.request.urlopen(f"http://localhost:{PORT}/index.html") as r:
        print(f"  [OK] /index.html: Status {r.status}, length: {len(r.read()):,} bytes")

    with urllib.request.urlopen(f"http://localhost:{PORT}/data/knowledge_index.json") as r:
        data = json.loads(r.read().decode("utf-8"))
        print(f"  [OK] /data/knowledge_index.json: Status {r.status}, chunks: {data['total_chunks']}, dim: {data['dimensions']}")

    with urllib.request.urlopen(f"http://localhost:{PORT}/data/physionet_cohort.json") as r:
        cohort = json.loads(r.read().decode("utf-8"))
        print(f"  [OK] /data/physionet_cohort.json: Status {r.status}, patients: {cohort['total_patients']}")
finally:
    httpd.shutdown()

print("All endpoints verified successfully!")
