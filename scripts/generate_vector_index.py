import os
import json
import math
import hashlib
import re

CURATED_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "curated"))
INPUT_FILE = os.path.join(CURATED_DIR, "knowledge_base_full.json")
OUTPUT_FILE = os.path.join(CURATED_DIR, "knowledge_index.json")

DIMENSIONS = 384

# Key clinical concepts that receive dedicated semantic dimension anchors
CLINICAL_ANCHORS = [
    ("resuscitation", ["crystalloid", "bolus", "fluids", "saline", "balanced", "hypoperfusion", "volume", "30 ml/kg"]),
    ("hemodynamics", ["map", "blood pressure", "hypotension", "target", "norepinephrine", "vasopressor", "vasopressin", "epinephrine"]),
    ("antimicrobial", ["antibiotic", "empiric", "broad-spectrum", "culture", "de-escalation", "infusion", "bacteremia"]),
    ("renal_kidney", ["creatinine", "crcl", "clearance", "dialysis", "crrt", "nephrotoxic", "aki", "oliguria", "bun"]),
    ("hepatic_liver", ["bilirubin", "liver", "hepatic", "cirrhosis", "jaundice", "ast", "alt"]),
    ("coagulation", ["platelets", "thrombocytopenia", "coagulopathy", "bleeding", "ptt", "inr"]),
    ("metabolic_lactate", ["lactate", "lactic", "acidosis", "acidemia", "bicarbonate", "clearance", "cellular"]),
    ("respiratory_pulm", ["ventilation", "ards", "pao2", "fio2", "hypoxemia", "peep", "plateau pressure", "oxygen"]),
    ("sepsis_definition", ["sofa", "qsofa", "organ dysfunction", "dysregulated", "mortality", "septic shock"]),
    ("vancomycin", ["vancomycin", "mrsa", "trough", "auc", "loading dose", "glycopeptide"]),
    ("piperacillin", ["piperacillin", "tazobactam", "zosyn", "pseudomonas", "beta-lactam"]),
    ("cefepime", ["cefepime", "maxipime", "neurotoxicity", "encephalopathy", "cephalosporin"]),
    ("meropenem", ["meropenem", "carbapenem", "esbl", "seizure", "valproate"]),
    ("gentamicin", ["gentamicin", "aminoglycoside", "ototoxicity", "tubular necrosis", "synergy", "once-daily"]),
    ("adjunctive_care", ["hydrocortisone", "steroid", "transfusion", "hemoglobin", "insulin", "glucose"])
]

def tokenize(text):
    text = text.lower()
    words = re.findall(r'\b[a-z0-9_-]+\b', text)
    return words

def compute_semantic_vector(text, triggers, category):
    words = tokenize(text + " " + " ".join(triggers) + " " + category)
    vec = [0.0] * DIMENSIONS
    
    # 1. Feature hashing across all words (subword / character 3-grams)
    for w in words:
        # Unigram hash
        h = int(hashlib.sha256(w.encode('utf-8')).hexdigest()[:8], 16)
        dim = h % DIMENSIONS
        sign = 1.0 if (h >> 31) & 1 else -1.0
        vec[dim] += sign * 1.5
        
        # Bigram/Trigram character hashes
        if len(w) >= 4:
            for i in range(len(w) - 2):
                tri = w[i:i+3]
                h_tri = int(hashlib.md5(tri.encode('utf-8')).hexdigest()[:6], 16)
                dim_tri = h_tri % DIMENSIONS
                sign_tri = 1.0 if (h_tri >> 23) & 1 else -1.0
                vec[dim_tri] += sign_tri * 0.5
                
    # 2. Dense Clinical Concept Anchoring (dimensions 0 to 149 allocated for concept clusters)
    for c_idx, (concept_name, keywords) in enumerate(CLINICAL_ANCHORS):
        cluster_offset = (c_idx * 10) % (DIMENSIONS - 20)
        match_count = sum(1 for kw in keywords if kw in text.lower())
        if match_count > 0:
            weight = math.sqrt(match_count) * 2.5
            for offset in range(8):
                vec[(cluster_offset + offset) % DIMENSIONS] += weight
                
    # 3. Clinical trigger boosting
    for trg in triggers:
        h_trg = int(hashlib.sha256(trg.encode('utf-8')).hexdigest()[:6], 16)
        for offset in range(4):
            dim_trg = (h_trg + offset * 17) % DIMENSIONS
            vec[dim_trg] += 3.0

    # 4. L2 Normalization to unit hypersphere
    sq_sum = sum(v * v for v in vec)
    norm = math.sqrt(sq_sum) if sq_sum > 0 else 1.0
    normalized_vec = [round(v / norm, 5) for v in vec]
    return normalized_vec

def cosine_sim(v1, v2):
    return sum(a * b for a, b in zip(v1, v2))

def build_index():
    print(f"Loading {INPUT_FILE}...")
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    chunks = data["chunks"]
    print(f"Generating {DIMENSIONS}-dimensional normalized semantic embeddings for {len(chunks)} chunks...")
    
    indexed_chunks = []
    for c in chunks:
        vec = compute_semantic_vector(c["text"], c["clinical_triggers"], c["category"])
        c_copy = dict(c)
        c_copy["embedding"] = vec
        indexed_chunks.append(c_copy)
        
    # Quick sanity check on cosine similarities
    c_fluid = next(c for c in indexed_chunks if c["id"] == "SSC-2021-FLUID-01")
    c_vaso = next(c for c in indexed_chunks if c["id"] == "SSC-2021-VASO-02")
    c_cef_renal = next(c for c in indexed_chunks if c["id"] == "DOSE-CEFEPIME-02")
    c_cef_neuro = next(c for c in indexed_chunks if c["id"] == "DOSE-CEFEPIME-CONTRA-01")
    c_ards = next(c for c in indexed_chunks if c["id"] == "SSC-2021-ARDS-01")
    
    sim_cef_pair = cosine_sim(c_cef_renal["embedding"], c_cef_neuro["embedding"])
    sim_fluid_vaso = cosine_sim(c_fluid["embedding"], c_vaso["embedding"])
    sim_cef_ards = cosine_sim(c_cef_renal["embedding"], c_ards["embedding"])
    
    print("\n--- Semantic Cosine Similarity Verification ---")
    print(f"  Similarity between Cefepime Renal Dosing and Cefepime Neurotoxicity Alert : {sim_cef_pair:.4f} (Expected High > 0.60)")
    print(f"  Similarity between Fluid Resuscitation and Norepinephrine Vasopressor       : {sim_fluid_vaso:.4f} (Expected Moderate ~ 0.40 - 0.55)")
    print(f"  Similarity between Cefepime Renal Dosing and ARDS Ventilation Strategy      : {sim_cef_ards:.4f} (Expected Low < 0.20)")
    
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump({
            "version": "1.0.0",
            "model": "clinical-semantic-384d-v1",
            "dimensions": DIMENSIONS,
            "total_chunks": len(indexed_chunks),
            "generated_at": "2026-11-09",
            "chunks": indexed_chunks
        }, f, indent=2)
        
    print(f"\nSuccessfully wrote {len(indexed_chunks)} indexed vectors to {OUTPUT_FILE} ({os.path.getsize(OUTPUT_FILE):,} bytes)!")

if __name__ == "__main__":
    build_index()
