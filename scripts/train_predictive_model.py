#!/usr/bin/env python3
"""
Train & Calibrate the Real-Time 6-Hour Forward Sepsis Neural Network Model
from longitudinal PhysioNet 2019 ICU trajectories (data/physionet_2019/raw_psv/*.psv).

Architecture (PyTorch 5-Fold PLE-ResNet trainer + pure-Python stdlib inference parity with app/js/predictiveModel.js):
  1. Strict Causal Streaming Feature Extractor (79 features across vital trends,
     patient-personalized expanding baseline deviations, nonlinear clinical hinges,
     lab update cadence, and deterministic qSOFA/SIRS/SOFA/NEWS2 subscores).
  2. Non-Missing Quantile Piecewise-Linear Encoding (PLE) + Signed-Log1p + Missingness Masks.
  3. Patient-Level Stratified Split (70% Train / 15% Val / 15% Held-Out Test, zero leakage).
  4. 5-Fold StratifiedGroupKFold PLE-ResNet Neural Network (LayerNorm + SiLU + Residual Skip,
     trained with weighted BCE + Pairwise AUROC Ranking Loss) + L2 LogReg comparison baseline.
  5. 1D Platt Sigmoid Calibration (fit on Validation) + Comprehensive Clinical & ML Monitoring Suite:
     - Hourly & Patient-Level AUROC, AUPRC, Normalized PhysioNet Utility Score
     - Calibration metrics (Brier Score, 10-bin ECE)
     - Operating Threshold Sensitivity, Specificity, PPV, NPV, F1, FP per 100 Patient-Hours
     - Sepsis+ Patient Catch Rate & Median Early Lead Time (hours before t_sepsis)
     - Train-vs-Test Feature Drift Monitoring (PSI & Standardized Mean Difference)
"""
import bisect
import csv
import glob
import json
import math
import os
import random
import time
from datetime import datetime, timezone

PSV_DIR = os.path.join("data", "physionet_2019", "raw_psv")
OUT_MODEL_PATH = os.path.join("app", "data", "predictive_model.json")

RAW_COLS = [
    "HR", "O2Sat", "Temp", "SBP", "MAP", "DBP", "Resp", "FiO2",
    "BUN", "Creatinine", "Glucose", "WBC", "Platelets", "Lactate",
    "Bilirubin_total", "pH", "BaseExcess", "Hgb", "Hct", "Chloride",
    "Age", "HospAdmTime", "ICULOS",
]

FEATURES = [
    "HR", "O2Sat", "Temp", "MAP", "Resp", "SBP", "DBP",
    "BUN", "Creatinine", "Glucose", "WBC", "Platelets", "Lactate",
    "Bilirubin_total", "FiO2", "pH", "BaseExcess", "Hgb", "Hct", "Chloride",
    "Age", "HospAdmTime", "ICULOS",
    "ShockIndex", "PulsePressure", "ROX_proxy", "Shock_x_Resp", "MAP_to_Age", "BUN_Creat_ratio",
    "Temp_deviation", "Temp_high_hinge", "Temp_low_hinge",
    "WBC_high_hinge", "WBC_low_hinge", "Lactate_hinge", "Platelet_low_hinge", "Creat_high_hinge",
    "Hrs_since_Lactate", "Hrs_since_WBC", "Hrs_since_Creatinine", "Lab_update_events",
    "HR_diff_base", "MAP_diff_base", "Resp_diff_base", "Temp_diff_base", "O2Sat_diff_base", "SI_diff_base",
    "HR_delta_1h", "MAP_delta_1h",
    "HR_mean_6h", "HR_max_6h", "HR_std_6h", "HR_delta_6h", "HR_drift_12h", "HR_tachy_frac_6h",
    "MAP_min_6h", "MAP_mean_6h", "MAP_std_6h", "MAP_delta_6h", "MAP_drift_12h", "MAP_hypo_frac_6h",
    "O2Sat_min_6h", "O2Sat_mean_6h",
    "Resp_max_6h", "Resp_mean_6h", "Resp_delta_6h",
    "Temp_max_6h", "Temp_min_6h", "SI_max_6h", "SI_mean_6h",
    "Creatinine_delta", "Platelets_delta", "WBC_delta", "BUN_delta", "Lactate_delta",
    "qSOFA_partial", "SIRS_count", "SOFA_partial", "NEWS2_proxy",
]
FEAT_IDX = {f: i for i, f in enumerate(FEATURES)}


def pf(v):
    if not v or v == "NaN":
        return None
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except ValueError:
        return None


def sig(z):
    if z >= 20.0:
        return 1.0 - 1e-9
    if z <= -20.0:
        return 1e-9
    return 1.0 / (1.0 + math.exp(-z))


def news2_proxy(rp, o2, sbp, mp, hr, tp):
    pts = 0.0
    if rp is not None:
        if rp <= 8 or rp >= 25:
            pts += 3.0
        elif rp >= 21:
            pts += 2.0
        elif rp <= 11:
            pts += 1.0
    if o2 is not None:
        if o2 <= 91:
            pts += 3.0
        elif o2 <= 93:
            pts += 2.0
        elif o2 <= 95:
            pts += 1.0
    if sbp is not None:
        if sbp <= 90 or sbp >= 220:
            pts += 3.0
        elif sbp <= 100:
            pts += 2.0
        elif sbp <= 110:
            pts += 1.0
    elif mp is not None:
        if mp <= 60:
            pts += 3.0
        elif mp <= 65:
            pts += 2.0
        elif mp <= 70:
            pts += 1.0
    if hr is not None:
        if hr <= 40 or hr >= 131:
            pts += 3.0
        elif hr >= 111:
            pts += 2.0
        elif hr <= 50 or hr >= 91:
            pts += 1.0
    if tp is not None:
        if tp <= 35.0:
            pts += 3.0
        elif tp >= 39.1:
            pts += 2.0
        elif tp <= 36.0 or tp >= 38.1:
            pts += 1.0
    return pts


def sofa_partial(mp, o2, l_cr, l_plt, l_bili, l_fio2):
    cv = 1 if (mp is not None and mp < 70) else 0
    ren = 0 if l_cr is None else (4 if l_cr >= 5 else (3 if l_cr >= 3.5 else (2 if l_cr >= 2 else (1 if l_cr >= 1.2 else 0))))
    coag = 0 if l_plt is None else (4 if l_plt < 20 else (3 if l_plt < 50 else (2 if l_plt < 100 else (1 if l_plt < 150 else 0))))
    liv = 0 if l_bili is None else (4 if l_bili >= 12 else (3 if l_bili >= 6 else (2 if l_bili >= 2 else (1 if l_bili >= 1.2 else 0))))
    resp = 0
    if o2 is not None:
        f = l_fio2 if (l_fio2 is not None and l_fio2 > 0) else 0.21
        if f > 1.0:
            f /= 100.0
        rat = o2 / max(0.21, f)
        resp = 4 if rat < 100 else (3 if rat < 200 else (2 if rat < 300 else (1 if rat < 400 else 0)))
    return float(cv + ren + coag + liv + resp)


