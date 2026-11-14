/**
 * Real-Time Causal 6-Hour Forward Sepsis Neural Predictive Engine
 * Supports:
 *   1. 5-Fold Quantile-Encoded Residual Neural Network (`neural_network`: PLE + signed-log1p +
 *      missingness masks -> LayerNorm + SiLU + 2 Residual Blocks + Linear Skip)
 *   2. L2 Logistic Regression comparison baseline (`logistic_regression`)
 *   3. Backward-compatible fallback for GBDT/Stump JSON artifacts
 *   4. Platt Sigmoid Probability Calibration (`calibration: { a, b }`)
 *   5. Causal 0..hourIndex feature extraction matching Python & Kaggle 1:1 parity,
 *      plus fast exact 5-fold mean-baseline ablation risk driver attribution.
 */

const FEATURE_LABELS = {
  HR: "Heart Rate (bpm)",
  O2Sat: "SpO2 (%)",
  Temp: "Temperature (C)",
  MAP: "MAP (mmHg)",
  Resp: "Resp Rate (/min)",
  SBP: "Systolic BP (mmHg)",
  DBP: "Diastolic BP (mmHg)",
  BUN: "BUN (mg/dL)",
  Creatinine: "Creatinine (mg/dL)",
  Glucose: "Glucose (mg/dL)",
  WBC: "WBC (K/uL)",
  Platelets: "Platelets (K/uL)",
  Lactate: "Lactate (mmol/L)",
  Bilirubin_total: "Bilirubin (mg/dL)",
  FiO2: "FiO2",
  pH: "Arterial pH",
  BaseExcess: "Base Excess",
  Hgb: "Hemoglobin (g/dL)",
  Hct: "Hematocrit (%)",
  Chloride: "Chloride (mEq/L)",
  Age: "Patient Age (yrs)",
  HospAdmTime: "Pre-ICU Hosp Los (h)",
  ICULOS: "ICU Length of Stay (h)",
  ShockIndex: "Shock Index (HR/MAP)",
  PulsePressure: "Pulse Pressure (mmHg)",
  ROX_proxy: "ROX Oxygenation Index",
  Shock_x_Resp: "Shock x Resp Strain",
  MAP_to_Age: "MAP / Age Ratio",
  Temp_deviation: "Temp Dev from 37C",
  Temp_high_hinge: "Fever Excess (>38C)",
  Temp_low_hinge: "Hypothermia Deficit (<36C)",
  WBC_high_hinge: "Leukocytosis (>12)",
  WBC_low_hinge: "Leukopenia (<4)",
  Lactate_hinge: "Lactate Excess (>2.0)",
  Platelet_low_hinge: "Thrombocytopenia (<150)",
  Creat_high_hinge: "Creatinine Excess (>1.2)",
  Hrs_since_Lactate: "Hours Since Lactate",
  Hrs_since_WBC: "Hours Since WBC",
  Hrs_since_Creatinine: "Hours Since Creatinine",
  Lab_update_events: "Lab Updates Observed",
  HR_diff_base: "HR vs Own Baseline",
  MAP_diff_base: "MAP vs Own Baseline",
  Resp_diff_base: "Resp vs Own Baseline",
  Temp_diff_base: "Temp vs Own Baseline",
  O2Sat_diff_base: "SpO2 vs Own Baseline",
  SI_diff_base: "ShockIdx vs Baseline",
  HR_delta_1h: "1h HR Delta",
  MAP_delta_1h: "1h MAP Delta",
  HR_mean_6h: "6h Mean HR (bpm)",
  HR_max_6h: "6h Peak HR (bpm)",
  HR_std_6h: "6h HR Variability",
  HR_delta_6h: "6h HR Trend",
  HR_drift_12h: "12h HR Drift",
  HR_tachy_frac_6h: "6h Tachycardia Burden",
  MAP_min_6h: "6h Min MAP (mmHg)",
  MAP_mean_6h: "6h Mean MAP (mmHg)",
  MAP_std_6h: "6h MAP Variability",
  MAP_delta_6h: "6h MAP Trend",
  MAP_drift_12h: "12h MAP Drift",
  MAP_hypo_frac_6h: "6h Hypotension Burden",
  O2Sat_min_6h: "6h Min SpO2 (%)",
  O2Sat_mean_6h: "6h Mean SpO2 (%)",
  Resp_max_6h: "6h Peak Resp (/min)",
  Resp_mean_6h: "6h Mean Resp (/min)",
  Resp_delta_6h: "6h Resp Trend",
  Temp_max_6h: "6h Peak Temp (C)",
  Temp_min_6h: "6h Min Temp (C)",
  SI_max_6h: "6h Peak Shock Index",
  SI_mean_6h: "6h Mean Shock Index",
  BUN_Creat_ratio: "BUN/Creatinine Ratio",
  Creatinine_delta: "Creatinine vs Baseline",
  Platelets_delta: "Platelets vs Baseline",
  WBC_delta: "WBC vs Baseline",
  BUN_delta: "BUN vs Baseline",
  Lactate_delta: "Lactate vs Baseline",
  qSOFA_partial: "qSOFA Proxy Score",
  SIRS_count: "SIRS Criteria Count",
  SOFA_partial: "SOFA Organ Proxy",
  NEWS2_proxy: "NEWS2 Vitals Proxy",
};

