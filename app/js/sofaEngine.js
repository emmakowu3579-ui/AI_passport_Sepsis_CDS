/**
 * SOFA Engine (Sequential Organ Failure Assessment)
 * Deterministic Sepsis-3 consensus scoring and diagnostic classification.
 */

export function calculateSofaScores(vitals, labs, activeVasopressors = {}) {
  // 1. Cardiovascular SOFA
  // 0: MAP >= 70 mmHg
  // 1: MAP < 70 mmHg (without vasopressors)
  // 2: Dopamine <= 5 ug/kg/min or Dobutamine (any dose)
  // 3: Dopamine > 5 OR Norepinephrine <= 0.1 ug/kg/min OR Epinephrine <= 0.1
  // 4: Dopamine > 15 OR Norepinephrine > 0.1 ug/kg/min OR Epinephrine > 0.1
  let cv = 0;
  const norepi = activeVasopressors.norepinephrine || 0;
  const epi = activeVasopressors.epinephrine || 0;
  const dopamine = activeVasopressors.dopamine || 0;
  const dobutamine = activeVasopressors.dobutamine || 0;

  if (norepi > 0.1 || epi > 0.1 || dopamine > 15) {
    cv = 4;
  } else if ((norepi > 0 && norepi <= 0.1) || (epi > 0 && epi <= 0.1) || (dopamine > 5 && dopamine <= 15)) {
    cv = 3;
  } else if ((dopamine > 0 && dopamine <= 5) || dobutamine > 0) {
    cv = 2;
  } else if (vitals.map !== null && vitals.map < 70) {
    cv = 1;
  } else {
    cv = 0;
  }

  // 2. Renal SOFA (Creatinine in mg/dL)
  // 0: < 1.2
  // 1: 1.2 - 1.9
  // 2: 2.0 - 3.4
  // 3: 3.5 - 4.9 (or UOP < 500 mL/d)
  // 4: >= 5.0 (or UOP < 200 mL/d)
  let renal = 0;
  const cr = labs.creatinine_mg_dl;
  if (cr !== null && cr !== undefined) {
    if (cr >= 5.0) renal = 4;
    else if (cr >= 3.5) renal = 3;
    else if (cr >= 2.0) renal = 2;
    else if (cr >= 1.2) renal = 1;
  }

  // 3. Coagulation SOFA (Platelets x 10^3/uL)
  // 0: >= 150
  // 1: < 150
  // 2: < 100
  // 3: < 50
  // 4: < 20
  let coag = 0;
  const plt = labs.platelets_k_ul;
  if (plt !== null && plt !== undefined) {
    if (plt < 20) coag = 4;
    else if (plt < 50) coag = 3;
    else if (plt < 100) coag = 2;
    else if (plt < 150) coag = 1;
  }

  // 4. Liver SOFA (Total Bilirubin in mg/dL)
  // 0: < 1.2
  // 1: 1.2 - 1.9
  // 2: 2.0 - 5.9
  // 3: 6.0 - 11.9
  // 4: >= 12.0
  let liver = 0;
  const bili = labs.bilirubin_total_mg_dl;
  if (bili !== null && bili !== undefined) {
    if (bili >= 12.0) liver = 4;
    else if (bili >= 6.0) liver = 3;
    else if (bili >= 2.0) liver = 2;
    else if (bili >= 1.2) liver = 1;
  }

  // 5. Respiration SOFA (PaO2/FiO2 or SaO2/FiO2 proxy)
  // 0: >= 400
  // 1: < 400
  // 2: < 300
  // 3: < 200
  // 4: < 100
  let resp = 0;
  const fio2 = labs.fio2 || 0.21;
  const o2sat = vitals.o2sat || 98;
  const ratio = o2sat / fio2;
  if (ratio < 100) resp = 4;
  else if (ratio < 200) resp = 3;
  else if (ratio < 300) resp = 2;
  else if (ratio < 400) resp = 1;

  const total = cv + renal + coag + liver + resp;

  return {
    total,
    cv,
    renal,
    coag,
    liver,
    resp
  };
}

/**
 * Classify Sepsis-3 Clinical Status
 */
