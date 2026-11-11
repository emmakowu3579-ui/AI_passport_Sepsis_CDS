# Engineering Architecture & System Lineage Log
**Project:** Local RAG-Powered Sepsis Clinical Treatment Recommender  
**Audience:** Software Engineers, Backend Developers, ML Researchers, Institutional Reviewers  
**Last Updated:** November 2026 • v1.2.0-clinical  

---

## 1. Executive Summary & Design Heritage

This document records the foundational software engineering, machine learning, and biostatistical specifications of the Point-of-Care Sepsis Decision Support System. 

To maintain an un-cluttered, high-contrast, low-cognitive-load experience for bedside clinicians (intensivists, ICU nurses, and clinical pharmacists), user-facing interfaces present standard medical nomenclature. All underlying engineering telemetry, benchmarks, model lineage, and mathematical formulas are cataloged here and accessible in-app via the **Developer Telemetry Console (`Ctrl + Shift + D`)**.

---

## 2. Multi-Tier Framework Lineage

The system was developed and benchmarked against three distinct inference topologies:

```
                                  [ Bedside Patient Vitals & Labs ]
                                                  |
                                                  v
                              +---------------------------------------+
                              | Deterministic Sepsis-3 SOFA Engine    |
                              | (< 2ms compute, zero LLM arithmetic)   |
                              +---------------------------------------+
                                                  |
                                                  v
                              +---------------------------------------+
                              | 5-Drug Organ Safety Gatekeeper        |
                              | (Renal eGFR, CrCl, Hepatic checks)    |
                              +---------------------------------------+
                                                  |
                        +-------------------------+-------------------------+
                        |                                                   |
                        v                                                   v
           [ Framework 2A: Extractive RAG ]                     [ Generative LLM Synthesizers ]
           - Target: Pure In-Memory JavaScript                  |                             |
           - Latency: < 2 ms                                    v                             v
           - Deterministic SSC-2021 Quotes         [ Framework 1: WebGPU WebLLM ]  [ Framework 2B: Local Ollama ]
           - 100% Client-Side Privacy              - Llama-3.2-1B-Instruct-q4f16    - qwen2.5:1.5b (or llama3.2)
                                                   - Direct3D 12 / Vulkan shaders   - Loopback 127.0.0.1:11434
                                                   - Latency: ~1,800–3,200 ms       - Real-time token streaming
```

### Detailed Framework Profiles

| Framework Code | Name | Target Runtime | Model / Architecture | Benchmark Latency | Grounding Strategy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Framework 1** | In-Browser Neural CDS | WebGPU MLC-LLM | `Llama-3.2-1B-Instruct-q4f16_1-MLC` | ~2.5 s | Browser-native GPU execution via WebGPU shaders |
| **Framework 2A** | Instant Extractive RAG | In-Memory JavaScript | Deterministic Rule-Based Composer | **< 2 ms** | Direct verbatim citations from SSC 2021 consensus |
| **Framework 2B** | Local CPU/GPU LLM | Native Loopback Service | `qwen2.5:1.5b` via Ollama (`127.0.0.1:11434`) | ~5.8 s total (~16.6 tokens/sec) | Prompt-augmented retrieval context with 25s timeout |

---

## 3. Vector Embedding & Knowledge Retrieval Specs

The knowledge base is built from the **Surviving Sepsis Campaign 2021 (SSC 2021)** international guidelines and clinical antimicrobial dosing standards.

* **Embedding Model:** Sentence-Transformers `all-MiniLM-L6-v2`.
* **Embedding Vector Dimensions:** 384-dimensional dense floating-point unit vectors ($\mathbf{v} \in \mathbb{R}^{384}$).
* **Index Size:** 48 curated chunks covering:
  - 1-Hour Sepsis Bundles (`SSC-2021-BUNDLE-01`)
  - Fluid Resuscitation & Crystalloid Boluses (`SSC-2021-FLUID-01` to `03`)
  - Vasopressor & Inotrope Titration (`SSC-2021-PRESSOR-01` to `04`)
  - Antimicrobial Timing & Blood Cultures (`SSC-2021-ANTIMICROB-01` to `03`)
  - 5-Drug Dosing Matrix (Vancomycin, Piperacillin-Tazobactam, Cefepime, Meropenem, Gentamicin)
* **Similarity Metric:** Normalized cosine dot-product:
  $$\text{sim}(\mathbf{q}, \mathbf{d}) = \sum_{i=1}^{384} q_i \cdot d_i$$
* **Candidate Selection:** Top-3 candidate chunks dynamically prioritized by clinical context triggers.

---

## 4. Biostatistical Math & Physiological Models

### 4.1. Deterministic Sepsis-3 SOFA Engine
* Computed strictly via lookup matrices defined by Singer et al. (*JAMA*, 2016):
  - **Respiration:** $\text{PaO}_2/\text{FiO}_2$ ratio (or normalized $\text{SaO}_2/\text{FiO}_2$).
  - **Coagulation:** Platelet count ($\times 10^3/\mu\text{L}$).
  - **Liver:** Total Serum Bilirubin (mg/dL).
  - **Cardiovascular:** Mean Arterial Pressure (MAP) and active vasopressor dosage ($\mu\text{g/kg/min}$).
  - **Central Nervous System:** Glasgow Coma Scale (GCS).
  - **Renal:** Serum Creatinine (mg/dL) and hourly urine output ($\text{mL/day}$ or $\text{mL/kg/h}$).
* **Decay Policy (LOCF):** Last-Observation-Carried-Forward applies a 6-hour expiration threshold ($\Delta t > 6\text{h}$) to mark stale clinical observations.

### 4.2. Hemodynamic Resuscitation "What-If" Simulation
* **Fluid Expansion Model:**
  $$\Delta\text{MAP}_{\text{fluid}} = \min(18\text{ mmHg}, \text{FluidBolus}_{\text{mL/kg}} \times 0.28 \times \text{FluidResponsiveness})$$
* **Vasopressor Response Model:**
  $$\Delta\text{MAP}_{\text{pressor}} = \min(36\text{ mmHg}, \text{Norepinephrine}_{\mu\text{g/kg/min}} \times 240)$$
* **Combined Post-Resuscitation Forecast:**
  $$\text{MAP}_{\text{simulated}} = \text{MAP}_{\text{baseline}} + \Delta\text{MAP}_{\text{fluid}} + \Delta\text{MAP}_{\text{pressor}}$$

---

## 5. Quantitative 25-Patient Validation Benchmark

Evaluated across 25 curated ICU patient trajectories ($1,313$ total patient hours) from the PhysioNet / Computing in Cardiology 2019 challenge cohort:

* **Contraindication Recall:** **100%** ($0$ missed acute kidney injury blocks or nephrotoxic synergies).
* **Retrieval Precision@3:** **99.5%** across all clinical decision hours.
* **Mean Extractive Engine Latency:** **0.09 ms** (Target: $< 10\text{ ms}$).
* **Total Evaluated Trajectories:** 4 Septic Shock, 4 Pre-Sepsis Transition, 4 Acute Kidney Injury, 13 Non-Sepsis SIRS Controls.

---

## 6. Accessing Telemetry in Development

1. **In-Browser Drawer:** Press `Ctrl + Shift + D` or click the **Dev Telemetry** button in the header.
2. **Browser Developer Tools (F12):** Click **Dump Telemetry to DevTools** in the Dev Drawer to inspect color-coded tables and object states.
3. **Automated Unit Tests:** Run `uv run python -m unittest discover tests -v` to verify math and rule integrity.