function isFiniteNum(v) {
  return v !== null && v !== undefined && Number.isFinite(Number(v));
}

function sig(z) {
  const clamped = Math.max(-20, Math.min(20, z));
  return 1 / (1 + Math.exp(-clamped));
}

function news2Proxy(rp, o2, sbp, mp, hr, tp) {
  let pts = 0;
  if (rp !== null) {
    if (rp <= 8 || rp >= 25) pts += 3;
    else if (rp >= 21) pts += 2;
    else if (rp <= 11) pts += 1;
  }
  if (o2 !== null) {
    if (o2 <= 91) pts += 3;
    else if (o2 <= 93) pts += 2;
    else if (o2 <= 95) pts += 1;
  }
  if (sbp !== null) {
    if (sbp <= 90 || sbp >= 220) pts += 3;
    else if (sbp <= 100) pts += 2;
    else if (sbp <= 110) pts += 1;
  } else if (mp !== null) {
    if (mp <= 60) pts += 3;
    else if (mp <= 65) pts += 2;
    else if (mp <= 70) pts += 1;
  }
  if (hr !== null) {
    if (hr <= 40 || hr >= 131) pts += 3;
    else if (hr >= 111) pts += 2;
    else if (hr <= 50 || hr >= 91) pts += 1;
  }
  if (tp !== null) {
    if (tp <= 35.0) pts += 3;
    else if (tp >= 39.1) pts += 2;
    else if (tp <= 36.0 || tp >= 38.1) pts += 1;
  }
  return pts;
}

function sofaPartial(mp, o2, cr, plt, bili, fio2) {
  const cv = mp !== null && mp < 70 ? 1 : 0;
  const ren = cr === null ? 0 : cr >= 5 ? 4 : cr >= 3.5 ? 3 : cr >= 2 ? 2 : cr >= 1.2 ? 1 : 0;
  const coag = plt === null ? 0 : plt < 20 ? 4 : plt < 50 ? 3 : plt < 100 ? 2 : plt < 150 ? 1 : 0;
  const liv = bili === null ? 0 : bili >= 12 ? 4 : bili >= 6 ? 3 : bili >= 2 ? 2 : bili >= 1.2 ? 1 : 0;
  let resp = 0;
  if (o2 !== null) {
    let f = fio2 !== null && fio2 > 0 ? fio2 : 0.21;
    if (f > 1.0) f /= 100.0;
    const rat = o2 / Math.max(0.21, f);
    resp = rat < 100 ? 4 : rat < 200 ? 3 : rat < 300 ? 2 : rat < 400 ? 1 : 0;
  }
  return cv + ren + coag + liv + resp;
}

function layerNorm(vec, gamma, beta, eps = 1e-5) {
  const n = vec.length;
  let mu = 0.0;
  for (let i = 0; i < n; i++) mu += vec[i];
  mu /= n;
  let varSum = 0.0;
  for (let i = 0; i < n; i++) {
    const d = vec[i] - mu;
    varSum += d * d;
  }
  const inv = 1.0 / Math.sqrt(varSum / n + eps);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = ((vec[i] - mu) * inv) * gamma[i] + beta[i];
  }
  return out;
}

function linearLayer(vec, w2d, b1d) {
  const rows = w2d.length;
  const cols = vec.length;
  const out = new Array(rows);
  for (let o = 0; o < rows; o++) {
    const wRow = w2d[o];
    let s = b1d[o];
    for (let i = 0; i < cols; i++) s += wRow[i] * vec[i];
    out[o] = s;
  }
  return out;
}

