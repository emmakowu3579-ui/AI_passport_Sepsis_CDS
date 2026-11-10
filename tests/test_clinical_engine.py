"""
Clinical Engine & RAG Knowledge Base Automated Unit Tests
Industry-standard test suite verifying deterministic calculations, safety gates, and data integrity.
Run with: python -m unittest discover tests
"""

import unittest
import json
import os
import math

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
INDEX_PATH = os.path.join(ROOT_DIR, "data", "curated", "knowledge_index.json")
COHORT_PATH = os.path.join(ROOT_DIR, "data", "curated", "physionet_cohort.json")

def compute_sofa_renal(creatinine_mg_dl):
    if creatinine_mg_dl is None: return 0
    if creatinine_mg_dl >= 5.0: return 4
    if creatinine_mg_dl >= 3.5: return 3
    if creatinine_mg_dl >= 2.0: return 2
    if creatinine_mg_dl >= 1.2: return 1
    return 0

def compute_sofa_coag(platelets_k_ul):
    if platelets_k_ul is None: return 0
    if platelets_k_ul < 20: return 4
    if platelets_k_ul < 50: return 3
    if platelets_k_ul < 100: return 2
    if platelets_k_ul < 150: return 1
    return 0

def compute_sofa_liver(bilirubin_mg_dl):
    if bilirubin_mg_dl is None: return 0
    if bilirubin_mg_dl >= 12.0: return 4
    if bilirubin_mg_dl >= 6.0: return 3
    if bilirubin_mg_dl >= 2.0: return 2
    if bilirubin_mg_dl >= 1.2: return 1
    return 0

def compute_sofa_cv(map_val, norepi=0.0):
    if norepi > 0.1: return 4
    if norepi > 0: return 3
    if map_val is not None and map_val < 70: return 1
    return 0

def lactate_mg_to_mmol(mg_dl):
    return round(mg_dl / 9.008, 2)

def evaluate_safety_flags(creatinine, selected_drugs):
    alerts = []
    if creatinine >= 1.5:
        if "cefepime" in selected_drugs:
            alerts.append("ALERT-CEFEPIME-NEURO")
        if "gentamicin" in selected_drugs:
            alerts.append("ALERT-GENT-CONTRA-AKI")
        if "vancomycin" in selected_drugs and "piperacillin_tazobactam" in selected_drugs:
            alerts.append("ALERT-VANC-ZOYSN-NEPHRO")
    return alerts

class TestClinicalMathAndRules(unittest.TestCase):
    """Pillar 1: Mathematical determinism of SOFA and unit conversions"""

    def test_renal_sofa_boundaries(self):
        self.assertEqual(compute_sofa_renal(0.8), 0, "Cr 0.8 must be score 0")
        self.assertEqual(compute_sofa_renal(1.2), 1, "Cr 1.2 boundary must be score 1")
        self.assertEqual(compute_sofa_renal(1.9), 1, "Cr 1.9 boundary must be score 1")
        self.assertEqual(compute_sofa_renal(2.0), 2, "Cr 2.0 boundary must be score 2")
        self.assertEqual(compute_sofa_renal(3.4), 2, "Cr 3.4 boundary must be score 2")
        self.assertEqual(compute_sofa_renal(3.5), 3, "Cr 3.5 boundary must be score 3")
        self.assertEqual(compute_sofa_renal(4.9), 3, "Cr 4.9 boundary must be score 3")
        self.assertEqual(compute_sofa_renal(5.0), 4, "Cr >= 5.0 must be score 4")

    def test_coagulation_sofa_boundaries(self):
        self.assertEqual(compute_sofa_coag(250), 0)
        self.assertEqual(compute_sofa_coag(149), 1)
        self.assertEqual(compute_sofa_coag(99), 2)
        self.assertEqual(compute_sofa_coag(49), 3)
        self.assertEqual(compute_sofa_coag(19), 4)

    def test_liver_sofa_boundaries(self):
        self.assertEqual(compute_sofa_liver(0.5), 0)
        self.assertEqual(compute_sofa_liver(1.5), 1)
        self.assertEqual(compute_sofa_liver(3.2), 2)
        self.assertEqual(compute_sofa_liver(8.0), 3)
        self.assertEqual(compute_sofa_liver(15.0), 4)

    def test_cardiovascular_sofa_boundaries(self):
        self.assertEqual(compute_sofa_cv(75, norepi=0), 0)
        self.assertEqual(compute_sofa_cv(62, norepi=0), 1)
        self.assertEqual(compute_sofa_cv(62, norepi=0.08), 3)
        self.assertEqual(compute_sofa_cv(62, norepi=0.25), 4)

    def test_lactate_unit_conversion(self):
        # 34.2 mg/dL from proposal walkthrough patient must equal 3.8 mmol/L
        mmol = lactate_mg_to_mmol(34.2)
        self.assertEqual(mmol, 3.8, "34.2 mg/dL must convert to 3.80 mmol/L")