def extract_patient_features(path):
    pid = os.path.splitext(os.path.basename(path))[0]
    last = {c: None for c in RAW_COLS}
    base_lab = {}
    lab_keys = ("Lactate", "WBC", "Creatinine", "Platelets", "Bilirubin_total")
    hrs_since = {c: 24.0 for c in lab_keys}
    lab_update_events = 0.0

    hist = {"HR": [], "MAP": [], "O2Sat": [], "Resp": [], "Temp": [], "SI": []}
    exp_sum = {k: 0.0 for k in hist}
    exp_cnt = {k: 0 for k in hist}

    feat_rows = []
    labels = []
    has_sepsis = 0

    with open(path, "r", encoding="utf-8") as fp:
        for idx, r in enumerate(csv.DictReader(fp, delimiter="|")):
            y = 1 if r.get("SepsisLabel") == "1" else 0
            if y == 1:
                has_sepsis = 1

            step_vals = {c: pf(r.get(c)) for c in RAW_COLS}
            if step_vals["ICULOS"] is None:
                step_vals["ICULOS"] = float(idx + 1)

            any_lab_upd = False
            for lc in lab_keys:
                nv = step_vals[lc]
                if nv is not None and (last[lc] is None or abs(nv - last[lc]) > 1e-6):
                    hrs_since[lc] = 0.0
                    any_lab_upd = True
                else:
                    hrs_since[lc] = min(48.0, hrs_since[lc] + 1.0)
            if any_lab_upd:
                lab_update_events += 1.0

            for c in RAW_COLS:
                nv = step_vals[c]
                if nv is not None:
                    last[c] = nv
                    if c in ("Creatinine", "WBC", "Platelets", "BUN", "Lactate") and c not in base_lab:
                        base_lab[c] = nv

            hr = last["HR"]; mp = last["MAP"]; o2 = last["O2Sat"]; rp = last["Resp"]; tp = last["Temp"]
            sbp = last["SBP"]; dbp = last["DBP"]; age = last["Age"]
            si = (hr / mp) if (hr is not None and mp is not None and mp > 10.0) else None
            pp = (sbp - dbp) if (sbp is not None and dbp is not None and sbp > dbp) else None
            fio2 = last["FiO2"]
            fio2_norm = (fio2 / 100.0 if fio2 > 1.0 else fio2) if (fio2 is not None and fio2 > 0) else 0.21
            rox = ((o2 / max(0.21, fio2_norm)) / max(4.0, rp)) if (o2 is not None and rp is not None) else None

            for key, val in (("HR", hr), ("MAP", mp), ("O2Sat", o2), ("Resp", rp), ("Temp", tp), ("SI", si)):
                if val is not None:
                    hist[key].append(val)
                    exp_sum[key] += val
                    exp_cnt[key] += 1

            w_hr = hist["HR"][-6:]; w_mp = hist["MAP"][-6:]; w_o2 = hist["O2Sat"][-6:]
            w_rp = hist["Resp"][-6:]; w_tp = hist["Temp"][-6:]; w_si = hist["SI"][-6:]
            w_hr12 = hist["HR"][-12:]; w_mp12 = hist["MAP"][-12:]

            hr_m6 = sum(w_hr) / len(w_hr) if w_hr else None
            mp_m6 = sum(w_mp) / len(w_mp) if w_mp else None
            hr_std6 = math.sqrt(sum((x - hr_m6) ** 2 for x in w_hr) / len(w_hr)) if len(w_hr) >= 2 else 0.0
            mp_std6 = math.sqrt(sum((x - mp_m6) ** 2 for x in w_mp) / len(w_mp)) if len(w_mp) >= 2 else 0.0

            def exp_diff(k, cur):
                return (cur - exp_sum[k] / exp_cnt[k]) if (cur is not None and exp_cnt[k] >= 2) else 0.0

            qsofa = (1.0 if (rp is not None and rp >= 22) else 0.0) + (1.0 if ((sbp is not None and sbp <= 100) or (mp is not None and mp <= 65)) else 0.0)
            sirs = (
                (1.0 if (tp is not None and (tp > 38.0 or tp < 36.0)) else 0.0)
                + (1.0 if (hr is not None and hr > 90) else 0.0)
                + (1.0 if (rp is not None and rp > 20) else 0.0)
                + (1.0 if (last["WBC"] is not None and (last["WBC"] > 12.0 or last["WBC"] < 4.0)) else 0.0)
            )

            vec = [
                hr, o2, tp, mp, rp, sbp, dbp,
                last["BUN"], last["Creatinine"], last["Glucose"], last["WBC"], last["Platelets"], last["Lactate"],
                last["Bilirubin_total"], last["FiO2"], last["pH"], last["BaseExcess"], last["Hgb"], last["Hct"], last["Chloride"],
                age, last["HospAdmTime"], last["ICULOS"],
                si, pp, rox,
                (si * rp) if (si is not None and rp is not None) else None,
                (mp / max(20.0, age)) if (mp is not None and age is not None) else None,
                (last["BUN"] / max(0.2, last["Creatinine"])) if (last["BUN"] is not None and last["Creatinine"] is not None) else None,
                abs(tp - 37.0) if tp is not None else None,
                max(0.0, tp - 38.0) if tp is not None else 0.0,
                max(0.0, 36.0 - tp) if tp is not None else 0.0,
                max(0.0, last["WBC"] - 12.0) if last["WBC"] is not None else 0.0,
                max(0.0, 4.0 - last["WBC"]) if last["WBC"] is not None else 0.0,
                max(0.0, last["Lactate"] - 2.0) if last["Lactate"] is not None else 0.0,
                max(0.0, 150.0 - last["Platelets"]) if last["Platelets"] is not None else 0.0,
                max(0.0, last["Creatinine"] - 1.2) if last["Creatinine"] is not None else 0.0,
                hrs_since["Lactate"], hrs_since["WBC"], hrs_since["Creatinine"], lab_update_events,
                exp_diff("HR", hr), exp_diff("MAP", mp), exp_diff("Resp", rp), exp_diff("Temp", tp), exp_diff("O2Sat", o2), exp_diff("SI", si),
                (w_hr[-1] - w_hr[-2]) if len(w_hr) >= 2 else 0.0,
                (w_mp[-1] - w_mp[-2]) if len(w_mp) >= 2 else 0.0,
                hr_m6, max(w_hr) if w_hr else None, hr_std6,
                (w_hr[-1] - w_hr[0]) if len(w_hr) >= 2 else 0.0,
                (w_hr[-1] - sum(w_hr12) / len(w_hr12)) if len(w_hr12) >= 2 else 0.0,
                sum(1 for x in w_hr if x > 100.0) / len(w_hr) if w_hr else 0.0,
                min(w_mp) if w_mp else None, mp_m6, mp_std6,
                (w_mp[-1] - w_mp[0]) if len(w_mp) >= 2 else 0.0,
                (w_mp[-1] - sum(w_mp12) / len(w_mp12)) if len(w_mp12) >= 2 else 0.0,
                sum(1 for x in w_mp if x < 65.0) / len(w_mp) if w_mp else 0.0,
                min(w_o2) if w_o2 else None, sum(w_o2) / len(w_o2) if w_o2 else None,
                max(w_rp) if w_rp else None, sum(w_rp) / len(w_rp) if w_rp else None,
                (w_rp[-1] - w_rp[0]) if len(w_rp) >= 2 else 0.0,
                max(w_tp) if w_tp else None, min(w_tp) if w_tp else None,
                max(w_si) if w_si else None, sum(w_si) / len(w_si) if w_si else None,
                (last["Creatinine"] - base_lab["Creatinine"]) if ("Creatinine" in base_lab and last["Creatinine"] is not None) else 0.0,
                (last["Platelets"] - base_lab["Platelets"]) if ("Platelets" in base_lab and last["Platelets"] is not None) else 0.0,
                (last["WBC"] - base_lab["WBC"]) if ("WBC" in base_lab and last["WBC"] is not None) else 0.0,
                (last["BUN"] - base_lab["BUN"]) if ("BUN" in base_lab and last["BUN"] is not None) else 0.0,
                (last["Lactate"] - base_lab["Lactate"]) if ("Lactate" in base_lab and last["Lactate"] is not None) else 0.0,
                qsofa, sirs,
                sofa_partial(mp, o2, last["Creatinine"], last["Platelets"], last["Bilirubin_total"], last["FiO2"]),
                news2_proxy(rp, o2, sbp, mp, hr, tp),
            ]
            feat_rows.append(vec)
            labels.append(y)

    return {"id": pid, "has_sepsis": has_sepsis, "X": feat_rows, "y": labels}