function siluVec(vec) {
  const out = new Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    const v = vec[i];
    out[i] = v * sig(v);
  }
  return out;
}

function dotVec(a, b) {
  let s = 0.0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export class SepsisPredictiveEngine {
  constructor(modelData) {
    this.model = modelData;
    this.features = modelData.features || [];
    this.featureIdx = {};
    this.features.forEach((f, i) => {
      this.featureIdx[f] = i;
    });
    this.means = modelData.scaler_means || {};
    this.sds = modelData.scaler_sds || {};
    this.nn = modelData.neural_network || null;
    this.lr = modelData.logistic_regression || { bias: 0, weights: [] };
    this.trees = modelData.boosted_trees?.trees || [];
    this.treesBase = modelData.boosted_trees?.base_pred || 0;
    this.stumps = modelData.boosted_stumps?.stumps || [];
    this.stumpsBase = modelData.boosted_stumps?.base_pred || 0;
    this.ensemble = modelData.ensemble || { logreg_weight: 0.0, neural_weight: 1.0, decision_threshold: 0.5 };
    this.calibration = modelData.calibration || null;

    if (this.nn && this.nn.ple_specs) {
      this.pleOffsetByFeature = {};
      let off = this.features.length + 20;
      for (const sp of this.nn.ple_specs) {
        const len = Math.max(0, (sp.edges?.length || 0) - 1);
        this.pleOffsetByFeature[sp.f] = { offset: off, len, edges: sp.edges };
        off += len;
      }
    }
  }

  extractCausalFeatures(patient, hourIndex) {
    const tl = patient?.timeline || [];
    const endIdx = Math.max(0, Math.min(hourIndex, tl.length - 1));
    const demo = patient?.demographics || {};

    const ageVal = isFiniteNum(demo.age) ? Number(demo.age) : null;
    const hospAdmVal = isFiniteNum(demo.hosp_adm_time_hours)
      ? Number(demo.hosp_adm_time_hours)
      : isFiniteNum(demo.hosp_adm_time)
        ? Number(demo.hosp_adm_time)
        : null;

    const last = {
      HR: null, O2Sat: null, Temp: null, SBP: null, MAP: null, DBP: null, Resp: null,
      FiO2: null, pH: null, BaseExcess: null, BUN: null, Creatinine: null, Glucose: null,
      WBC: null, Platelets: null, Lactate: null, Bilirubin_total: null,
      Hgb: null, Hct: null, Chloride: null,
    };
    const baseLab = {};
    const hrsSince = { Lactate: 24.0, WBC: 24.0, Creatinine: 24.0, Platelets: 24.0, Bilirubin_total: 24.0 };
    let labUpdateEvents = 0;

    const hist = { HR: [], MAP: [], O2Sat: [], Resp: [], Temp: [], SI: [] };
    const expSum = { HR: 0, MAP: 0, O2Sat: 0, Resp: 0, Temp: 0, SI: 0 };
    const expCnt = { HR: 0, MAP: 0, O2Sat: 0, Resp: 0, Temp: 0, SI: 0 };
    let currentIcUlos = endIdx + 1;

    for (let k = 0; k <= endIdx; k++) {
      const rec = tl[k] || {};
      const v = rec.vitals || {};
      const l = rec.labs || {};
      if (isFiniteNum(rec.hour)) currentIcUlos = Number(rec.hour);

      const lactVal = isFiniteNum(l.lactate_mmol_l)
        ? Number(l.lactate_mmol_l)
        : isFiniteNum(l.lactate_mg_dl)
          ? Number(l.lactate_mg_dl) / 9.008
          : null;

      const stepMap = {
        HR: isFiniteNum(v.hr) ? Number(v.hr) : null,
        O2Sat: isFiniteNum(v.o2sat) ? Number(v.o2sat) : null,
        Temp: isFiniteNum(v.temp_c) ? Number(v.temp_c) : null,
        SBP: isFiniteNum(v.sbp) ? Number(v.sbp) : null,
        MAP: isFiniteNum(v.map) ? Number(v.map) : null,
        DBP: isFiniteNum(v.dbp) ? Number(v.dbp) : null,
        Resp: isFiniteNum(v.resp) ? Number(v.resp) : null,
        FiO2: isFiniteNum(l.fio2) ? Number(l.fio2) : null,
        pH: isFiniteNum(l.ph) ? Number(l.ph) : null,
        BaseExcess: isFiniteNum(l.base_excess) ? Number(l.base_excess) : null,
        BUN: isFiniteNum(l.bun_mg_dl) ? Number(l.bun_mg_dl) : null,
        Creatinine: isFiniteNum(l.creatinine_mg_dl) ? Number(l.creatinine_mg_dl) : null,
        Glucose: isFiniteNum(l.glucose_mg_dl) ? Number(l.glucose_mg_dl) : null,
        WBC: isFiniteNum(l.wbc_k_ul) ? Number(l.wbc_k_ul) : null,
        Platelets: isFiniteNum(l.platelets_k_ul) ? Number(l.platelets_k_ul) : null,
        Lactate: lactVal,
        Bilirubin_total: isFiniteNum(l.bilirubin_total_mg_dl) ? Number(l.bilirubin_total_mg_dl) : null,
        Hgb: isFiniteNum(l.hgb_g_dl) ? Number(l.hgb_g_dl) : null,
        Hct: isFiniteNum(l.hct_pct) ? Number(l.hct_pct) : null,
        Chloride: isFiniteNum(l.chloride_meq_l) ? Number(l.chloride_meq_l) : null,
      };

      let anyLabUpdated = false;
      for (const lc of Object.keys(hrsSince)) {
        const nv = stepMap[lc];
        if (nv !== null && (last[lc] === null || Math.abs(nv - last[lc]) > 1e-6)) {
          hrsSince[lc] = 0.0;
          anyLabUpdated = true;
        } else {
          hrsSince[lc] = Math.min(48.0, hrsSince[lc] + 1.0);
        }
      }
      if (anyLabUpdated) labUpdateEvents += 1;

      for (const col of Object.keys(stepMap)) {
        const nv = stepMap[col];
        if (nv !== null) {
          last[col] = nv;
          if ((col === "Creatinine" || col === "WBC" || col === "Platelets" || col === "BUN" || col === "Lactate") && baseLab[col] === undefined) {
            baseLab[col] = nv;
          }
        }
      }

      const pushVital = (key, val) => {
        if (val !== null) {
          hist[key].push(val);
          expSum[key] += val;
          expCnt[key] += 1;
        }
      };
      pushVital("HR", last.HR);
      pushVital("MAP", last.MAP);
      pushVital("O2Sat", last.O2Sat);
      pushVital("Resp", last.Resp);
      pushVital("Temp", last.Temp);
      if (last.HR !== null && last.MAP !== null && last.MAP > 10.0) {
        pushVital("SI", last.HR / last.MAP);
      }
    }

    const hr = last.HR;
    const mp = last.MAP;
    const o2 = last.O2Sat;
    const rp = last.Resp;
    const tp = last.Temp;
    const sbp = last.SBP;
    const dbp = last.DBP;
    const si = hr !== null && mp !== null && mp > 10.0 ? hr / mp : null;
    const pp = sbp !== null && dbp !== null && sbp > dbp ? sbp - dbp : null;
    const fio2Raw = last.FiO2;
    const fio2Norm = fio2Raw !== null && fio2Raw > 0 ? (fio2Raw > 1.0 ? fio2Raw / 100.0 : fio2Raw) : 0.21;
    const rox = o2 !== null && rp !== null ? (o2 / Math.max(0.21, fio2Norm)) / Math.max(4.0, rp) : null;

    const meanOf = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    const stdOf = (arr, m) => (arr.length >= 2 ? Math.sqrt(arr.reduce((a, x) => a + (x - m) * (x - m), 0) / arr.length) : 0.0);

    const wHr = hist.HR.slice(-6);
    const wMp = hist.MAP.slice(-6);
    const wO2 = hist.O2Sat.slice(-6);
    const wRp = hist.Resp.slice(-6);
    const wTp = hist.Temp.slice(-6);
    const wSi = hist.SI.slice(-6);
    const wHr12 = hist.HR.slice(-12);
    const wMp12 = hist.MAP.slice(-12);

    const hrM6 = meanOf(wHr);
    const mpM6 = meanOf(wMp);
    const expDiff = (key, cur) => (cur !== null && expCnt[key] >= 2 ? cur - expSum[key] / expCnt[key] : 0.0);

    const qsofa = (rp !== null && rp >= 22 ? 1.0 : 0.0) + ((sbp !== null && sbp <= 100) || (mp !== null && mp <= 65) ? 1.0 : 0.0);
    const sirs =
      (tp !== null && (tp > 38.0 || tp < 36.0) ? 1.0 : 0.0) +
      (hr !== null && hr > 90 ? 1.0 : 0.0) +
      (rp !== null && rp > 20 ? 1.0 : 0.0) +
      (last.WBC !== null && (last.WBC > 12.0 || last.WBC < 4.0) ? 1.0 : 0.0);

    return {
      ...last,
      Age: ageVal,
      HospAdmTime: hospAdmVal,
      ICULOS: currentIcUlos,
      ShockIndex: si,
      PulsePressure: pp,
      ROX_proxy: rox,
      Shock_x_Resp: si !== null && rp !== null ? si * rp : null,
      MAP_to_Age: mp !== null && ageVal !== null ? mp / Math.max(20.0, ageVal) : null,
      Temp_deviation: tp !== null ? Math.abs(tp - 37.0) : null,
      Temp_high_hinge: tp !== null ? Math.max(0.0, tp - 38.0) : 0.0,
      Temp_low_hinge: tp !== null ? Math.max(0.0, 36.0 - tp) : 0.0,
      WBC_high_hinge: last.WBC !== null ? Math.max(0.0, last.WBC - 12.0) : 0.0,
      WBC_low_hinge: last.WBC !== null ? Math.max(0.0, 4.0 - last.WBC) : 0.0,
      Lactate_hinge: last.Lactate !== null ? Math.max(0.0, last.Lactate - 2.0) : 0.0,
      Platelet_low_hinge: last.Platelets !== null ? Math.max(0.0, 150.0 - last.Platelets) : 0.0,
      Creat_high_hinge: last.Creatinine !== null ? Math.max(0.0, last.Creatinine - 1.2) : 0.0,
      Hrs_since_Lactate: hrsSince.Lactate,
      Hrs_since_WBC: hrsSince.WBC,
      Hrs_since_Creatinine: hrsSince.Creatinine,
      Lab_update_events: labUpdateEvents,
      HR_diff_base: expDiff("HR", hr),
      MAP_diff_base: expDiff("MAP", mp),
      Resp_diff_base: expDiff("Resp", rp),
      Temp_diff_base: expDiff("Temp", tp),
      O2Sat_diff_base: expDiff("O2Sat", o2),
      SI_diff_base: expDiff("SI", si),
      HR_delta_1h: wHr.length >= 2 ? wHr[wHr.length - 1] - wHr[wHr.length - 2] : 0.0,
      MAP_delta_1h: wMp.length >= 2 ? wMp[wMp.length - 1] - wMp[wMp.length - 2] : 0.0,
      HR_mean_6h: hrM6,
      HR_max_6h: wHr.length ? Math.max(...wHr) : null,
      HR_std_6h: stdOf(wHr, hrM6),
      HR_delta_6h: wHr.length >= 2 ? wHr[wHr.length - 1] - wHr[0] : 0.0,
      HR_drift_12h: wHr12.length >= 2 ? wHr12[wHr12.length - 1] - meanOf(wHr12) : 0.0,
      HR_tachy_frac_6h: wHr.length ? wHr.filter((x) => x > 100.0).length / wHr.length : 0.0,
      MAP_min_6h: wMp.length ? Math.min(...wMp) : null,
      MAP_mean_6h: mpM6,
      MAP_std_6h: stdOf(wMp, mpM6),
      MAP_delta_6h: wMp.length >= 2 ? wMp[wMp.length - 1] - wMp[0] : 0.0,
      MAP_drift_12h: wMp12.length >= 2 ? wMp12[wMp12.length - 1] - meanOf(wMp12) : 0.0,
      MAP_hypo_frac_6h: wMp.length ? wMp.filter((x) => x < 65.0).length / wMp.length : 0.0,
      O2Sat_min_6h: wO2.length ? Math.min(...wO2) : null,
      O2Sat_mean_6h: meanOf(wO2),
      Resp_max_6h: wRp.length ? Math.max(...wRp) : null,
      Resp_mean_6h: meanOf(wRp),
      Resp_delta_6h: wRp.length >= 2 ? wRp[wRp.length - 1] - wRp[0] : 0.0,
      Temp_max_6h: wTp.length ? Math.max(...wTp) : null,
      Temp_min_6h: wTp.length ? Math.min(...wTp) : null,
      SI_max_6h: wSi.length ? Math.max(...wSi) : null,
      SI_mean_6h: meanOf(wSi),
      BUN_Creat_ratio: last.BUN !== null && last.Creatinine !== null ? last.BUN / Math.max(0.2, last.Creatinine) : null,
      Creatinine_delta: baseLab.Creatinine !== undefined && last.Creatinine !== null ? last.Creatinine - baseLab.Creatinine : 0.0,
      Platelets_delta: baseLab.Platelets !== undefined && last.Platelets !== null ? last.Platelets - baseLab.Platelets : 0.0,
      WBC_delta: baseLab.WBC !== undefined && last.WBC !== null ? last.WBC - baseLab.WBC : 0.0,
      BUN_delta: baseLab.BUN !== undefined && last.BUN !== null ? last.BUN - baseLab.BUN : 0.0,
      Lactate_delta: baseLab.Lactate !== undefined && last.Lactate !== null ? last.Lactate - baseLab.Lactate : 0.0,
      qSOFA_partial: qsofa,
      SIRS_count: sirs,
      SOFA_partial: sofaPartial(mp, o2, last.Creatinine, last.Platelets, last.Bilirubin_total, last.FiO2),
      NEWS2_proxy: news2Proxy(rp, o2, sbp, mp, hr, tp),
      Lactate_missing: last.Lactate === null ? 1.0 : 0.0,
    };
  }

  encodePleVector(zImputed, rawMiss20) {
    const nFeat = this.features.length;
    const xVec = new Array(nFeat + 20);
    for (let j = 0; j < nFeat; j++) {
      const z = zImputed[j];
      xVec[j] = z >= 0 ? Math.log1p(z) : -Math.log1p(-z);
    }
    for (let j = 0; j < 20; j++) {
      xVec[nFeat + j] = rawMiss20[j];
    }
    for (const sp of this.nn.ple_specs || []) {
      const j = sp.f;
      const edges = sp.edges;
      const isMiss = j < 20 && rawMiss20[j] > 0.5;
      const colZ = zImputed[j];
      for (let b = 0; b < edges.length - 1; b++) {
        if (isMiss) {
          xVec.push(0.0);
        } else {
          const denom = Math.max(1e-5, edges[b + 1] - edges[b]);
          const val = (colZ - edges[b]) / denom;
          xVec.push(val > 1.0 ? 1.0 : val < 0.0 ? 0.0 : val);
        }
      }
    }
    return xVec;
  }

  evalNeuralFoldFromStemPre(stemPre, xVec, fw, eps, skipScale, skipPre = null) {
    let h = siluVec(layerNorm(stemPre, fw.stem_ln_g, fw.stem_ln_b, eps));
    const r1Pre = linearLayer(h, fw.b1_fc1_w, fw.b1_fc1_b);
    const r1Act = siluVec(layerNorm(r1Pre, fw.b1_ln_g, fw.b1_ln_b, eps));
    const r1 = linearLayer(r1Act, fw.b1_fc2_w, fw.b1_fc2_b);
    for (let i = 0; i < h.length; i++) h[i] += r1[i];

    const r2Pre = linearLayer(h, fw.b2_fc1_w, fw.b2_fc1_b);
    const r2Act = siluVec(layerNorm(r2Pre, fw.b2_ln_g, fw.b2_ln_b, eps));
    const r2 = linearLayer(r2Act, fw.b2_fc2_w, fw.b2_fc2_b);
    for (let i = 0; i < h.length; i++) h[i] += r2[i];

    const head = fw.head_b + dotVec(fw.head_w, h);
    const skip = skipPre !== null ? skipPre : fw.skip_b + dotVec(fw.skip_w, xVec);
    return head + skipScale * skip;
  }

  predict(patient, hourIndex, _skipPersist = false) {
    const rawFeats = this.extractCausalFeatures(patient, hourIndex);
    const zImputed = [];
    const zNative = [];
    const rawMiss20 = new Array(20).fill(0.0);

    for (let i = 0; i < this.features.length; i++) {
      const f = this.features[i];
      const rawVal = rawFeats[f];
      const mean = this.means[f] ?? 0.0;
      const sd = this.sds[f] && this.sds[f] > 1e-6 ? this.sds[f] : 1.0;

      if (!isFiniteNum(rawVal)) {
        zImputed.push(0.0);
        zNative.push(null);
        if (i < 20) rawMiss20[i] = 1.0;
      } else {
        const z = Math.max(-5.0, Math.min(5.0, (Number(rawVal) - mean) / sd));
        zImputed.push(z);
        zNative.push(z);
      }
    }

    // 1. L2 Logistic Regression Reference Baseline
    let lrLogit = this.lr.bias || 0.0;
    const weights = this.lr.weights || [];
    for (let i = 0; i < zImputed.length; i++) {
      lrLogit += (weights[i] || 0.0) * zImputed[i];
    }
    const pLogReg = sig(lrLogit);

    // 2. Neural Network Ensemble (5-Fold PLE-ResNet) OR legacy Tree Fallback
    let finalProb = 0.0;
    let pNeural = 0.0;
    let foldSpreadPct = 0.0;
    const drivers = [];

    if (this.nn && Array.isArray(this.nn.folds) && this.nn.folds.length > 0) {
      const xVec = this.encodePleVector(zImputed, rawMiss20);
      const eps = this.nn.layernorm_eps ?? 1e-5;
      const skipScale = this.nn.skip_scale ?? 0.5;
      const folds = this.nn.folds;

      const stemPres = [];
      const skipPres = [];
      const foldLogits = [];
      for (const fw of folds) {
        const sp = linearLayer(xVec, fw.stem_w, fw.stem_b);
        const sk = fw.skip_b + dotVec(fw.skip_w, xVec);
        stemPres.push(sp);
        skipPres.push(sk);
        foldLogits.push(this.evalNeuralFoldFromStemPre(sp, xVec, fw, eps, skipScale, sk));
      }

      const nnLogit = foldLogits.reduce((a, b) => a + b, 0) / foldLogits.length;
      pNeural = sig(nnLogit);
      if (this.calibration && isFiniteNum(this.calibration.a) && isFiniteNum(this.calibration.b)) {
        finalProb = sig(this.calibration.a * nnLogit + this.calibration.b);
      } else {
        finalProb = pNeural;
      }

      const foldProbs = foldLogits.map((l) =>
        this.calibration && isFiniteNum(this.calibration.a) ? sig(this.calibration.a * l + this.calibration.b) : sig(l)
      );
      const meanFoldP = foldProbs.reduce((a, b) => a + b, 0) / foldProbs.length;
      const sdFoldP = Math.sqrt(foldProbs.reduce((a, p) => a + (p - meanFoldP) ** 2, 0) / foldProbs.length);
      foldSpreadPct = Math.round(sdFoldP * 1000) / 10;

      // Exact fast input ablation vs population neutral baseline (z = 0, observed)
      const nFeat = _skipPersist ? 0 : this.features.length;
      for (let i = 0; i < nFeat; i++) {
        const f = this.features[i];
        const rawVal = rawFeats[f];
        if (!isFiniteNum(rawVal)) continue;
        if (f === "Age" || f === "HospAdmTime" || f.endsWith("_missing")) continue;

        const diffs = [{ idx: i, delta: 0.0 - xVec[i] }];
        if (i < 20 && rawMiss20[i] !== 0.0) {
          diffs.push({ idx: nFeat + i, delta: 0.0 - xVec[nFeat + i] });
        }
        const pleInfo = this.pleOffsetByFeature?.[i];
        if (pleInfo) {
          const { offset, len, edges } = pleInfo;
          for (let b = 0; b < len; b++) {
            const denom = Math.max(1e-5, edges[b + 1] - edges[b]);
            const neuVal = Math.max(0.0, Math.min(1.0, (0.0 - edges[b]) / denom));
            diffs.push({ idx: offset + b, delta: neuVal - xVec[offset + b] });
          }
        }

        let ablatedLogitSum = 0.0;
        for (let fIdx = 0; fIdx < folds.length; fIdx++) {
          const fw = folds[fIdx];
          const modStem = stemPres[fIdx].slice();
          let modSkip = skipPres[fIdx];
          for (const d of diffs) {
            if (Math.abs(d.delta) < 1e-9) continue;
            modSkip += fw.skip_w[d.idx] * d.delta;
            for (let r = 0; r < modStem.length; r++) {
              modStem[r] += fw.stem_w[r][d.idx] * d.delta;
            }
          }
          ablatedLogitSum += this.evalNeuralFoldFromStemPre(modStem, null, fw, eps, skipScale, modSkip);
        }
        const score = nnLogit - ablatedLogitSum / folds.length;
        if (score > 0.05) {
          drivers.push({
            feature: f,
            label: FEATURE_LABELS[f] || f,
            rawValue: Math.round(Number(rawVal) * 100) / 100,
            zScore: Math.round(zImputed[i] * 100) / 100,
            contribution: Math.round(score * 1000) / 1000,
            direction: "risk-increasing",
          });
        }
      }
    } else {
      // Legacy GBDT / Stump fallback
      let treeLogit = 0.0;
      const treePathCounts = new Array(this.features.length).fill(0);
      if (this.trees.length > 0) {
        treeLogit = this.treesBase || 0.0;
        for (const tree of this.trees) {
          let node = tree;
          const pathFeats = [];
          while (node && typeof node === "object") {
            pathFeats.push(node.f);
            const v = zNative[node.f];
            const goLeft = v === null || v === undefined ? Boolean(node.dl) : v <= node.t;
            node = goLeft ? node.L : node.R;
          }
          const leafVal = Number(node || 0.0);
          treeLogit += leafVal;
          if (Math.abs(leafVal) > 0.005) {
            for (const fi of pathFeats) treePathCounts[fi] += leafVal;
          }
        }
      }
      pNeural = sig(treeLogit);
      const wLr = this.ensemble.logreg_weight ?? 0.2;
      const wTr = this.ensemble.trees_weight ?? 0.8;
      finalProb = wLr * pLogReg + wTr * pNeural;
      if (this.calibration && isFiniteNum(this.calibration.a) && isFiniteNum(this.calibration.b)) {
        const zEns = this.calibration.use_logit_blend
          ? wLr * lrLogit + wTr * treeLogit
          : Math.log(Math.max(1e-6, Math.min(1 - 1e-6, finalProb)) / (1 - Math.max(1e-6, Math.min(1 - 1e-6, finalProb))));
        finalProb = sig(this.calibration.a * zEns + this.calibration.b);
      }
      for (let i = 0; i < this.features.length; i++) {
        const f = this.features[i];
        const rawVal = rawFeats[f];
        if (!isFiniteNum(rawVal) || f === "Age" || f === "HospAdmTime") continue;
        const score = wLr * ((weights[i] || 0.0) * zImputed[i]) + wTr * (treePathCounts[i] * 0.25);
        if (score > 0.03) {
          drivers.push({
            feature: f,
            label: FEATURE_LABELS[f] || f,
            rawValue: Math.round(Number(rawVal) * 100) / 100,
            zScore: Math.round(zImputed[i] * 100) / 100,
            contribution: Math.round(score * 1000) / 1000,
            direction: "risk-increasing",
          });
        }
      }
    }

    const th = this.ensemble.decision_threshold || 0.5;
    const watchTh = this.ensemble.watchlist_threshold ?? th * 0.6;
    let tier = "Low Baseline Risk";
    let badgeClass = "badge-normal";
    if (finalProb >= Math.min(0.85, th * 2.2)) {
      tier = "Critical Sepsis Warning";
      badgeClass = "badge-critical";
    } else if (finalProb >= th) {
      tier = "Elevated 6h Forecast";
      badgeClass = "badge-warning";
    } else if (finalProb >= watchTh) {
      tier = "Moderate Watch";
      badgeClass = "badge-warning";
    }

    const barWidthPct = Math.round(Math.max(2, Math.min(100, (finalProb / Math.max(0.12, th * 2.5)) * 100)));
    drivers.sort((a, b) => b.contribution - a.contribution);

    let sustained2of3 = false;
    if (!_skipPersist && finalProb >= th && hourIndex >= 1) {
      let prevHits = 0;
      for (let prev = Math.max(0, hourIndex - 2); prev < hourIndex; prev++) {
        if (this.predict(patient, prev, true).probability >= th) prevHits++;
      }
      sustained2of3 = prevHits >= 1;
    }

    const pctRounded = finalProb < 0.1 ? Math.round(finalProb * 1000) / 10 : Math.round(finalProb * 100);
    const pNeuralRounded = Math.round(pNeural * 1000) / 10;
    return {
      modelType: this.nn ? "neural_network" : "gbdt_ensemble",
      probability: finalProb,
      percentage: pctRounded,
      barWidthPct,
      pNeuralPct: pNeuralRounded,
      pFoldSpreadPct: foldSpreadPct,
      pLogRegPct: Math.round(pLogReg * 1000) / 10,
      pTreesPct: pNeuralRounded,
      pStumpsPct: pNeuralRounded,
      watchThresholdPct: Math.round(watchTh * 1000) / 10,
      thresholdPct: Math.round(th * 1000) / 10,
      sustained2of3,
      tier,
      badgeClass,
      topDrivers: drivers.slice(0, 4),
      testAuroc: this.ensemble?.test_metrics?.auroc ?? null,
    };
  }
}