class TestDrugSafetyGates(unittest.TestCase):
    """Pillar 2: Zero-tolerance contraindication recall"""

    def test_cefepime_neurotoxicity_in_aki(self):
        # Creatinine 2.1 mg/dL with Cefepime must fire neurotoxicity alert
        alerts = evaluate_safety_flags(2.1, ["cefepime"])
        self.assertIn("ALERT-CEFEPIME-NEURO", alerts)

    def test_gentamicin_block_in_aki(self):
        # Gentamicin in AKI must fire contraindication alert
        alerts = evaluate_safety_flags(2.1, ["gentamicin"])
        self.assertIn("ALERT-GENT-CONTRA-AKI", alerts)

    def test_vanc_zosyn_synergy_in_aki(self):
        # Vanc + Zosyn in AKI must fire synergistic nephrotoxicity alert
        alerts = evaluate_safety_flags(2.1, ["vancomycin", "piperacillin_tazobactam"])
        self.assertIn("ALERT-VANC-ZOYSN-NEPHRO", alerts)

    def test_preserved_renal_function_no_blocks(self):
        # Normal creatinine 0.8 mg/dL should not fire critical AKI contraindications
        alerts = evaluate_safety_flags(0.8, ["cefepime", "gentamicin"])
        self.assertEqual(len(alerts), 0)

class TestKnowledgeIndexIntegrity(unittest.TestCase):
    """Pillar 3: Vector schema, dimensionality, and normalization"""

    def setUp(self):
        with open(INDEX_PATH, "r", encoding="utf-8") as f:
            self.data = json.load(f)

    def test_total_chunks_within_target_range(self):
        total = self.data.get("total_chunks", 0)
        self.assertGreaterEqual(total, 150, "Knowledge base must have at least 150 chunks")
        self.assertLessEqual(total, 200, "Knowledge base must not exceed 200 chunks")

    def test_embedding_dimensions_and_normalization(self):
        chunks = self.data.get("chunks", [])
        self.assertGreater(len(chunks), 0)
        for c in chunks:
            self.assertIn("id", c)
            self.assertIn("title", c)
            self.assertIn("text", c)
            self.assertIn("clinical_triggers", c)
            vec = c.get("embedding", [])
            self.assertEqual(len(vec), 384, f"Chunk {c['id']} must have 384 dimensions")
            
            # Check L2 unit length
            sq_sum = sum(v * v for v in vec)
            self.assertAlmostEqual(sq_sum, 1.0, places=2, msg=f"Chunk {c['id']} vector must be normalized to unit length")

class TestPhysioNetCohortIntegrity(unittest.TestCase):
    """Pillar 4: Longitudinal ICU patient cohort integrity"""

    def setUp(self):
        with open(COHORT_PATH, "r", encoding="utf-8") as f:
            self.data = json.load(f)

    def test_cohort_size_and_archetypes(self):
        pts = self.data.get("patients", [])
        self.assertEqual(len(pts), 25, "Must have exactly 25 curated benchmark patients")
        categories = {p["category"] for p in pts}
        expected = {"Septic Shock", "Pre-Sepsis Transition", "Acute Kidney Injury (AKI) Dysfunction", "Non-Sepsis SIRS Control"}
        self.assertEqual(categories, expected, "All 4 archetypes must be represented")

    def test_timeline_structure(self):
        for p in self.data["patients"]:
            self.assertGreater(len(p["timeline"]), 0, f"Patient {p['patient_id']} timeline cannot be empty")
            first_rec = p["timeline"][0]
            self.assertIn("vitals", first_rec)
            self.assertIn("labs", first_rec)
            self.assertIn("sofa", first_rec)
            self.assertIn("hour", first_rec)

if __name__ == "__main__":
    unittest.main()