def load_cohort():
    files = sorted(glob.glob(os.path.join(PSV_DIR, "*.psv")))
    if not files:
        raise FileNotFoundError(f"No .psv files found in {PSV_DIR}")
    return [extract_patient_features(p) for p in files]


def fit_scaler(pts):
    m = len(FEATURES)
    sums = [0.0] * m
    sum_sq = [0.0] * m
    cnts = [0] * m
    for p in pts:
        for row in p["X"]:
            for j in range(m):
                v = row[j]
                if v is not None:
                    sums[j] += v
                    sum_sq[j] += v * v
                    cnts[j] += 1
    means, sds = {}, {}
    for j, f in enumerate(FEATURES):
        n = cnts[j]
        mu = sums[j] / n if n > 0 else 0.0
        var = max(1e-8, (sum_sq[j] / n - mu * mu) if n > 1 else 1.0)
        means[f] = round(mu, 5)
        sds[f] = round(max(1e-4, math.sqrt(var)), 5)
    return means, sds


def vectorize(pts, means, sds):
    m_list = [means[f] for f in FEATURES]
    s_list = [sds[f] for f in FEATURES]
    Xz, Xt, y_out = [], [], []
    m = len(FEATURES)
    for p in pts:
        for row, lbl in zip(p["X"], p["y"]):
            rz = [0.0] * m
            rt = [None] * m
            for j in range(m):
                v = row[j]
                if v is not None:
                    z = (v - m_list[j]) / s_list[j]
                    z = 5.0 if z > 5.0 else (-5.0 if z < -5.0 else z)
                    rz[j] = z
                    rt[j] = z
            Xz.append(rz)
            Xt.append(rt)
            y_out.append(lbl)
    return Xz, Xt, y_out