export function classifySepsisStatus(sofa, vitals, labs, activeVasopressors = {}) {
  const lactMmol = labs.lactate_mmol_l;
  const mapVal = vitals.map;
  const onVasopressors = (activeVasopressors.norepinephrine || 0) > 0 || (activeVasopressors.epinephrine || 0) > 0;
  
  // Septic Shock: Persistent hypotension requiring vasopressors to maintain MAP >= 65 mmHg AND Lactate > 2.0 mmol/L
  const isShock = (sofa.total >= 2) && (mapVal < 65 || onVasopressors) && (lactMmol !== null && lactMmol > 2.0);
  
  if (isShock) {
    return {
      status: "Septic Shock",
      badgeColor: "bg-red-900 text-red-200 border-red-500",
      description: "Severe circulatory & cellular failure (SOFA >= 2, MAP < 65 / vasopressors active, Lactate > 2.0 mmol/L). Immediate 1-Hour bundle resuscitation required."
    };
  } else if (sofa.total >= 2) {
    return {
      status: "Sepsis-3 Confirmed",
      badgeColor: "bg-amber-900 text-amber-200 border-amber-500",
      description: "Acute life-threatening organ dysfunction present (Total SOFA >= 2). Rapid diagnostic evaluation and targeted bundle therapy required."
    };
  } else {
    return {
      status: "Non-Sepsis / SIRS",
      badgeColor: "bg-emerald-900 text-emerald-200 border-emerald-500",
      description: "No acute organ dysfunction (SOFA < 2). Monitor closely for physiological deterioration."
    };
  }
}

/**
 * Extract active clinical trigger tags for hybrid retrieval matching
 */
export function extractActiveTriggers(vitals, labs, sofa, selectedDrugs = [], simulatedInterventions = {}) {
  const triggers = new Set();
  
  if (sofa.total >= 2) triggers.add("SEPSIS3_CONFIRMED");
  else triggers.add("SEPSIS_SUSPECTED");

  if (vitals.map !== null && vitals.map < 65) {
    triggers.add("MAP_LT_65");
    triggers.add("HYPOTENSION");
  } else if (vitals.map !== null && vitals.map < 70) {
    triggers.add("MAP_LT_70");
  }

  const lact = labs.lactate_mmol_l;
  if (lact !== null && lact >= 4.0) {
    triggers.add("LACTATE_GE_4");
    triggers.add("LACTATE_GT_2");
    triggers.add("HYPERLACTATEMIA");
  } else if (lact !== null && lact > 2.0) {
    triggers.add("LACTATE_GT_2");
    triggers.add("HYPERLACTATEMIA");
  }

  const cr = labs.creatinine_mg_dl;
  if (cr !== null && cr >= 3.5) {
    triggers.add("CREATININE_GE_3_5");
    triggers.add("CREATININE_GE_2");
    triggers.add("CREATININE_GE_1_5");
    triggers.add("AKI_PRESENT");
    triggers.add("AKI_STAGE_3");
  } else if (cr !== null && cr >= 2.0) {
    triggers.add("CREATININE_GE_2");
    triggers.add("CREATININE_GE_1_5");
    triggers.add("AKI_PRESENT");
    triggers.add("AKI_STAGE_2");
  } else if (cr !== null && cr >= 1.2) {
    triggers.add("CREATININE_GE_1_5");
    triggers.add("AKI_STAGE_1");
  }

  const bili = labs.bilirubin_total_mg_dl;
  if (bili !== null && bili >= 6.0) {
    triggers.add("BILIRUBIN_GE_6");
    triggers.add("BILIRUBIN_GE_2");
    triggers.add("HEPATIC_DYSFUNCTION");
  } else if (bili !== null && bili >= 2.0) {
    triggers.add("BILIRUBIN_GE_2");
    triggers.add("HEPATIC_DYSFUNCTION");
  }

  const plt = labs.platelets_k_ul;
  if (plt !== null && plt < 50) {
    triggers.add("PLATELETS_LT_50");
    triggers.add("PLATELETS_LT_100");
    triggers.add("THROMBOCYTOPENIA");
  } else if (plt !== null && plt < 100) {
    triggers.add("PLATELETS_LT_100");
    triggers.add("THROMBOCYTOPENIA");
  }

  if (sofa.resp >= 2) {
    triggers.add("RESP_SOFA_GE_2");
    triggers.add("HYPOXIA");
  }

  // Selected antibiotics
  for (const drug of selectedDrugs) {
    if (drug === "vancomycin") triggers.add("DRUG_VANCOMYCIN");
    if (drug === "piperacillin_tazobactam") triggers.add("DRUG_PIPERACILLIN_TAZOBACTAM");
    if (drug === "cefepime") triggers.add("DRUG_CEFEPIME");
    if (drug === "meropenem") triggers.add("DRUG_MEROPENEM");
    if (drug === "gentamicin") triggers.add("DRUG_GENTAMICIN");
  }

  if (selectedDrugs.length > 0) {
    triggers.add("ANTIBIOTICS_ORDERED");
  }

  // Vasopressors & Fluids
  if ((simulatedInterventions.norepinephrine || 0) > 0) {
    triggers.add("VASOPRESSOR_ACTIVE");
    if (simulatedInterventions.norepinephrine >= 0.25) {
      triggers.add("NOREPINEPHRINE_HIGH");
      triggers.add("REFRACTORY_SHOCK");
    }
  }

  if ((simulatedInterventions.fluidBolusMlKg || 0) > 0) {
    triggers.add("FLUID_ORDERED");
  }

  return Array.from(triggers);
}
