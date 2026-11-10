import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8000
DIRECTORY = os.path.abspath(os.path.join(os.path.dirname(__file__), "app"))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Enable CORS and disable aggressive caching for local CDS development
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

def main():
    print("=" * 70)
    print("  LOCAL RAG-POWERED SEPSIS CLINICAL DECISION SUPPORT (CDS) PLATFORM")
    print("=" * 70)
    print(f" Serving Directory : {DIRECTORY}")
    print(f" Web Dashboard URL : http://localhost:{PORT}")
    print(" Knowledge Base    : 165 Curated Chunks (SSC 2021 + Sepsis-3 + 5-Drug Dosing)")
    print(" Benchmark Cohort  : 25 Longitudinal PhysioNet 2019 Patient Trajectories")
    print(" Dual Framework    : Framework 1 (WebGPU) + Framework 2 (CPU Instant RAG & Ollama)")
    print("=" * 70)

    url = f"http://localhost:{PORT}"
    print(f"\nOpening browser to {url} ...")
    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"Could not open browser automatically: {e}")

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print("Server running. Press Ctrl+C to stop.\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")

if __name__ == "__main__":
    main()
