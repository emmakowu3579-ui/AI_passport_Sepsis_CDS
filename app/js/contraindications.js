/**
 * Deterministic Organ-Function & Antimicrobial Contraindication Engine
 * Real-time checks for drug safety, nephrotoxicity, neurotoxicity, and volume overload.
 */

export function evaluateContraindications(vitals, labs, sofa, selectedDrugs = [], interventions = {}) {
  const alerts = [];
  const cr = labs.creatinine_mg_dl || 0.9;
  const bili = labs.bilirubin_total_mg_dl || 0.6;
  const plt = labs.platelets_k_ul || 200;
  const respRatio = (vitals.o2sat || 98) / (labs.fio2 || 0.21);
  const fluidBolus = interventions.fluidBolusMlKg || 0;
  const norepi = interventions.norepinephrine || 0;
  const hasVanc = selectedDrugs.includes("vancomycin");
  const hasPipTazo = selectedDrugs.includes("piperacillin_tazobactam");
  const hasCefepime = selectedDrugs.includes("cefepime");
  const hasMeropenem = selectedDrugs.includes("meropenem");
  const hasGentamicin = selectedDrugs.includes("gentamicin");

  // 1. Vancomycin + Piperacillin-Tazobactam Synergistic AKI Warning
  if (hasVanc && hasPipTazo) {
    if (cr >= 1.5) {
      alerts.push({
        id: "ALERT-VANC-ZOYSN-NEPHRO",
        drug: "Vancomycin + Piperacillin-Tazobactam",
        level: "CRITICAL_HAZARD",
        badge: "Severe AKI Risk (2-3x Increase)",
        citation: "DOSE-VANC-CONTRA-01",
        title: "Synergistic Acute Kidney Injury Alert",
        message: `Patient has acute renal impairment (Creatinine ${cr.toFixed(1)} mg/dL). Co-administration of Vancomycin and Piperacillin-Tazobactam produces a 2- to 3-fold higher incidence of acute kidney injury compared to Vancomycin + Cefepime or Meropenem.`,
        recommendation: "Strongly consider substituting Cefepime (renally adjusted) or Meropenem for Piperacillin-Tazobactam."
      });
    } else {
      alerts.push({
        id: "ALERT-VANC-ZOSYN-MONITOR",
        drug: "Vancomycin + Piperacillin-Tazobactam",
        level: "CAUTION",
        badge: "Renal Surveillance Required",
        citation: "DOSE-VANC-CONTRA-01",
        title: "Potential Synergistic Nephrotoxicity",
        message: "Baseline renal function is preserved, but this combination carries known synergistic nephrotoxicity.",
        recommendation: "Monitor daily serum creatinine and transition to targeted monotherapy as soon as cultures return."
      });
    }
  }

  // 2. Cefepime Neurotoxicity Alert
  if (hasCefepime && cr >= 1.5) {
    alerts.push({
      id: "ALERT-CEFEPIME-NEURO",
      drug: "Cefepime (Maxipime)",
      level: "CRITICAL_HAZARD",
      badge: "Black-Box Neurotoxicity Warning",
      citation: "DOSE-CEFEPIME-CONTRA-01",
      title: "Mandatory Cefepime Renal Dose Adjustment",
      message: `Serum Creatinine is ${cr.toFixed(1)} mg/dL (SOFA Renal ${sofa.renal}). Failure to adjust Cefepime in renal impairment induces high rates of severe neurotoxicity (encephalopathy, myoclonus, confusion, and non-convulsive status epilepticus).`,
      recommendation: `Administer full initial loading dose (2 g IV), then strictly reduce maintenance: for Cr 1.5-2.5 mg/dL give 2 g IV every 12 hours (extended infusion); if Cr > 2.5 mg/dL give 2 g IV every 24 hours.`
    });
  }

  // 3. Gentamicin Contraindication in AKI
  if (hasGentamicin) {
    if (cr >= 1.5) {
      alerts.push({
        id: "ALERT-GENT-CONTRA-AKI",
        drug: "Gentamicin",
        level: "CRITICAL_HAZARD",
        badge: "Contraindicated in Acute Kidney Injury",
        citation: "DOSE-GENT-CONTRA-01",
        title: "Acute Tubular Necrosis & Ototoxicity Hazard",
        message: `Gentamicin is contraindicated in established AKI (Creatinine ${cr.toFixed(1)} mg/dL). Aminoglycoside accumulation rapidly causes severe irreversible acute tubular necrosis and permanent bilateral vestibulocochlear damage.`,
        recommendation: "Discontinue Gentamicin immediately; replace with Meropenem or Cefepime for broad Gram-negative bacilli coverage."
      });
    } else {
      alerts.push({
        id: "ALERT-GENT-TDM",
        drug: "Gentamicin",
        level: "CAUTION",
        badge: "Therapeutic Drug Monitoring Required",
        citation: "DOSE-GENT-02",
        title: "Gentamicin Once-Daily Protocol",
        message: "Gentamicin requires pre-dose trough level monitoring (< 1.0 mcg/mL).",
        recommendation: "Administer 5-7 mg/kg once daily. Limit course to maximum 3-5 days."
      });
    }
  }

  // 4. Vancomycin Renal Dosing & Monitoring
  if (hasVanc && cr >= 1.5) {
    alerts.push({
      id: "ALERT-VANC-RENAL",
      drug: "Vancomycin",
      level: "CAUTION",
      badge: "Renal Adjustment & AUC TDM Required",
      citation: "DOSE-VANC-02",
      title: "Vancomycin Renal Maintenance Dosing",
      message: `Creatinine is ${cr.toFixed(1)} mg/dL. Standard q12h dosing will lead to nephrotoxic drug accumulation.`,
      recommendation: "Administer standard loading dose 25-30 mg/kg actual weight, then reduce maintenance to 15 mg/kg IV q24h (or guided by 24-hr AUC/MIC Bayesian software targeting 400-600)."
    });
  }

  // 5. Meropenem Renal Dosing
  if (hasMeropenem && cr >= 1.8) {
    alerts.push({
      id: "ALERT-MERO-RENAL",
      drug: "Meropenem",
      level: "CAUTION",
      badge: "Dose Reduction Required",
      citation: "DOSE-MEROPENEM-02",
      title: "Meropenem Renal Clearance Adjustment",
      message: `Estimated renal impairment (Creatinine ${cr.toFixed(1)} mg/dL) slows meropenem clearance, increasing drug exposure and potential neurotoxicity.`,
      recommendation: "Reduce maintenance to 1 g IV every 12 hours (extended 3-hour infusion) instead of standard q8h."
    });
  }

  // 6. Fluid Overload / Pulmonary Edema Risk
  if (fluidBolus >= 30 && respRatio < 250) {
    alerts.push({
      id: "ALERT-FLUID-OVERLOAD",
      drug: "IV Fluid Resuscitation",
      level: "CRITICAL_HAZARD",
      badge: "Volume Overload / Pulmonary Edema Risk",
      citation: "SSC-2021-FLUID-03",
      title: "Compromised Respiratory Compliance",
      message: `Patient presents with acute hypoxemic respiratory compromise (SaO2/FiO2 ratio: ${Math.round(respRatio)}). An aggressive 30 mL/kg fluid bolus without assessed fluid responsiveness carries high risk of acute pulmonary edema and worsening ARDS.`,
      recommendation: "Use dynamic measures of fluid responsiveness (passive leg raise or stroke volume variation) rather than fixed boluses. Consider early norepinephrine titration to maintain MAP >= 65 mmHg while limiting crystalloids."
    });
  }

  // 7. Refractory Septic Shock Alert
  if (norepi >= 0.25 && (vitals.map < 65 || interventions.simulatedMap < 65)) {
    alerts.push({
      id: "ALERT-REFRACTORY-SHOCK",
      drug: "Norepinephrine Escalation",
      level: "CRITICAL_HAZARD",
      badge: "Refractory Septic Shock Escalation",
      citation: "ESCALATE-REFRACTORY-01",
      title: "ICU Attending & Dual Vasopressor Required",
      message: `Persistent hypotension (MAP < 65 mmHg) despite high-dose Norepinephrine (${norepi.toFixed(2)} mcg/kg/min).`,
      recommendation: "Initiate Vasopressin at 0.03 units/min. Add IV Hydrocortisone 200 mg/day (50 mg q6h). Place invasive arterial line and request immediate Critical Care consultation."
    });
  }

  // 8. Hepatic Clearance Caution
  if (bili >= 2.0 && selectedDrugs.length > 0) {
    alerts.push({
      id: "ALERT-HEPATIC-SOFA",
      drug: "Hepatic Metabolism",
      level: "CAUTION",
      badge: "Hepatic Dysfunction (Bilirubin >= 2.0)",
      citation: "SEPSIS3-SOFA-LIVER",
      title: "Liver Impairment Monitoring",
      message: `Total Bilirubin is ${bili.toFixed(1)} mg/dL (SOFA Liver ${sofa.liver}). Monitor coagulation factors (PTT, Platelets) and avoid hepatotoxic adjunctive medications.`,
      recommendation: "Review antimicrobial panel; beta-lactams and vancomycin are renally cleared and acceptable if renal function is monitored."
    });
  }

  return alerts;
}