def train_adam_logreg(Xz, ytr, rng, l2_reg=15.0, epochs=22):
    m = len(FEATURES)
    pos_idx = [i for i, y in enumerate(ytr) if y == 1]
    neg_idx = [i for i, y in enumerate(ytr) if y == 0]
    step_neg = max(1, len(neg_idx) // max(4500, 3 * len(pos_idx)))
    sub = pos_idx + neg_idx[::step_neg]
    rng.shuffle(sub)
    n_sub = len(sub)
    wp = n_sub / (2.0 * max(1, len(pos_idx)))
    wn = n_sub / (2.0 * max(1, n_sub - len(pos_idx)))

    w = [0.0] * m
    b = 0.0
    mw = [0.0] * m
    vw = [0.0] * m
    mb = vb = 0.0
    for ep in range(1, epochs + 1):
        gw = [0.0] * m
        gb = 0.0
        for i in sub:
            r = Xz[i]
            y = ytr[i]
            z = b
            for j in range(m):
                rj = r[j]
                if rj != 0.0:
                    z += w[j] * rj
            err = (wp if y == 1 else wn) * (sig(z) - y)
            gb += err
            for j in range(m):
                rj = r[j]
                if rj != 0.0:
                    gw[j] += err * rj
        gb /= n_sub
        mb = 0.9 * mb + 0.1 * gb
        vb = 0.999 * vb + 0.001 * (gb * gb)
        b -= 0.06 * (mb / (1.0 - 0.9 ** ep)) / (math.sqrt(vb / (1.0 - 0.999 ** ep)) + 1e-8)
        for j in range(m):
            gj = gw[j] / n_sub + l2_reg * w[j] / n_sub
            mw[j] = 0.9 * mw[j] + 0.1 * gj
            vw[j] = 0.999 * vw[j] + 0.001 * (gj * gj)
            w[j] -= 0.06 * (mw[j] / (1.0 - 0.9 ** ep)) / (math.sqrt(vw[j] / (1.0 - 0.999 ** ep)) + 1e-8)
    return b, w


PLE_FEATS = [
    "HR", "O2Sat", "Temp", "MAP", "Resp", "SBP", "BUN", "Creatinine", "Glucose",
    "WBC", "Platelets", "Lactate", "Bilirubin_total", "FiO2", "pH", "Hgb",
    "Age", "HospAdmTime", "ICULOS", "ShockIndex", "ROX_proxy",
    "Hrs_since_Lactate", "Hrs_since_WBC", "Lab_update_events",
    "HR_diff_base", "MAP_diff_base", "Resp_diff_base", "Temp_diff_base",
]
N_RAW_MISS = 20


def fit_ple_specs(tr_pts, means, sds, n_bins=6):
    qs = [k / n_bins for k in range(n_bins + 1)]
    specs = []
    for fname in PLE_FEATS:
        j = FEAT_IDX[fname]
        mu = means[fname]
        sd = sds[fname]
        obs = []
        for p in tr_pts:
            for row in p["X"]:
                v = row[j]
                if v is not None:
                    z = (v - mu) / sd
                    z = 5.0 if z > 5.0 else (-5.0 if z < -5.0 else z)
                    obs.append(z)
        if len(obs) < 20:
            continue
        obs.sort()
        n = len(obs)
        edges = sorted(set(round(obs[int(q * (n - 1))], 5) for q in qs))
        if len(edges) >= 3:
            specs.append({"f": j, "name": fname, "edges": edges})
    return specs


def encode_ple_row(row_raw, means, sds, ple_specs):
    """Pure-Python stdlib PLE + signed-log1p + missingness encoder (1:1 parity with JS)."""
    m = len(FEATURES)
    z_vec = [0.0] * m
    z_sl = [0.0] * m
    miss = [0.0] * N_RAW_MISS
    for j in range(m):
        fname = FEATURES[j]
        v = row_raw[j]
        if v is None:
            if j < N_RAW_MISS:
                miss[j] = 1.0
        else:
            z = (v - means[fname]) / sds[fname]
            z = 5.0 if z > 5.0 else (-5.0 if z < -5.0 else z)
            z_vec[j] = z
            z_sl[j] = math.log1p(z) if z >= 0.0 else -math.log1p(-z)
    out = z_sl + miss
    for sp in ple_specs:
        j = sp["f"]
        edges = sp["edges"]
        is_miss = j < N_RAW_MISS and miss[j] > 0.5
        col_z = z_vec[j]
        for b in range(len(edges) - 1):
            if is_miss:
                out.append(0.0)
            else:
                lo, hi = edges[b], edges[b + 1]
                denom = max(1e-5, hi - lo)
                val = (col_z - lo) / denom
                out.append(1.0 if val > 1.0 else (0.0 if val < 0.0 else val))
    return out


def _layer_norm_py(vec, gamma, beta, eps=1e-5):
    n = len(vec)
    mu = sum(vec) / n
    var = sum((v - mu) * (v - mu) for v in vec) / n
    inv = 1.0 / math.sqrt(var + eps)
    return [((vec[i] - mu) * inv) * gamma[i] + beta[i] for i in range(n)]


def _linear_py(vec, weights_2d, bias_1d):
    return [
        bias_1d[o] + sum(weights_2d[o][i] * vec[i] for i in range(len(vec)))
        for o in range(len(weights_2d))
    ]


def _silu_py(vec):
    return [v * sig(v) for v in vec]


def eval_nn_fold_py(x_vec, fold_w, eps=1e-5, skip_scale=0.5):
    h = _linear_py(x_vec, fold_w["stem_w"], fold_w["stem_b"])
    h = _layer_norm_py(h, fold_w["stem_ln_g"], fold_w["stem_ln_b"], eps)
    h = _silu_py(h)

    r1 = _linear_py(h, fold_w["b1_fc1_w"], fold_w["b1_fc1_b"])
    r1 = _layer_norm_py(r1, fold_w["b1_ln_g"], fold_w["b1_ln_b"], eps)
    r1 = _silu_py(r1)
    r1 = _linear_py(r1, fold_w["b1_fc2_w"], fold_w["b1_fc2_b"])
    h = [h[i] + r1[i] for i in range(len(h))]

    r2 = _linear_py(h, fold_w["b2_fc1_w"], fold_w["b2_fc1_b"])
    r2 = _layer_norm_py(r2, fold_w["b2_ln_g"], fold_w["b2_ln_b"], eps)
    r2 = _silu_py(r2)
    r2 = _linear_py(r2, fold_w["b2_fc2_w"], fold_w["b2_fc2_b"])
    h = [h[i] + r2[i] for i in range(len(h))]

    head = fold_w["head_b"] + sum(fold_w["head_w"][i] * h[i] for i in range(len(h)))
    skip = fold_w["skip_b"] + sum(fold_w["skip_w"][i] * x_vec[i] for i in range(len(x_vec)))
    return head + skip_scale * skip


def eval_neural_net_logits_py(pts, means, sds, nn_art):
    ple_specs = nn_art["ple_specs"]
    folds = nn_art["folds"]
    eps = nn_art.get("layernorm_eps", 1e-5)
    skip_scale = nn_art.get("skip_scale", 0.5)
    logits = []
    for p in pts:
        for row in p["X"]:
            x_vec = encode_ple_row(row, means, sds, ple_specs)
            s = sum(eval_nn_fold_py(x_vec, fw, eps=eps, skip_scale=skip_scale) for fw in folds) / len(folds)
            logits.append(s)
    return logits


def train_neural_resnet_torch(tr_pts, va_pts, te_pts, means, sds, ple_specs, hid=64, drop=0.45, epochs=14):
    try:
        import numpy as np
        import torch
        import torch.nn as nn
        import torch.nn.functional as F
        from sklearn.model_selection import StratifiedGroupKFold
        from sklearn.metrics import roc_auc_score
    except ImportError as exc:
        raise RuntimeError(
            "PyTorch + numpy + scikit-learn are required to train the Neural Network "
            "(run with C:\\Anaconda\\python.exe scripts/train_predictive_model.py locally or in Kaggle)."
        ) from exc

    torch.manual_seed(42)
    np.random.seed(42)
    torch.set_num_threads(4)

    m_list = np.array([means[f] for f in FEATURES], dtype=np.float32)
    s_list = np.array([sds[f] for f in FEATURES], dtype=np.float32)

    def encode_pts_np(pts_list):
        rows, ys, gs = [], [], []
        for p_idx, p in enumerate(pts_list):
            arr = np.array([[np.nan if v is None else v for v in r] for r in p["X"]], dtype=np.float32)
            miss = np.isnan(arr[:, :N_RAW_MISS]).astype(np.float32)
            z = np.clip(np.where(np.isnan(arr), 0.0, (arr - m_list) / s_list), -5.0, 5.0)
            z_sl = np.sign(z) * np.log1p(np.abs(z)).astype(np.float32)
            parts = [z_sl, miss]
            for sp in ple_specs:
                j = sp["f"]
                ed = np.array(sp["edges"], dtype=np.float32)
                col = z[:, j : j + 1]
                enc = np.clip((col - ed[:-1][None, :]) / np.maximum(1e-5, ed[1:][None, :] - ed[:-1][None, :]), 0.0, 1.0).astype(np.float32)
                if j < N_RAW_MISS:
                    enc = enc * (1.0 - miss[:, j : j + 1])
                parts.append(enc)
            rows.append(np.concatenate(parts, axis=1))
            ys.append(np.array(p["y"], dtype=np.float32))
            gs.append(np.full(len(p["y"]), p_idx, dtype=np.int32))
        return np.concatenate(rows, axis=0), np.concatenate(ys, axis=0), np.concatenate(gs, axis=0)

    X_tr, y_tr, g_tr = encode_pts_np(tr_pts)
    X_va, y_va, _ = encode_pts_np(va_pts)
    X_te, y_te, _ = encode_pts_np(te_pts)
    d_in = int(X_tr.shape[1])

    class NeuralResNet(nn.Module):
        def __init__(self):
            super().__init__()
            self.stem = nn.Sequential(nn.Linear(d_in, hid), nn.LayerNorm(hid), nn.SiLU(), nn.Dropout(drop))
            self.b1 = nn.Sequential(nn.Linear(hid, hid), nn.LayerNorm(hid), nn.SiLU(), nn.Dropout(drop), nn.Linear(hid, hid))
            self.b2 = nn.Sequential(nn.Linear(hid, hid), nn.LayerNorm(hid), nn.SiLU(), nn.Dropout(drop), nn.Linear(hid, hid))
            self.head = nn.Linear(hid, 1)
            self.skip = nn.Linear(d_in, 1)

        def forward(self, x):
            h = self.stem(x)
            h = h + self.b1(h)
            h = h + self.b2(h)
            return (self.head(h) + 0.5 * self.skip(x)).squeeze(-1)

    def hybrid_loss(logits, y, pos_wt=6.0):
        w = torch.where(y > 0.5, torch.tensor(pos_wt, device=y.device), torch.tensor(1.0, device=y.device))
        bce = (F.binary_cross_entropy_with_logits(logits, y, reduction="none") * w).mean()
        pos = logits[y > 0.5]
        neg = logits[y < 0.5]
        if len(pos) > 0 and len(neg) > 0:
            if len(neg) > 256:
                neg = neg[:256]
            return 0.55 * bce + 0.45 * F.softplus(-(pos[:, None] - neg[None, :]) / 1.5).mean()
        return bce

    X_va_t = torch.from_numpy(X_va)
    X_te_t = torch.from_numpy(X_te)
    sgkf = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)

    exported_folds, va_fold_logits, te_fold_logits = [], [], []
    input_grad_acc = np.zeros(len(FEATURES), dtype=np.float64)

    def r2d(t):
        return [[round(float(v), 5) for v in row] for row in t.detach().cpu().numpy()]

    def r1d(t):
        return [round(float(v), 5) for v in t.detach().cpu().numpy().ravel()]

    for fold, (ti, fi) in enumerate(sgkf.split(X_tr, y_tr, groups=g_tr), 1):
        torch.manual_seed(300 + fold)
        Xt_f = torch.from_numpy(X_tr[ti])
        yt_f = torch.from_numpy(y_tr[ti])
        Xf_v = torch.from_numpy(X_tr[fi])
        yf_v = y_tr[fi]

        model = NeuralResNet()
        opt = torch.optim.AdamW(model.parameters(), lr=1.8e-3, weight_decay=2.5e-2)
        sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=epochs)
        best_auc, best_st = -1.0, None
        for _ in range(epochs):
            model.train()
            perm = torch.randperm(len(Xt_f))
            for k in range(0, len(Xt_f), 2048):
                idx = perm[k : k + 2048]
                xb, yb = Xt_f[idx], yt_f[idx]
                xb_in = torch.cat([xb[:, : len(FEATURES)] + torch.randn_like(xb[:, : len(FEATURES)]) * 0.08, xb[:, len(FEATURES) :]], dim=-1)
                opt.zero_grad()
                loss = hybrid_loss(model(xb_in), yb, pos_wt=6.0)
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.5)
                opt.step()
            sched.step()
            model.eval()
            with torch.no_grad():
                fl = model(Xf_v).numpy()
            fa = roc_auc_score(yf_v, 1.0 / (1.0 + np.exp(-np.clip(fl, -20.0, 20.0))))
            if fa > best_auc:
                best_auc = fa
                best_st = {k: v.clone() for k, v in model.state_dict().items()}

        model.load_state_dict(best_st)
        model.eval()
        with torch.no_grad():
            va_fold_logits.append(model(X_va_t).numpy())
            te_fold_logits.append(model(X_te_t).numpy())

        x_sal = X_va_t[:2048].clone().detach().requires_grad_(True)
        out_sal = model(x_sal).sum()
        out_sal.backward()
        input_grad_acc += np.mean(np.abs(x_sal.grad[:, : len(FEATURES)].detach().cpu().numpy()), axis=0)

        sd = model.state_dict()
        exported_folds.append({
            "fold_val_auroc": round(float(best_auc), 4),
            "stem_w": r2d(sd["stem.0.weight"]),
            "stem_b": r1d(sd["stem.0.bias"]),
            "stem_ln_g": r1d(sd["stem.1.weight"]),
            "stem_ln_b": r1d(sd["stem.1.bias"]),
            "b1_fc1_w": r2d(sd["b1.0.weight"]),
            "b1_fc1_b": r1d(sd["b1.0.bias"]),
            "b1_ln_g": r1d(sd["b1.1.weight"]),
            "b1_ln_b": r1d(sd["b1.1.bias"]),
            "b1_fc2_w": r2d(sd["b1.4.weight"]),
            "b1_fc2_b": r1d(sd["b1.4.bias"]),
            "b2_fc1_w": r2d(sd["b2.0.weight"]),
            "b2_fc1_b": r1d(sd["b2.0.bias"]),
            "b2_ln_g": r1d(sd["b2.1.weight"]),
            "b2_ln_b": r1d(sd["b2.1.bias"]),
            "b2_fc2_w": r2d(sd["b2.4.weight"]),
            "b2_fc2_b": r1d(sd["b2.4.bias"]),
            "head_w": r1d(sd["head.weight"]),
            "head_b": round(float(sd["head.bias"].item()), 5),
            "skip_w": r1d(sd["skip.weight"]),
            "skip_b": round(float(sd["skip.bias"].item()), 5),
        })
        print(f"  [PLE-ResNet Fold {fold}/5] fold_val AUROC={best_auc:.4f}", flush=True)

    nn_artifact = {
        "architecture": f"5-Fold PLE-ResNet (LayerNorm + SiLU + Residual Skip, hid={hid})",
        "input_dim": d_in,
        "hidden_dim": hid,
        "n_folds": len(exported_folds),
        "n_params_per_fold": int(sum(p.numel() for p in NeuralResNet().parameters())),
        "layernorm_eps": 1e-5,
        "skip_scale": 0.5,
        "ple_specs": ple_specs,
        "folds": exported_folds,
        "top_saliency_features": sorted(
            [{"feature": FEATURES[j], "mean_abs_grad": round(float(input_grad_acc[j] / len(exported_folds)), 5)} for j in range(len(FEATURES))],
            key=lambda d: d["mean_abs_grad"],
            reverse=True,
        )[:15],
    }

    z_va = np.mean(va_fold_logits, axis=0).tolist()
    z_te = np.mean(te_fold_logits, axis=0).tolist()

    py_chk = eval_neural_net_logits_py(te_pts[:3], means, sds, nn_artifact)
    max_diff = max(abs(a - b) for a, b in zip(py_chk, z_te[: len(py_chk)]))
    assert max_diff < 1e-3, f"PyTorch vs Pure-Python serialized NN parity mismatch: {max_diff}"
    print(f"Verified PyTorch-to-JSON Neural Network forward parity (max logit diff={max_diff:.6f})")

    return nn_artifact, z_va, z_te


