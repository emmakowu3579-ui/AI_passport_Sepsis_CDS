import os
import json
import re

CURATED_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "curated"))
RAW_SECTIONS_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "extracted_sections.txt"))
RAW_SEPSIS3_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "extracted_sepsis3.txt"))
CORE_CHUNKS_FILE = os.path.join(CURATED_DIR, "knowledge_chunks_raw.json")

def clean_text(text):
    # Remove citations like [1], [2, 3], [4-6]
    text = re.sub(r'\[\s*\d+(?:\s*[,–-]\s*\d+)*\s*\]', '', text)
    # Remove excessive whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def infer_triggers(title, content, category):
    triggers = set()
    txt = (title + " " + content + " " + category).lower()
    
    if "map" in txt or "blood pressure" in txt or "hypotension" in txt:
        triggers.add("MAP_LT_65")
    if "lactate" in txt or "hyperlactatemia" in txt or "lactic" in txt:
        triggers.add("LACTATE_GT_2")
    if "lactate >= 4" in txt or "lactate >= 4.0" in txt or "4 mmol/l" in txt:
        triggers.add("LACTATE_GE_4")
    if "crystalloid" in txt or "fluid" in txt or "resuscitation" in txt or "bolus" in txt:
        triggers.add("FLUID_ORDERED")
    if "norepinephrine" in txt or "vasopressor" in txt:
        triggers.add("VASOPRESSOR_ACTIVE")
    if "vasopressin" in txt or "epinephrine" in txt or "refractory" in txt:
        triggers.add("REFRACTORY_SHOCK")
    if "dobutamine" in txt or "inotrop" in txt or "cardiac" in txt or "myocardial" in txt:
        triggers.add("MYOCARDIAL_DYSFUNCTION")
    if "kidney" in txt or "renal" in txt or "creatinine" in txt or "aki" in txt:
        triggers.add("AKI_PRESENT")
    if "creatinine" in txt:
        triggers.add("CREATININE_GE_1_5")
    if "liver" in txt or "bilirubin" in txt or "hepatic" in txt:
        triggers.add("BILIRUBIN_GE_2")
    if "platelet" in txt or "thrombocytopenia" in txt or "coagul" in txt:
        triggers.add("PLATELETS_LT_100")
    if "vancomycin" in txt:
        triggers.add("DRUG_VANCOMYCIN")
    if "piperacillin" in txt or "zosyn" in txt:
        triggers.add("DRUG_PIPERACILLIN_TAZOBACTAM")
    if "cefepime" in txt or "maxipime" in txt:
        triggers.add("DRUG_CEFEPIME")
    if "meropenem" in txt or "carbapenem" in txt:
        triggers.add("DRUG_MEROPENEM")
    if "gentamicin" in txt or "aminoglycoside" in txt:
        triggers.add("DRUG_GENTAMICIN")
    if "corticosteroid" in txt or "hydrocortisone" in txt:
        triggers.add("REFRACTORY_SHOCK")
    if "ards" in txt or "ventilat" in txt or "hypox" in txt or "pao2" in txt:
        triggers.add("RESP_SOFA_GE_2")
    if "bicarbonate" in txt or "acidemia" in txt or "acidosis" in txt:
        triggers.add("METABOLIC_ACIDOSIS")
    if "glucose" in txt or "insulin" in txt:
        triggers.add("HYPERGLYCEMIA")
    if "transfusion" in txt or "hemoglobin" in txt or "rbc" in txt:
        triggers.add("ANEMIA")
    if "culture" in txt or "antimicrobial" in txt or "antibiotic" in txt:
        triggers.add("ANTIBIOTICS_ORDERED")
        
    if not triggers:
        triggers.add("SEPSIS_SUSPECTED")
    return sorted(list(triggers))

