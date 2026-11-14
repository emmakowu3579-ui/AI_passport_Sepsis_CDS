# Local RAG-Powered Sepsis Clinical Treatment Recommender

A privacy-preserving, zero-data-leakage point-of-care Clinical Decision Support (CDS) assistant for ICU and emergency physicians, implementing the **Surviving Sepsis Campaign (SSC) 2021 International Guidelines**, **Sepsis-3 Consensus Definitions**, and a **5-Drug Renal/Hepatic Antimicrobial Safety Protocol**.

100% Client-Side Execution: 0 bytes of patient protected health information (PHI) are transmitted externally.

---

## 1. Quick Start Options for Colleagues

### Option A: Complete Docker Deployment (Recommended - Includes Ollama)
Run the full multi-container stack (Nginx web application + Ollama inference engine + automatic model puller):

```bash
# 1. Clone the repository
git clone https://github.com/emmakowu3579-ui/AI_passport_Sepsis_CDS.git
cd AI_passport_Sepsis_CDS

# 2. Launch the containerized system
docker compose up -d
```

- **Point-of-Care Web App:** Open `http://localhost:8000` in your web browser.
- **Ollama Engine:** Runs at `http://localhost:11434` with pre-configured cross-origin resource sharing (`OLLAMA_ORIGINS=*`).
- **Default Model:** The `ollama-init` service automatically pulls `qwen2.5:1.5b` on first startup.
- **Stop containers:** `docker compose down`

To run **only** the web app container without Ollama:
```bash
docker compose up -d sepsis-cds
```

After pulling updates or updating model/cohort JSON artifacts, rebuild the static image without restarting Ollama:
```bash
docker compose up -d --no-deps --build sepsis-cds
```

### Option C: GitHub Codespaces / Cloud Browser IDE
Launch the lightweight Python HTTP server directly inside Codespaces (port `8000` is forwarded automatically in the IDE Ports tab):
```bash
python run_app.py
```

---

### Option B: Native Python Quickstart (Zero Dependencies - Instant)
If you prefer running directly on your host machine without Docker, the application uses **only Python's standard library** (no `pip install` required for runtime):

```bash
# 1. Clone the repository
git clone https://github.com/emmakowu3579-ui/AI_passport_Sepsis_CDS.git
cd AI_passport_Sepsis_CDS

# 2. Launch the multi-threaded clinical server
python run_app.py
```

This immediately launches a local multithreaded server and opens your default browser at **`http://localhost:8000`**.

---

### Option C: Native Host Ollama Integration (Optional)
If you want to run Ollama natively on your host machine (leveraging host Apple Silicon / NVIDIA GPUs):