def eval_lr_logits(Xz, b, w):
    m = len(w)
    return [b + sum(w[j] * r[j] for j in range(m)) for r in Xz]


def fit_platt(logits, y_true):
    a = 1.0
    c = -3.0
    n = len(y_true)
    for ep in range(70):
        ga = gc = 0.0
        for z, y in zip(logits, y_true):
            d = sig(a * z + c) - y
            ga += d * z
            gc += d
        step = 0.8 / (1.0 + 0.05 * ep)
        a -= step * (ga / n + 0.01 * (a - 1.0))
        c -= step * (gc / n)
    return round(a, 6), round(c, 6)


def physionet_utility(ys, preds):
    has_sep = any(y == 1 for y in ys)
    t_sep = (next(i for i, y in enumerate(ys) if y == 1) + 6) if has_sep else None
    u = u_opt = u_null = 0.0
    for t, pr in enumerate(preds):
        if has_sep:
            dt = t - t_sep
            if -12 <= dt <= -6:
                wt, wn_ = (dt + 12) / 6.0, 0.0
            elif -6 < dt <= 0:
                wt, wn_ = 1.0, -2.0 * (dt + 6) / 6.0
            elif 0 < dt <= 3:
                wt, wn_ = 1.0 - dt / 3.0, -2.0
            elif dt < -12:
                wt, wn_ = -0.05, 0.0
            else:
                wt, wn_ = 0.0, 0.0
        else:
            wt, wn_ = -0.05, 0.0
        u += wt if pr == 1 else wn_
        u_opt += max(wt, wn_)
        u_null += wn_
    return u, u_opt, u_null


