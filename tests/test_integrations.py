import json
import os
import unittest


class TestColleagueAndPredictiveIntegrations(unittest.TestCase):
    def test_scaler_json_validity(self):
        for path in [os.path.join("data", "scaler.json"), os.path.join("app", "data", "scaler.json")]:
            self.assertTrue(os.path.exists(path), f"Missing {path}")
            with open(path, "r", encoding="utf-8") as f:
                scaler = json.load(f)
            for col in ["HR", "MAP", "Resp", "Creatinine", "Platelets", "BUN", "WBC"]:
                self.assertIn(col, scaler)
                self.assertGreater(scaler[col]["sd"], 0)
                self.assertGreater(scaler[col]["n_obs"], 100)

    def test_colleague_cohort_and_notes(self):
        path = os.path.join("app", "data", "colleague_cohort.json")
        self.assertTrue(os.path.exists(path), f"Missing {path}")
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data["total_patients"], 24)
        self.assertEqual(len(data["patients"]), 24)
        for pt in data["patients"]:
            self.assertTrue(pt["progress_note"], f"Empty progress note for {pt['short_id']}")
            self.assertGreaterEqual(len(pt["timeline"]), 8)
            first_hr = pt["timeline"][0]
            self.assertIsNotNone(first_hr["vitals"]["hr"])
            self.assertIsNotNone(first_hr["vitals"]["map"])
            self.assertIn("HR", first_hr["z_scores"])

    def test_predictive_model_artifact(self):
        path = os.path.join("app", "data", "predictive_model.json")
        self.assertTrue(os.path.exists(path), f"Missing {path}")
        with open(path, "r", encoding="utf-8") as f:
            model = json.load(f)
        self.assertIn("logistic_regression", model)
        self.assertIn("neural_network", model)
        self.assertGreaterEqual(len(model["neural_network"]["folds"]), 3)
        self.assertIn("ensemble", model)
        auroc = model["ensemble"]["test_metrics"]["auroc"]
        self.assertGreaterEqual(auroc, 0.75, f"Test AUROC too low: {auroc}")
        self.assertEqual(len(model["features"]), len(model["logistic_regression"]["weights"]))


if __name__ == "__main__":
    unittest.main()