def build_full_corpus():
    with open(CORE_CHUNKS_FILE, "r", encoding="utf-8") as f:
        core_data = json.load(f)
    all_chunks = list(core_data["chunks"])
    existing_ids = {c["id"] for c in all_chunks}
    
    print(f"Loaded {len(all_chunks)} core chunks. Parsing SSC 2021 sections...")
    
    with open(RAW_SECTIONS_FILE, "r", encoding="utf-8") as f:
        content = f.read()
        
    raw_sections = content.split("\n--- Section ")
    section_chunk_count = 0
    
    # Category mapping by section title keywords
    def map_category(title):
        t = title.lower()
        if any(w in t for w in ["resuscitation", "mean arterial pressure", "admission"]):
            return "Initial Resuscitation & Hemodynamics"
        elif any(w in t for w in ["antibiotic", "infection", "antimicrobial", "antifungal", "antiviral", "pharmacokinetic"]):
            return "Antimicrobial Stewardship"
        elif any(w in t for w in ["fluid", "vasoactive", "inotrope", "monitoring", "fluid balance"]):
            return "Fluids & Vasoactive Management"
        elif any(w in t for w in ["ventilation", "oxygen", "ards", "prone", "ecmo"]):
            return "Respiratory Management"
        elif any(w in t for w in ["corticosteroid", "blood purification", "transfusion", "glucose", "bicarbonate", "ulcer", "thromboembolism", "renal replacement", "nutrition"]):
            return "Adjunctive & Supportive Therapies"
        elif any(w in t for w in ["goals of care", "palliative", "discharge", "survivorship"]):
            return "Post-ICU & Goals of Care"
        return "Clinical Practice Guidelines"

    for s in raw_sections:
        if not s.strip():
            continue
        lines = s.split("\n")
        header = lines[0].strip() # e.g. "7: Initial resuscitation ---"
        body_lines = [l.strip() for l in lines[1:] if l.strip()]
        if not body_lines:
            continue
            
        m = re.match(r'(\d+):\s*(.*?)\s*---', header)
        if not m:
            continue
        sec_num = m.group(1)
        sec_title = m.group(2)
        
        if sec_title.lower() in ["no title", "endorsements", "governance of surviving sepsis campaign", "supplementary information"]:
            continue
            
        # Group paragraphs into ~150-250 word units
        combined_text = " ".join(body_lines)
        cleaned = clean_text(combined_text)
        
        # Split into sentences or sub-paragraphs if long
        words = cleaned.split()
        if len(words) < 25:
            continue
            
        chunk_size = 180
        for i in range(0, len(words), chunk_size):
            chunk_words = words[i:i + chunk_size]
            if len(chunk_words) < 30:
                continue
            chunk_txt = " ".join(chunk_words)
            part_suffix = f"P{i//chunk_size + 1}"
            chunk_id = f"SSC-2021-SEC{sec_num}-{part_suffix}"
            
            if chunk_id in existing_ids:
                continue
                
            cat = map_category(sec_title)
            triggers = infer_triggers(sec_title, chunk_txt, cat)
            
            all_chunks.append({
                "id": chunk_id,
                "title": f"SSC 2021: {sec_title} (Part {i//chunk_size + 1})",
                "category": cat,
                "source": f"Surviving Sepsis Campaign 2021 Guidelines, Section {sec_num}",
                "evidence_grade": "Clinical Practice Guideline",
                "clinical_triggers": triggers,
                "escalation_level": "CAUTION" if "REFRACTORY_SHOCK" in triggers else "STANDARD",
                "text": chunk_txt
            })
            existing_ids.add(chunk_id)
            section_chunk_count += 1
            
            # Stop if we reach ~165 total chunks (within target range of 150-200)
            if len(all_chunks) >= 165:
                break
        if len(all_chunks) >= 165:
            break
            
    print(f"Added {section_chunk_count} section chunks from SSC 2021. Total chunks now: {len(all_chunks)}")
    
    out_file = os.path.join(CURATED_DIR, "knowledge_base_full.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump({
            "version": "1.0.0",
            "total_chunks": len(all_chunks),
            "generated_at": "2026-11-09",
            "categories": sorted(list({c["category"] for c in all_chunks})),
            "chunks": all_chunks
        }, f, indent=2)
        
    print(f"Successfully generated comprehensive knowledge base: {out_file} ({os.path.getsize(out_file):,} bytes) with {len(all_chunks)} chunks!")

if __name__ == "__main__":
    build_full_corpus()