def _persist_2of3(ps, th):
    hits = [1 if pr >= th else 0 for pr in ps]
    return [1 if sum(hits[max(0, t - 2) : t + 1]) >= 2 else 0 for t in range(len(hits))]


def compute_monitoring_metrics(sub_pts, probs, threshold=None, watchlist_threshold=None, max_fp_per_100h=5.0):
    y_all = [lbl for p in sub_pts for lbl in p["y"]]
    pairs = sorted(zip(probs, y_all), key=lambda t: t[0], reverse=True)
    P = sum(y_all)
    N = len(y_all) - P
    tp = fp = 0
    p_tpr = p_fpr = 0.0
    auroc = auprc = 0.0
    p_rec = 0.0
    for _, lb in pairs:
        if lb == 1:
            tp += 1
        else:
            fp += 1
        tpr = tp / max(1, P)
        fpr = fp / max(1, N)
        prec = tp / max(1, tp + fp)
        auroc += 0.5 * (tpr + p_tpr) * (fpr - p_fpr)
        if tpr > p_rec:
            auprc += prec * (tpr - p_rec)
            p_rec = tpr
        p_tpr, p_fpr = tpr, fpr

    brier = sum((p - y) ** 2 for p, y in zip(probs, y_all)) / max(1, len(y_all))
    ece = 0.0
    for bi in range(10):
        lo, hi = bi / 10.0, (bi + 1) / 10.0
        idxs = [k for k, pr in enumerate(probs) if (lo <= pr < hi) or (bi == 9 and pr == 1.0)]
        if idxs:
            acc = sum(y_all[k] for k in idxs) / len(idxs)
            conf = sum(probs[k] for k in idxs) / len(idxs)
            ece += (len(idxs) / len(y_all)) * abs(acc - conf)

    # 1. Watchlist threshold: optimizes PhysioNet utility (passive nurse surveillance)
    watch_th = watchlist_threshold
    if watch_th is None:
        qs = sorted(set(probs[k] for k in range(0, len(probs), max(1, len(probs) // 300))))
        best_u = -1e9
        for cand in [q for q in qs if 0.015 <= q <= 0.40]:
            u_s = uo_s = un_s = 0.0
            idx = 0
            for p in sub_pts:
                k = len(p["y"])
                u, uo, un = physionet_utility(p["y"], [1 if pr >= cand else 0 for pr in probs[idx : idx + k]])
                u_s += u; uo_s += uo; un_s += un
                idx += k
            unorm = (u_s - un_s) / max(1e-9, (uo_s - un_s))
            if unorm > best_u:
                best_u = unorm
                watch_th = cand
        if watch_th is None:
            watch_th = 0.03

    # 2. Primary Critical Alert threshold: lowest threshold obeying hourly alarm budget (<= max_fp_per_100h)
    best_th = threshold
    if best_th is None:
        qs_fine = sorted(set(round(probs[k], 4) for k in range(0, len(probs), max(1, len(probs) // 400))))
        cands_c = [q for q in qs_fine if q >= 0.01]
        best_th = cands_c[-1] if cands_c else 0.06
        for cand in cands_c:
            fp_c = sum(1 for y, pr in zip(y_all, probs) if y == 0 and pr >= cand)
            if (100.0 * fp_c / max(1, len(y_all))) <= max_fp_per_100h:
                best_th = cand
                break

    pt_y, pt_p, pt_2of3_pred, lead_24h, lead_12h = [], [], [], [], []
    u_sum = u_opt_s = u_null_s = 0.0
    idx = 0
    for p in sub_pts:
        k = len(p["y"])
        ps = probs[idx : idx + k]
        ys = p["y"]
        u, uo, un = physionet_utility(ys, [1 if pr >= watch_th else 0 for pr in ps])
        u_sum += u; u_opt_s += uo; u_null_s += un
        pt_y.append(p["has_sepsis"])
        pt_p.append(max(ps))
        pt_2of3_pred.append(1 if any(_persist_2of3(ps, best_th)) else 0)
        if p["has_sepsis"] == 1:
            t_onset = next(i for i, yy in enumerate(ys) if yy == 1) + 6
            w_start_24 = max(0, t_onset - 24)
            w_start_12 = max(0, t_onset - 12)
            t_al_24 = next((i for i in range(w_start_24, min(k, t_onset + 4)) if ps[i] >= best_th), None)
            t_al_12 = next((i for i in range(w_start_12, min(k, t_onset + 4)) if ps[i] >= best_th), None)
            if t_al_24 is not None:
                lead_24h.append(t_onset - t_al_24)
            if t_al_12 is not None:
                lead_12h.append(t_onset - t_al_12)
        idx += k

    util_norm = (u_sum - u_null_s) / max(1e-9, (u_opt_s - u_null_s))
    pt_pairs = sorted(zip(pt_p, pt_y), key=lambda t: t[0], reverse=True)
    pP = sum(pt_y); pN = len(pt_y) - pP
    tp2 = fp2 = 0; pt0 = pf0 = 0.0; pt_auc = pt_auprc = pt_rec0 = 0.0
    for _, lb in pt_pairs:
        if lb == 1: tp2 += 1
        else: fp2 += 1
        tpr = tp2 / max(1, pP); fpr = fp2 / max(1, pN)
        prec2 = tp2 / max(1, tp2 + fp2)
        pt_auc += 0.5 * (tpr + pt0) * (fpr - pf0)
        if tpr > pt_rec0:
            pt_auprc += prec2 * (tpr - pt_rec0)
            pt_rec0 = tpr
        pt0, pf0 = tpr, fpr

    pt_tp = sum(1 for y, pr in zip(pt_y, pt_2of3_pred) if y == 1 and pr == 1)
    pt_fp = sum(1 for y, pr in zip(pt_y, pt_2of3_pred) if y == 0 and pr == 1)
    pt_tn = sum(1 for y, pr in zip(pt_y, pt_2of3_pred) if y == 0 and pr == 0)
    pt_fn = sum(1 for y, pr in zip(pt_y, pt_2of3_pred) if y == 1 and pr == 0)

    tp_b = sum(1 for y, pr in zip(y_all, probs) if y == 1 and pr >= best_th)
    fp_b = sum(1 for y, pr in zip(y_all, probs) if y == 0 and pr >= best_th)
    fn_b = sum(1 for y, pr in zip(y_all, probs) if y == 1 and pr < best_th)
    tn_b = sum(1 for y, pr in zip(y_all, probs) if y == 0 and pr < best_th)
    sens = tp_b / max(1, tp_b + fn_b)
    spec = tn_b / max(1, tn_b + fp_b)
    ppv = tp_b / max(1, tp_b + fp_b)
    npv = tn_b / max(1, tn_b + fn_b)
    f1 = (2 * ppv * sens / max(1e-9, ppv + sens)) if (ppv + sens) > 0 else 0.0
    lead_sorted = sorted(lead_24h)
    return {
        "auroc": round(auroc, 4),
        "patient_auroc": round(pt_auc, 4),
        "auprc": round(auprc, 4),
        "pt_auprc": round(pt_auprc, 4),
        "physionet_utility": round(util_norm, 4),
        "brier_score": round(brier, 4),
        "ece": round(ece, 4),
        "watchlist_threshold": round(watch_th, 4),
        "threshold": round(best_th, 4),
        "sensitivity": round(sens, 4),
        "specificity": round(spec, 4),
        "precision_ppv": round(ppv, 4),
        "npv": round(npv, 4),
        "f1": round(f1, 4),
        "fp_per_100h": round(100.0 * fp_b / max(1, len(y_all)), 2),
        "pt_2of3_sens": round(pt_tp / max(1, pt_tp + pt_fn), 4),
        "pt_2of3_spec": round(pt_tn / max(1, pt_tn + pt_fp), 4),
        "pt_2of3_ppv": round(pt_tp / max(1, pt_tp + pt_fp), 4),
        "sepsis_patients_caught_24h": f"{len(lead_24h)}/{pP}",
        "sepsis_patients_caught_12h": f"{len(lead_12h)}/{pP}",
        "median_lead_hours": lead_sorted[len(lead_sorted) // 2] if lead_sorted else None,
        "mean_lead_hours": round(sum(lead_sorted) / len(lead_sorted), 2) if lead_sorted else None,
    }


def compute_feature_drift(tr_pts, te_pts, means, sds):
    key_vars = ["HR", "MAP", "Temp", "Resp", "O2Sat", "BUN", "Creatinine", "WBC", "Platelets", "Lactate", "ICULOS"]
    drift = {}
    for f in key_vars:
        j = FEAT_IDX[f]
        tr_vals = [r[j] for p in tr_pts for r in p["X"] if r[j] is not None]
        te_vals = [r[j] for p in te_pts for r in p["X"] if r[j] is not None]
        tr_miss = 1.0 - len(tr_vals) / max(1, sum(len(p["X"]) for p in tr_pts))
        te_miss = 1.0 - len(te_vals) / max(1, sum(len(p["X"]) for p in te_pts))
        if len(tr_vals) < 10 or len(te_vals) < 10:
            continue
        te_mu = sum(te_vals) / len(te_vals)
        smd = (te_mu - means[f]) / max(1e-4, sds[f])
        # 5-quantile Population Stability Index (PSI)
        s_tr = sorted(tr_vals)
        edges = [s_tr[int(q * (len(s_tr) - 1))] for q in (0.2, 0.4, 0.6, 0.8)]
        bins_tr = [0] * 5
        bins_te = [0] * 5
        for v in tr_vals:
            bins_tr[bisect.bisect_left(edges, v)] += 1
        for v in te_vals:
            bins_te[bisect.bisect_left(edges, v)] += 1
        psi = 0.0
        for b_tr, b_te in zip(bins_tr, bins_te):
            p1 = max(1e-4, b_tr / len(tr_vals))
            p2 = max(1e-4, b_te / len(te_vals))
            psi += (p2 - p1) * math.log(p2 / p1)
        drift[f] = {
            "psi": round(psi, 4),
            "smd": round(smd, 4),
            "train_missing_pct": round(100.0 * tr_miss, 1),
            "test_missing_pct": round(100.0 * te_miss, 1),
        }
    return drift


def main():
    t0 = time.time()
    patients = load_cohort()
    pos_pts = [p for p in patients if p["has_sepsis"] == 1]
    neg_pts = [p for p in patients if p["has_sepsis"] == 0]
    rng = random.Random(42)
    rng.shuffle(pos_pts)
    rng.shuffle(neg_pts)

    n_p = len(pos_pts); n_n = len(neg_pts)
    tr_pts = pos_pts[: int(0.70 * n_p)] + neg_pts[: int(0.70 * n_n)]
    va_pts = pos_pts[int(0.70 * n_p) : int(0.85 * n_p)] + neg_pts[int(0.70 * n_n) : int(0.85 * n_n)]
    te_pts = pos_pts[int(0.85 * n_p) :] + neg_pts[int(0.85 * n_n) :]
    rng.shuffle(tr_pts)

    print(f"Cohort: {len(patients)} pts ({len(pos_pts)}+ / {len(neg_pts)}-) | Loaded in {time.time() - t0:.2f}s")
    print(f"Splits: Train={len(tr_pts)} | Val={len(va_pts)} | Test={len(te_pts)} | Features={len(FEATURES)}")

    means, sds = fit_scaler(tr_pts)
    Xtr_z, Xtr_t, ytr = vectorize(tr_pts, means, sds)
    Xva_z, Xva_t, yva = vectorize(va_pts, means, sds)
    Xte_z, Xte_t, yte = vectorize(te_pts, means, sds)

    t1 = time.time()
    lr_bias, lr_weights = train_adam_logreg(Xtr_z, ytr, rng)
    print(f"Adam L2 LogReg trained in {time.time() - t1:.2f}s")

    t2 = time.time()
    ple_specs = fit_ple_specs(tr_pts, means, sds, n_bins=6)
    nn_artifact, z_nn_va, z_nn_te = train_neural_resnet_torch(
        tr_pts, va_pts, te_pts, means, sds, ple_specs, hid=64, drop=0.45, epochs=14
    )
    print(f"5-Fold PLE-ResNet Neural Network trained in {time.time() - t2:.2f}s (D={nn_artifact['input_dim']})")

    z_lr_va = eval_lr_logits(Xva_z, lr_bias, lr_weights)
    z_lr_te = eval_lr_logits(Xte_z, lr_bias, lr_weights)
    cal_a, cal_b = fit_platt(z_nn_va, yva)

    p_lr_te = [sig(z) for z in z_lr_te]
    p_nn_te_uncal = [sig(z) for z in z_nn_te]
    p_cal_va = [sig(cal_a * z + cal_b) for z in z_nn_va]
    p_cal_te = [sig(cal_a * z + cal_b) for z in z_nn_te]

    val_metrics = compute_monitoring_metrics(va_pts, p_cal_va, threshold=None, watchlist_threshold=None, max_fp_per_100h=5.0)
    opt_th = val_metrics["threshold"]
    watch_th = val_metrics["watchlist_threshold"]
    test_metrics = compute_monitoring_metrics(te_pts, p_cal_te, threshold=opt_th, watchlist_threshold=watch_th)
    lr_test_metrics = compute_monitoring_metrics(te_pts, p_lr_te, threshold=0.55)
    nn_uncal_metrics = compute_monitoring_metrics(te_pts, p_nn_te_uncal, threshold=0.55)
    drift_metrics = compute_feature_drift(tr_pts, te_pts, means, sds)

    print("VAL  Calibrated NN   :", val_metrics)
    print("TEST LogReg (ref)    :", lr_test_metrics)
    print("TEST NN (uncal)      :", nn_uncal_metrics)
    print("TEST Calibrated NN   :", test_metrics)

    top_lr = sorted(
        [{"feature": FEATURES[j], "weight": round(lr_weights[j], 4)} for j in range(len(FEATURES))],
        key=lambda d: abs(d["weight"]),
        reverse=True,
    )[:12]

    artifact = {
        "model_name": f"Calibrated 5-Fold PLE-ResNet Neural Network ({len(FEATURES)} causal features -> D={nn_artifact['input_dim']})",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "cohort_summary": {
            "total_patients": len(patients),
            "train_patients": len(tr_pts),
            "val_patients": len(va_pts),
            "test_patients": len(te_pts),
            "total_hours": sum(len(p["y"]) for p in patients),
            "sepsis_positive_patients": len(pos_pts),
        },
        "features": FEATURES,
        "scaler_means": means,
        "scaler_sds": sds,
        "neural_network": nn_artifact,
        "logistic_regression": {
            "bias": round(lr_bias, 6),
            "weights": [round(x, 6) for x in lr_weights],
            "test_metrics": lr_test_metrics,
        },
        "calibration": {
            "method": "platt_sigmoid_val",
            "use_logit_blend": False,
            "a": cal_a,
            "b": cal_b,
        },
        "ensemble": {
            "neural_weight": 1.0,
            "logreg_weight": 0.0,
            "watchlist_threshold": watch_th,
            "decision_threshold": opt_th,
            "val_metrics": val_metrics,
            "test_metrics": test_metrics,
        },
        "monitoring_metrics": {
            "validation": val_metrics,
            "held_out_test": test_metrics,
            "logreg_reference_test": lr_test_metrics,
            "feature_drift_train_vs_test": drift_metrics,
        },
        "top_risk_weights": top_lr,
    }

    os.makedirs(os.path.dirname(OUT_MODEL_PATH), exist_ok=True)
    with open(OUT_MODEL_PATH, "w", encoding="utf-8") as fp:
        json.dump(artifact, fp, separators=(",", ":"))
    size_kb = os.path.getsize(OUT_MODEL_PATH) / 1024.0
    print(f"Saved {OUT_MODEL_PATH} ({size_kb:.1f} KB) in {time.time() - t0:.2f}s total")


if __name__ == "__main__":
    main()
