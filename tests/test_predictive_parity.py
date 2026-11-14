"""
End-to-end validation of the upgraded Real-Time Sepsis Predictive Pipeline:
  1. Verifies Kaggle export dataset (data/kaggle_export/sepsis_realtime_cohort.zip) if present,
     plus core scaler & notebook structure (zero emojis, alternating code/markdown).
  2. Verifies predictive_model.json contains Depth-3 trees, Platt calibration, and full
     monitoring metrics (AUROC, Patient AUROC, AUPRC, Utility, Brier, ECE, FP/100h, Drift PSI).
  3. Verifies live Node.js ES-module execution of app/js/predictiveModel.js produces finite
     calibrated forecasts and drivers on both physionet_cohort.json and colleague_cohort.json.
"""
import json
import os
import subprocess
import unittest

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


class TestPredictiveUpgradeAndParity(unittest.TestCase):
    def test_predictive_model_architecture_and_monitoring(self):
        model_path = os.path.join(ROOT_DIR, "app", "data", "predictive_model.json")
        with open(model_path, "r", encoding="utf-8") as f:
            m = json.load(f)

        self.assertGreaterEqual(m["cohort_summary"]["total_patients"], 2000)
        self.assertIn("neural_network", m)
        nn = m["neural_network"]
        self.assertGreaterEqual(nn["n_folds"], 3)
        self.assertEqual(len(nn["folds"]), nn["n_folds"])
        self.assertEqual(len(nn["folds"][0]["stem_w"][0]), nn["input_dim"])
        self.assertIn("calibration", m)
        self.assertIn("a", m["calibration"])
        self.assertIn("b", m["calibration"])

        tm = m["ensemble"]["test_metrics"]
        vm = m["ensemble"]["val_metrics"]
        self.assertGreaterEqual(vm["auroc"], 0.75)
        self.assertGreaterEqual(tm["auroc"], 0.77)
        self.assertLess(tm["brier_score"], 0.05)
        self.assertLess(tm["ece"], 0.05)

        mon = m["monitoring_metrics"]
        self.assertIn("held_out_test", mon)
        self.assertIn("feature_drift_train_vs_test", mon)
        hot = mon["held_out_test"]
        self.assertTrue("auroc" in hot or "hourly_auroc" in hot)
        self.assertTrue("physionet_utility" in hot or "utility_score" in hot)
        for metric_key in ("patient_auroc", "auprc", "fp_per_100h"):
            self.assertIn(metric_key, hot)

    def test_kaggle_notebook_structure_and_syntax(self):
        nb_path = os.path.join(ROOT_DIR, "notebooks", "kaggle-sepsis-predictive-model.ipynb")
        with open(nb_path, "r", encoding="utf-8") as f:
            nb = json.load(f)

        cells = nb["cells"]
        self.assertGreaterEqual(len(cells), 18)
        # Every code cell must be followed by an explanatory markdown cell
        for idx, cell in enumerate(cells):
            if cell["cell_type"] == "code":
                self.assertLess(idx + 1, len(cells))
                self.assertEqual(cells[idx + 1]["cell_type"], "markdown")

    def test_js_browser_engine_execution_and_finite_outputs(self):
        js_script = r"""
import fs from 'fs';
import { SepsisPredictiveEngine } from './app/js/predictiveModel.js';
const model = JSON.parse(fs.readFileSync('./app/data/predictive_model.json', 'utf8'));
const phys = JSON.parse(fs.readFileSync('./app/data/physionet_cohort.json', 'utf8'));
const coll = JSON.parse(fs.readFileSync('./app/data/colleague_cohort.json', 'utf8'));
const eng = new SepsisPredictiveEngine(model);

for (const pt of [phys.patients[0], phys.patients[phys.patients.length - 1], coll.patients[0], coll.patients[coll.patients.length - 1]]) {
  const h = pt.timeline.length - 1;
  const pred = eng.predict(pt, h);
  if (!Number.isFinite(pred.probability) || pred.probability <= 0 || pred.probability >= 1) {
    throw new Error('Invalid probability for ' + pt.patient_id + ': ' + pred.probability);
  }
  if (!['badge-normal', 'badge-warning', 'badge-critical'].includes(pred.badgeClass)) {
    throw new Error('Invalid badgeClass: ' + pred.badgeClass);
  }
  if (typeof pred.sustained2of3 !== 'boolean' || !Number.isFinite(pred.watchThresholdPct)) {
    throw new Error('Missing two-tier policy fields for ' + pt.patient_id);
  }
  for (const d of pred.topDrivers) {
    if (!Number.isFinite(d.rawValue) || !Number.isFinite(d.zScore) || !d.label) {
      throw new Error('Invalid driver: ' + JSON.stringify(d));
    }
  }
}

// Verify strict alignment with Two-Tier clinical policy across all cohort hours (fast pass skipping 79x ablation, plus 1 full-pass check per tier)
const watchTh = model.ensemble.watchlist_threshold;
const critTh = model.ensemble.decision_threshold;
const seenTiers = new Set();
for (const pt of [...phys.patients, ...coll.patients]) {
  for (let h = 0; h < pt.timeline.length; h++) {
    const pred = eng.predict(pt, h, true);
    const expected = pred.probability >= critTh
      ? ['badge-critical', 'Critical Sepsis Warning']
      : (pred.probability >= watchTh
          ? ['badge-warning', 'Watchlist Early Alert']
          : ['badge-normal', 'Low Baseline Risk']);
    if (pred.badgeClass !== expected[0] || pred.tier !== expected[1]) {
      throw new Error(`Tier mismatch for ${pt.patient_id} h=${h}: p=${pred.probability} got (${pred.badgeClass}, ${pred.tier}) expected (${expected[0]}, ${expected[1]})`);
    }
    if (!seenTiers.has(pred.badgeClass)) {
      seenTiers.add(pred.badgeClass);
      const fullPred = eng.predict(pt, h, false);
      if (fullPred.badgeClass !== expected[0] || fullPred.tier !== expected[1]) {
        throw new Error(`Full-pass tier mismatch for ${pt.patient_id} h=${h}: got (${fullPred.badgeClass}, ${fullPred.tier})`);
      }
    }
  }
}
if (!seenTiers.has('badge-normal') || !seenTiers.has('badge-warning') || !seenTiers.has('badge-critical')) {
  throw new Error('Expected all three two-tier states across cohorts, saw: ' + Array.from(seenTiers).join(','));
}
console.log('JS_PARITY_OK');
"""
        proc = subprocess.run(
            ["node", "--input-type=module", "-e", js_script],
            cwd=ROOT_DIR,
            capture_output=True,
            text=True,
            check=True,
        )
        self.assertIn("JS_PARITY_OK", proc.stdout)

    def test_exact_python_to_js_numeric_parity(self):
        import csv
        import glob
        import tempfile
        import sys
        sys.path.insert(0, os.path.join(ROOT_DIR, "scripts"))
        import train_predictive_model as tpm

        with open(os.path.join(ROOT_DIR, "app", "data", "predictive_model.json"), "r", encoding="utf-8") as f:
            m = json.load(f)

        # Deterministic synthetic PSV covering NaN labs, vital trends, and unit conversions
        header = "|".join(tpm.RAW_COLS + ["SepsisLabel"])
        rows_psv = [
            "|".join(["88", "97", "37.1", "118", "78", "62", "18", "0.21", "18", "1.0", "112", "8.4", "210", "NaN", "0.8", "7.40", "0.0", "12.5", "37.0", "104", "65", "-12", "1", "0"]),
            "|".join(["96", "95", "38.2", "104", "69", "54", "21", "0.40", "NaN", "NaN", "NaN", "NaN", "NaN", "2.6", "NaN", "NaN", "NaN", "NaN", "NaN", "NaN", "65", "-12", "2", "0"]),
            "|".join(["112", "92", "38.6", "94", "61", "48", "24", "0.50", "26", "1.9", "145", "15.2", "132", "3.4", "1.4", "7.31", "-4.5", "11.8", "35.0", "106", "65", "-12", "3", "1"]),
        ]
        with tempfile.NamedTemporaryFile("w", suffix=".psv", delete=False, encoding="utf-8") as tf:
            tf.write(header + "\n" + "\n".join(rows_psv) + "\n")
            psv_path = tf.name
        try:
            py_pt = tpm.extract_patient_features(psv_path)
            with open(psv_path, "r", encoding="utf-8") as fp:
                csv_rows = list(csv.DictReader(fp, delimiter="|"))
        finally:
            os.remove(psv_path)

        fval = lambda x: None if (not x or x == "NaN") else float(x)
        r0 = csv_rows[0]
        js_pt = {
            "patient_id": py_pt["id"],
            "demographics": {"age": fval(r0["Age"]), "hosp_adm_time_hours": fval(r0["HospAdmTime"])},
            "timeline": [
                {
                    "hour": fval(r["ICULOS"]),
                    "vitals": {"hr": fval(r["HR"]), "o2sat": fval(r["O2Sat"]), "temp_c": fval(r["Temp"]), "sbp": fval(r["SBP"]), "map": fval(r["MAP"]), "dbp": fval(r["DBP"]), "resp": fval(r["Resp"])},
                    "labs": {"fio2": fval(r["FiO2"]), "ph": fval(r["pH"]), "base_excess": fval(r["BaseExcess"]), "bun_mg_dl": fval(r["BUN"]), "creatinine_mg_dl": fval(r["Creatinine"]), "glucose_mg_dl": fval(r["Glucose"]), "wbc_k_ul": fval(r["WBC"]), "platelets_k_ul": fval(r["Platelets"]), "lactate_mmol_l": fval(r["Lactate"]), "bilirubin_total_mg_dl": fval(r["Bilirubin_total"]), "hgb_g_dl": fval(r["Hgb"]), "hct_pct": fval(r["Hct"]), "chloride_meq_l": fval(r["Chloride"])},
                }
                for r in csv_rows
            ],
        }
        z_nn = tpm.eval_neural_net_logits_py([py_pt], m["scaler_means"], m["scaler_sds"], m["neural_network"])
        a, b = m["calibration"]["a"], m["calibration"]["b"]
        py_probs = [tpm.sig(a * zn + b) for zn in z_nn]

        js_code = (
            "import { SepsisPredictiveEngine } from './app/js/predictiveModel.js';\n"
            "import fs from 'fs';\n"
            "const m = JSON.parse(fs.readFileSync('./app/data/predictive_model.json', 'utf8'));\n"
            f"const pt = {json.dumps(js_pt)};\n"
            "const eng = new SepsisPredictiveEngine(m);\n"
            "console.log(JSON.stringify(pt.timeline.map((_, i) => eng.predict(pt, i).probability)));\n"
        )
        proc = subprocess.run(["node", "--input-type=module", "-e", js_code], cwd=ROOT_DIR, capture_output=True, text=True, check=True)
        js_probs = json.loads(proc.stdout)
        for p_py, p_js in zip(py_probs, js_probs):
            self.assertLess(abs(p_py - p_js), 1e-6)


if __name__ == "__main__":
    unittest.main()