1. **Install Ollama**: Download from [https://ollama.com](https://ollama.com).
2. **Pull the Clinical Model**:
   ```bash
   ollama pull qwen2.5:1.5b
   ```
   *(Alternative tested models: `llama3.2:1b`, `meditron`, or `mistral`).*

3. **Start Ollama with Browser CORS Enabled**:
   Because the web app runs in your browser at `http://localhost:8000` and communicates with Ollama at `http://localhost:11434`, Ollama must allow cross-origin requests:
   - **Linux / macOS**:
     ```bash
     OLLAMA_ORIGINS="*" ollama serve
     ```
   - **Windows (PowerShell)**:
     ```powershell
     $env:OLLAMA_ORIGINS="*"
     ollama serve
     ```
   - **Windows (System Environment Variable)**: Add `OLLAMA_ORIGINS` with value `*` in Windows System Environment Variables, then restart Ollama from the taskbar.

*Note: If Ollama is not running, the system automatically falls back to **Framework 2A (Instant Extractive RAG)**, synthesizing notes in under 5 milliseconds with zero external dependencies.*

---

## 2. System Architecture & Repository Layout

```
sepsis-rag-cds/
├── app/                                 # Client-side point-of-care clinical workstation
│   ├── index.html                       # Bedside dashboard, What-If simulator, and RAG viewer
│   ├── css/
│   │   └── styles.css                   # High-contrast clinical theme with zero layout shift
│   ├── js/
│   │   ├── sofaEngine.js                # Deterministic SOFA & Sepsis-3 classifier (< 1 ms)
│   │   ├── predictiveModel.js           # Causal 5-Fold PLE-ResNet 6h sepsis predictor
│   │   ├── contraindications.js         # Renal/hepatic 5-drug safety engine (< 1 ms)
│   │   ├── vectorSearch.js              # Cosine similarity + trigger tag retrieval (< 2 ms)
│   │   ├── whatIfSimulator.js           # Interactive hemodynamic & fluid simulator (< 1 ms)
│   │   ├── clinicalCharts.js            # Progressive timeline trajectory rendering (< 2 ms)
│   │   ├── llmSynthesis.js              # Multi-framework note generator (Extractive + Ollama)
│   │   ├── benchmarkSuite.js            # In-browser 25-patient audit engine (1,313 hours)
│   │   ├── markdownRenderer.js          # Clinical citation pill & note formatting
│   │   ├── tourGuide.js                 # 8-step interactive workflow tutorial
│   │   └── authService.js               # Clinical role session manager (MD, PharmD, RN, Audit)
│   └── data/
│       ├── knowledge_index.json         # 165 curated guideline chunks + 384-d vectors (1.26 MB)
│       ├── physionet_cohort.json        # 25 curated longitudinal ICU patient trajectories (1.48 MB)
│       ├── predictive_model.json        # Kaggle 5-Fold PLE-ResNet weights, Platt cal, & metrics (1.45 MB)
│       ├── scaler.json                  # Full-cohort 23-variable physiological mean/SD parameters
│       └── colleague_cohort.json        # 24 clinical partner ICU windows (Z-scores + progress notes)
│
├── notebooks/
│   └── kaggle-sepsis-predictive-model.ipynb  # Kaggle P100 GPU training notebook for PLE-ResNet
│
├── tests/                               # Automated unit & parity test suite (20 tests total)
│   ├── test_clinical_engine.py          # 13 deterministic SOFA, unit-normalization, & drug safety tests
│   ├── test_integrations.py             # 3 cohort integrity, chart/RAG integration, & data contract tests
│   └── test_predictive_parity.py        # 4 Python-vs-Node PLE-ResNet, Platt cal, & Two-Tier parity tests
│
├── scripts/                             # Offline training, extraction, verification, & benchmark tools
│   ├── train_predictive_model.py        # Causal 79-feature builder + 5-Fold PLE-ResNet trainer/exporter
│   ├── build_scaler_and_colleague_data.py  # Generates scaler.json + colleague_cohort.json
│   ├── export_kaggle_realtime_dataset.py   # Packages cohort trajectories & progress notes for Kaggle
│   ├── test_server.py                   # HTTP static server & endpoint smoke test (port 8000)
│   ├── run_benchmarks.py                # Standalone CLI 25-patient validation suite
│   ├── curate_physionet_cohort.py       # Longitudinal extractor with dual-unit normalization
│   ├── build_full_knowledge_base.py     # Guideline chunker (SSC 2021 + Sepsis-3 + FDA labels)
│   └── generate_vector_index.py         # Embedding index generator
│
├── data/
│   ├── scaler.json                      # Full-cohort physiological scaler shared across pipelines
│   ├── raw_guidelines/                  # Official SSC 2021 & Sepsis-3 source materials
│   └── curated/                         # Curated JSON datasets (version-controlled)
│
├── Dockerfile                           # Production Nginx container definition
├── docker-compose.yml                   # Multi-service stack (App + Ollama + Auto-Puller)
├── nginx.conf                           # Optimized Nginx config with gzip & MIME types
├── run_app.py                           # Single-command Python standard library launcher
└── pyproject.toml                       # Python package configuration
```

### Tier 1 Early Warning (6-Hour Predictive Model) & Partner Cohort Integration
Alongside deterministic Sepsis-3 SOFA scoring, the bedside workstation executes a browser-native **`5-Fold PLE-ResNet`** neural ensemble (`app/js/predictiveModel.js` + `app/data/predictive_model.json`) trained strictly with causal lookbacks (zero future leakage) on `3,998` ICU patients (`155,406` hours; `2,798` train / `600` val / `600` held-out test):
* **Feature Pipeline (`79` Causal Features -> `261D` PLE):** Combines raw vitals/labs with clinical shock indices, hinge transformations, 6h/12h temporal rolling dynamics, trend deltas, partial organ scores (`qSOFA`, `SIRS`, `SOFA`, `NEWS2`), and piecewise linear encoding (PLE) plus missingness masks.
* **Platt-Calibrated Two-Tier Alarm Discipline:** Validation-fitted Platt scaling (`a = 0.495428`, `b = -2.313451`) outputs calibrated 6-hour onset probabilities with Two-Tier thresholds: **Watchlist** (`>= 2.92%`) and **Critical Action** (`>= 6.98%`) with **2-of-3-hour sustained** confirmation to suppress transient bedside noise.
* **Held-Out Test Performance (`N = 600` patients):** `0.8227` hourly AUROC, `0.8269` patient-level AUROC, `0.4527` patient AUPRC, `0.5322` PhysioNet Utility Score, `0.0014` ECE (`0.0202` Brier), `0.9511` specificity (`4.79 FP / 100h`), `50/54` sepsis patients flagged on the 24h Watchlist, and `13.5h` median lead time at Critical (`0.9231` specificity / `0.3731` PPV on 2-of-3h sustained confirmation).
* **Real-Time Explainability & Partner Cohort Bridge:** Single-feature zero-baseline ablation surfaces the **Top Risk Drivers** directly on Page 1. Full-cohort parameters in `scaler.json` de-standardize `24` clinical partner ICU windows (`colleague_cohort.json`) back into physical clinical units (`bpm`, `mmHg`, `mg/dL`, `k/uL`) alongside bedside progress notes on Page 3.

---

## 3. Dual Clinical Inference Architecture

The system features an adaptive inference selector designed for clinical workstation realities:

1. **Framework 1: WebGPU In-Browser Engine**:
   - Automatically detects WebGPU support via `navigator.gpu`.
   - Executes quantized open-source models inside a browser Web Worker with IndexedDB caching.

2. **Framework 2: CPU-First Resilient Architecture (No WebGPU Required)**:
   - **Framework 2A: Instant Extractive RAG Composer (< 5 ms)**:
     - 100% deterministic, instant bedside consultation note synthesis.
     - Strictly grounds every claim in verbatim guideline quotes with exact citation links (`[SSC-2021-...]`, `[DOSE-...]`).
     - Zero hallucination risk, zero MB download required.
   - **Framework 2B: Localhost CPU/GPU LLM (Ollama)**:
     - Connects via loopback to `http://localhost:11434`.
     - Automatically probes available models (`/api/tags`), selecting `qwen2.5:1.5b` or `llama3.2:1b`.
     - Real-time token streaming with safety timeouts and manual cancellation controls.

---

## 4. Automated Testing & Verification

### Run the Clinical Unit & Neural Parity Test Suite (20 Tests):
Verifies deterministic SOFA boundaries, dual-unit normalization, antimicrobial safety gates, cohort/RAG data contracts, and exact Python-vs-Node forward-pass parity (`< 1e-4` probability tolerance) for the `5-Fold PLE-ResNet` model:

```bash
node --check app/js/predictiveModel.js
node --check app/js/tourGuide.js
python -m unittest discover -s tests -v
python scripts/test_server.py
```

### Run the 25-Patient Longitudinal Benchmark (1,313 ICU Hours):
Audits retrieval precision, contraindication recall, and processing latency across all 4 patient archetypes (*Septic Shock*, *Pre-Sepsis Transition*, *Acute Kidney Injury*, and *Non-Sepsis SIRS Controls*):

```bash
python scripts/run_benchmarks.py
```

### Benchmark Audit Summary:

| Performance Metric | Clinical Target | Measured Result | Evaluation Status |
| :--- | :--- | :--- | :--- |
| **Deterministic SOFA Concordance** | 100% | **100.0%** | PASS (VERIFIED) |
| **Guideline Retrieval Precision@3** | &ge; 92% | **99.5%** | PASS (VERIFIED) |
| **Contraindication Recall (AKI / Toxicity)** | 100% | **100.0%** | PASS (VERIFIED) |
| **Mean Engine Latency per Hour** | &lt; 10 ms | **0.083 ms** | PASS (VERIFIED) |
| **Protected Health Information Security** | 0 Bytes External | **0 Bytes (100% Air-Gapped)** | PASS (VERIFIED) |
