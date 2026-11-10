import os
import json

CURATED_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "curated"))
os.makedirs(CURATED_DIR, exist_ok=True)

CHUNKS = [
    # =========================================================================
    # 1. SURVIVING SEPSIS CAMPAIGN (SSC) 2021: INITIAL RESUSCITATION & 1-HOUR BUNDLE
    # =========================================================================
    {
        "id": "SSC-2021-EMERG-01",
        "title": "Medical Emergency & Immediate Resuscitation",
        "category": "Initial Resuscitation",
        "source": "Surviving Sepsis Campaign 2021 Guidelines, Rec 4",
        "evidence_grade": "Best Practice Statement",
        "clinical_triggers": ["SEPSIS_SUSPECTED", "SEPSIS3_CONFIRMED", "MAP_LT_65", "LACTATE_GT_2"],
        "escalation_level": "STANDARD",
        "text": "Sepsis and septic shock are medical emergencies, and we recommend that treatment and resuscitation begin immediately. Early recognition and timely intervention prevent worsening organ dysfunction and reduce hospital mortality."
    },
    {
        "id": "SSC-2021-BUNDLE-01",
        "title": "1-Hour Bundle: Blood Lactate Measurement",
        "category": "Initial Resuscitation",
        "source": "Surviving Sepsis Campaign 2018/2021 Bundle Update, Rec 1",
        "evidence_grade": "Best Practice Statement",
        "clinical_triggers": ["SEPSIS_SUSPECTED", "LACTATE_GT_2", "LACTATE_GE_4"],
        "escalation_level": "STANDARD",
        "text": "Measure blood lactate level immediately upon presentation. An initial lactate level > 2.0 mmol/L (18 mg/dL) represents cellular metabolic stress and tissue hypoperfusion. Re-measure blood lactate within 2 to 4 hours to guide resuscitation and evaluate lactate clearance if the initial level is elevated."
    },
    {
        "id": "SSC-2021-BUNDLE-02",
        "title": "1-Hour Bundle: Blood Cultures Prior to Antibiotics",
        "category": "Initial Resuscitation",
        "source": "Surviving Sepsis Campaign 2021 Guidelines, Rec 10",
        "evidence_grade": "Best Practice Statement",
        "clinical_triggers": ["SEPSIS_SUSPECTED", "ANTIBIOTICS_ORDERED", "FEVER", "LEUKOCYTOSIS"],
        "escalation_level": "STANDARD",
        "text": "For adults with suspected sepsis or septic shock, obtain routine microbiologic blood cultures (at least two sets of aerobic and anaerobic bottles) prior to starting antimicrobial therapy, provided this does not substantially delay the start of antimicrobials (do not delay > 45 minutes)."
    },
    {
        "id": "SSC-2021-BUNDLE-03",
        "title": "1-Hour Bundle: Immediate Broad-Spectrum Antimicrobials",
        "category": "Initial Resuscitation",
        "source": "Surviving Sepsis Campaign 2021 Guidelines, Rec 11",
        "evidence_grade": "Strong recommendation, moderate-quality evidence",
        "clinical_triggers": ["SEPSIS3_CONFIRMED", "SEPTIC_SHOCK", "MAP_LT_65"],
        "escalation_level": "STANDARD",
        "text": "For adults with possible septic shock or a high likelihood for sepsis, administer IV broad-spectrum antimicrobials immediately, ideally within 1 hour of recognition. Each hour of antimicrobial delay in septic shock is associated with an incremental increase in mortality."
    },
    {
        "id": "SSC-2021-FLUID-01",
        "title": "1-Hour/3-Hour Bundle: Initial 30 mL/kg Crystalloid Resuscitation",
        "category": "Fluid Therapy",
        "source": "Surviving Sepsis Campaign 2021 Guidelines, Rec 5",
        "evidence_grade": "Strong recommendation, low-quality evidence",
        "clinical_triggers": ["MAP_LT_65", "LACTATE_GE_4", "HYPOTENSION", "SEPTIC_SHOCK"],
        "escalation_level": "STANDARD",
        "text": "For patients with sepsis-induced hypoperfusion or septic shock, administer at least 30 mL/kg of IV crystalloid fluid within the first 3 hours of resuscitation. Sepsis-induced hypoperfusion is defined as acute hypotension (MAP < 65 mmHg, SBP < 90 mmHg, or decrease in SBP > 40 mmHg) or hyperlactatemia (serum lactate >= 4.0 mmol/L [36 mg/dL])."
    },
    {
        "id": "SSC-2021-FLUID-02",
        "title": "Choice of Fluid: Balanced Crystalloids vs Normal Saline",
        "category": "Fluid Therapy",
        "source": "Surviving Sepsis Campaign 2021 Guidelines, Rec 14",
        "evidence_grade": "Weak recommendation, moderate-quality evidence",
        "clinical_triggers": ["FLUID_ORDERED", "AKI_STAGE_1", "AKI_STAGE_2", "ACIDOSIS"],
        "escalation_level": "STANDARD",
        "text": "For adults with sepsis or septic shock, we suggest using balanced crystalloids (e.g., Lactated Ringer's or Plasma-Lyte) rather than 0.9% normal saline for resuscitation. Large volumes of 0.9% normal saline induce hyperchloremic metabolic acidosis and renal vasoconstriction, increasing acute kidney injury and renal replacement therapy requirements."
    },
    {
        "id": "SSC-2021-FLUID-03",
        "title": "Fluid Responsiveness & Dynamic Measures Over Static CVP",
        "category": "Fluid Therapy",
        "source": "Surviving Sepsis Campaign 2021 Guidelines, Rec 6",
        "evidence_grade": "Weak recommendation, very low-quality evidence",
        "clinical_triggers": ["FLUID_OVERLOAD_RISK", "RESP_SOFA_GE_2", "PULMONARY_EDEMA"],
        "escalation_level": "CAUTION",
        "text": "For adults with sepsis or septic shock, we suggest using dynamic measures to guide fluid resuscitation (e.g., passive leg raising [PLR] coupled with real-time cardiac output measurement, pulse pressure variation [PPV], stroke volume variation [SVV]) over static parameters (such as central venous pressure [CVP]). Repeated fixed fluid boluses without assessed responsiveness promote dangerous positive fluid balance and pulmonary edema."
    },
    {
        "id": "SSC-2021-FLUID-04",
        "title": "Use of Albumin in Large-Volume Resuscitation",
        "category": "Fluid Therapy",
        "source": "Surviving Sepsis Campaign 2021 Guidelines, Rec 16",
        "evidence_grade": "Weak recommendation, moderate-quality evidence",
        "clinical_triggers": ["REFRACTORY_HYPOTENSION", "LARGE_VOLUME_FLUIDS"],
        "escalation_level": "STANDARD",
        "text": "In adults with sepsis or septic shock who have received large volumes of crystalloids (e.g., > 30-50 mL/kg) and remain hemodynamically unstable, we suggest using 5% or 20% albumin in addition to crystalloids rather than crystalloids alone."
    },
    {
        "id": "SSC-2021-FLUID-05",
        "title": "Against Hydroxyethyl Starches & Gelatins",
        "category": "Fluid Therapy",
        "source": "Surviving Sepsis Campaign 2021 Guidelines, Rec 17-18",
        "evidence_grade": "Strong recommendation, moderate-quality evidence",
        "clinical_triggers": ["COLLOID_ORDERED", "AKI_PRESENT"],
        "escalation_level": "ESCALATE_CRITICAL",
        "text": "For adults with sepsis or septic shock, we recommend AGAINST using hydroxyethyl starches (HES) for resuscitation due to increased mortality and increased need for renal replacement therapy. We also suggest against using gelatins for resuscitation."
    },
    {
        "id": "SSC-2021-VASO-01",
        "title": "Target Mean Arterial Pressure (MAP) >= 65 mmHg",
        "category": "Vasopressors & Hemodynamics",
        "source": "Surviving Sepsis Campaign 2021 Guidelines, Rec 8",
        "evidence_grade": "Strong recommendation, moderate-quality evidence",
        "clinical_triggers": ["MAP_LT_65", "SEPTIC_SHOCK"],
        "escalation_level": "STANDARD",
        "text": "For adults with septic shock on vasopressors, we recommend targeting an initial Mean Arterial Pressure (MAP) of 65 mmHg rather than higher MAP targets (e.g., 75-85 mmHg). Targeting higher MAP increases arrhythmias and vasopressor exposure without conferring survival or renal benefit, except possibly in chronic hypertension patients."
    },
    {
        "id": "SSC-2021-VASO-02",
        "title": "First-Line Vasopressor: Norepinephrine",
        "category": "Vasopressors & Hemodynamics",
        "source": "Surviving Sepsis Campaign 2021 Guidelines, Rec 20",
        "evidence_grade": "Strong recommendation, high-quality evidence",
        "clinical_triggers": ["MAP_LT_65", "VASOPRESSOR_INITIATION", "SEPTIC_SHOCK"],
        "escalation_level": "STANDARD",
        "text": "For adults with septic shock, we recommend norepinephrine as the first-choice vasopressor over other vasoactive agents. Norepinephrine should be initiated promptly if MAP remains < 65 mmHg during or immediately after fluid bolus administration to restore organ perfusion pressure."
    },
    {
        "id": "SSC-2021-VASO-03",
        "title": "Second-Line Vasopressor: Vasopressin Addition",
        "category": "Vasopressors & Hemodynamics",
        "source": "Surviving Sepsis Campaign 2021 Guidelines, Rec 21",
        "evidence_grade": "Weak recommendation, moderate-quality evidence",
        "clinical_triggers": ["NOREPINEPHRINE_HIGH", "REFRACTORY_SHOCK", "MAP_LT_65"],
        "escalation_level": "CAUTION",
        "text": "For adults with septic shock on norepinephrine with inadequate MAP levels, we suggest adding vasopressin (titrated up to a fixed dose of 0.03 units/min) instead of escalating norepinephrine alone. Vasopressin acts on V1a vascular receptors, restores endogenous vasopressin deficiency, and reduces norepinephrine dosage requirements."
    },
    {
        "id": "SSC-2021-VASO-04",
        "title": "Third-Line Vasopressor: Epinephrine Addition",
        "category": "Vasopressors & Hemodynamics",
        "source": "Surviving Sepsis Campaign 2021 Guidelines, Rec 22",
        "evidence_grade": "Weak recommendation, low-quality evidence",
        "clinical_triggers": ["REFRACTORY_SHOCK", "NOREPINEPHRINE_HIGH", "MAP_LT_65"],
        "escalation_level": "ESCALATE_CRITICAL",
        "text": "For adults with septic shock and inadequate MAP levels despite norepinephrine and vasopressin, we suggest adding epinephrine (0.01 to 0.5 mcg/kg/min). Note that epinephrine increases aerobic glycolysis, which can elevate serum lactate levels independently of tissue hypoxia."
    },
    {
        "id": "SSC-2021-VASO-05",
        "title": "Against Dopamine as First-Line Vasopressor",
        "category": "Vasopressors & Hemodynamics",
        "source": "Surviving Sepsis Campaign 2021 Guidelines, Rec 23",
        "evidence_grade": "Strong recommendation, high-quality evidence",
        "clinical_triggers": ["DOPAMINE_ORDERED", "ARRHYTHMIA_RISK"],
        "escalation_level": "CAUTION",
        "text": "For adults with septic shock, we recommend AGAINST using dopamine as first-line vasopressor therapy compared to norepinephrine. Dopamine is associated with significantly higher rates of tachyarrhythmias (both supraventricular and ventricular) and excess mortality in septic shock."
    },
    {
        "id": "SSC-2021-VASO-06",
        "title": "Inotropic Therapy: Dobutamine for Myocardial Dysfunction",
        "category": "Vasopressors & Hemodynamics",
        "source": "Surviving Sepsis Campaign 2021 Guidelines, Rec 25",
        "evidence_grade": "Weak recommendation, low-quality evidence",
        "clinical_triggers": ["MYOCARDIAL_DYSFUNCTION", "PERSISTENT_HYPOPERFUSION", "LOW_CARDIAC_OUTPUT"],
        "escalation_level": "CAUTION",
        "text": "For adults with septic shock and persistent hypoperfusion (elevated lactate, oliguria, cold extremities) despite adequate volume and adequate MAP, or in presence of documented myocardial dysfunction, we suggest adding dobutamine (2.5-20 mcg/kg/min) to norepinephrine or using epinephrine alone."
    },
    {
        "id": "SSC-2021-VASO-07",
        "title": "Peripheral Vasopressor Administration Prior to Central Access",
        "category": "Vasopressors & Hemodynamics",
        "source": "Surviving Sepsis Campaign 2021 Guidelines, Rec 27",
        "evidence_grade": "Weak recommendation, low-quality evidence",
        "clinical_triggers": ["VASOPRESSOR_INITIATION", "NO_CENTRAL_LINE"],
        "escalation_level": "STANDARD",
        "text": "For adults with septic shock, we suggest starting vasopressors peripherally to restore MAP immediately rather than delaying initiation until central venous access is secured. Vasopressors infused through an antecubital or proximal vein with close monitoring for extravasation are safe for up to 6 to 24 hours while central access is planned."
    },
    {
        "id": "SSC-2021-STEROID-01",
        "title": "Corticosteroids: Hydrocortisone for Refractory Septic Shock",
        "category": "Adjunctive Therapies",
        "source": "Surviving Sepsis Campaign 2021 Guidelines, Rec 35",
        "evidence_grade": "Weak recommendation, moderate-quality evidence",
        "clinical_triggers": ["REFRACTORY_SHOCK", "NOREPINEPHRINE_HIGH", "VASOPRESSIN_ACTIVE"],
        "escalation_level": "CAUTION",
        "text": "For adults with septic shock and an ongoing requirement for vasopressor therapy (norepinephrine dose >= 0.25 mcg/kg/min or refractory shock requiring dual vasopressors for > 4 hours), we suggest using IV corticosteroids. The recommended regimen is IV hydrocortisone 200 mg/day administered as 50 mg IV every 6 hours or as a continuous infusion."
    },
    {
        "id": "SSC-2021-ANTIMIC-01",
        "title": "Antimicrobial Administration Timing in Sepsis vs Shock",
        "category": "Antimicrobial Stewardship",
        "source": "Surviving Sepsis Campaign 2021 Guidelines, Rec 11-12",
        "evidence_grade": "Strong recommendation (shock) / Weak recommendation (sepsis)",
        "clinical_triggers": ["SEPSIS_SUSPECTED", "SEPTIC_SHOCK"],
        "escalation_level": "STANDARD",
        "text": "For adults with definite or probable septic shock, administer antimicrobials immediately (within 1 hour of recognition). For adults with sepsis without shock where infection is possible but unconfirmed, perform rapid diagnostic evaluation and administer antimicrobials within 3 hours if infection remains suspected."
    },
    {
        "id": "SSC-2021-ANTIMIC-02",
        "title": "Prolonged Beta-Lactam Infusion (Pharmacokinetics/Pharmacodynamics)",
        "category": "Antimicrobial Stewardship",
        "source": "Surviving Sepsis Campaign 2021 Guidelines, Rec 30",
        "evidence_grade": "Weak recommendation, moderate-quality evidence",
        "clinical_triggers": ["DRUG_PIPERACILLIN_TAZOBACTAM", "DRUG_CEFEPIME", "DRUG_MEROPENEM"],
        "escalation_level": "STANDARD",
        "text": "For adults with sepsis or septic shock, we suggest prolonged infusion of beta-lactams (either extended infusion over 3-4 hours or continuous infusion) following an initial loading dose, rather than conventional short 30-minute intermittent infusions, to optimize time above MIC (fT > MIC) in hyperdynamic or critically ill patients."
    },
    {
        "id": "SSC-2021-ANTIMIC-03",
        "title": "Empiric MRSA Coverage Risk Assessment",
        "category": "Antimicrobial Stewardship",
        "source": "Surviving Sepsis Campaign 2021 Guidelines, Rec 28",
        "evidence_grade": "Strong recommendation, low-quality evidence",
        "clinical_triggers": ["MRSA_RISK", "DRUG_VANCOMYCIN"],
        "escalation_level": "STANDARD",
        "text": "For adults with sepsis or septic shock at high risk for methicillin-resistant Staphylococcus aureus (MRSA) (e.g., prior MRSA colonization, recent hospitalization, hemodialysis, chronic indwelling lines, parenteral drug use), we recommend using empiric antimicrobials with MRSA coverage (e.g., Vancomycin). Conversely, if the patient is at low risk, empiric MRSA coverage should be omitted."
    },
    {
        "id": "SSC-2021-ANTIMIC-04",
        "title": "Daily Antimicrobial De-Escalation Assessment",
        "category": "Antimicrobial Stewardship",
        "source": "Surviving Sepsis Campaign 2021 Guidelines, Rec 32",
        "evidence_grade": "Best Practice Statement",
        "clinical_triggers": ["ANTIBIOTICS_ACTIVE", "CULTURE_RESULTS_PENDING"],
        "escalation_level": "STANDARD",
        "text": "For adults with sepsis or septic shock, we recommend daily assessment for de-escalation of antimicrobial therapy based on culture results, pathogen susceptibilities, and clinical trajectory. Promptly discontinue broad-spectrum coverage when sensitivities return or non-infectious etiology is identified."
    },
    {
        "id": "SSC-2021-TRANSFUSION-01",
        "title": "Restrictive RBC Transfusion Strategy (Hb < 7.0 g/dL)",
        "category": "Supportive Care",
        "source": "Surviving Sepsis Campaign 2021 Guidelines, Rec 37",
        "evidence_grade": "Strong recommendation, moderate-quality evidence",
        "clinical_triggers": ["ANEMIA", "LOW_HEMOGLOBIN"],
        "escalation_level": "STANDARD",
        "text": "For adults with sepsis or septic shock, we recommend a restrictive RBC transfusion strategy, transfusing red blood cells only when hemoglobin decreases to < 7.0 g/dL, targeting a hemoglobin of 7.0 to 9.0 g/dL, unless specific comorbidities (such as myocardial ischemia, severe hypoxemia, or acute hemorrhage) are present."
    },
    {
        "id": "SSC-2021-GLUCOSE-01",
        "title": "Glycemic Control: Insulin Protocol for Blood Glucose >= 180 mg/dL",
        "category": "Supportive Care",
        "source": "Surviving Sepsis Campaign 2021 Guidelines, Rec 44",
        "evidence_grade": "Strong recommendation, moderate-quality evidence",
        "clinical_triggers": ["HYPERGLYCEMIA", "HIGH_GLUCOSE"],
        "escalation_level": "STANDARD",
        "text": "For adults with sepsis or septic shock, we recommend initiating insulin therapy at a threshold blood glucose level >= 180 mg/dL (10.0 mmol/L). Following initiation, target a blood glucose range of 144 to 180 mg/dL (8.0-10.0 mmol/L). Avoid tight glucose control (80-110 mg/dL) due to high risk of severe hypoglycemia and mortality."
    },
    {
        "id": "SSC-2021-BICARB-01",
        "title": "Sodium Bicarbonate: Only for Severe Acidemia (pH <= 7.20) with AKI",
        "category": "Supportive Care",
        "source": "Surviving Sepsis Campaign 2021 Guidelines, Rec 47",
        "evidence_grade": "Weak recommendation, low-quality evidence",
        "clinical_triggers": ["METABOLIC_ACIDOSIS", "LOW_PH", "AKI_STAGE_2", "AKI_STAGE_3"],
        "escalation_level": "CAUTION",
        "text": "For adults with septic shock and severe metabolic acidemia (pH <= 7.20) and acute kidney injury (AKIN/KDIGO stage 2-3 or Creatinine >= 2.0 mg/dL), we suggest using sodium bicarbonate therapy. We recommend against the routine use of sodium bicarbonate therapy to improve hemodynamics in patients with hypoperfusion-induced lactic acidemia when pH > 7.20."
    },
    {
        "id": "SSC-2021-ARDS-01",
        "title": "Lung-Protective Ventilation in Sepsis-Induced ARDS",
        "category": "Respiratory Care",
        "source": "Surviving Sepsis Campaign 2021 Guidelines, Rec 58",
        "evidence_grade": "Strong recommendation, high-quality evidence",
        "clinical_triggers": ["RESP_SOFA_GE_2", "RESP_SOFA_GE_3", "ARDS_SUSPECTED"],
        "escalation_level": "STANDARD",
        "text": "For adults with sepsis-induced acute respiratory distress syndrome (ARDS), we recommend using a low tidal volume ventilation strategy (4-8 mL/kg of predicted body weight) over higher tidal volumes, and targeting an end-inspiratory plateau pressure < 30 cm H2O to prevent barotrauma and ventilator-induced lung injury."
    },

    # =========================================================================
    # 2. SEPSIS-3 INTERNATIONAL CONSENSUS DEFINITIONS & SOFA SCORING CRITERIA
    # =========================================================================
    {
        "id": "SEPSIS3-DEF-01",
        "title": "Sepsis-3 Definition: Life-Threatening Organ Dysfunction",
        "category": "Sepsis-3 Definitions",
        "source": "The Third International Consensus Definitions for Sepsis (JAMA 2016)",
        "evidence_grade": "Consensus Definition",
        "clinical_triggers": ["SEPSIS_SUSPECTED", "SOFA_GE_2"],
        "escalation_level": "STANDARD",
        "text": "Sepsis is defined as life-threatening organ dysfunction caused by a dysregulated host response to infection. Clinically, organ dysfunction is operationalized as an acute increase in total SOFA score of >= 2 points resulting from the infection. Baseline SOFA is assumed to be 0 in patients not known to have preexisting chronic organ dysfunction."
    },
    {
        "id": "SEPSIS3-SHOCK-01",
        "title": "Sepsis-3 Septic Shock Definition & Clinical Criteria",
        "category": "Sepsis-3 Definitions",
        "source": "The Third International Consensus Definitions for Sepsis (JAMA 2016)",
        "evidence_grade": "Consensus Definition",
        "clinical_triggers": ["SEPTIC_SHOCK", "MAP_LT_65", "LACTATE_GT_2"],
        "escalation_level": "ESCALATE_CRITICAL",
        "text": "Septic shock is defined as a subset of sepsis in which underlying circulatory and cellular/metabolic abnormalities are profound enough to substantially increase mortality (in-hospital mortality > 40%). Clinically identified by: (1) Persistent hypotension requiring vasopressors to maintain MAP >= 65 mmHg, AND (2) Serum lactate > 2.0 mmol/L (18 mg/dL) despite adequate volume resuscitation."
    },
    {
        "id": "SEPSIS3-QSOFA-01",
        "title": "qSOFA Screening: Bedside Criteria Outside the ICU",
        "category": "Sepsis-3 Definitions",
        "source": "The Third International Consensus Definitions for Sepsis (JAMA 2016)",
        "evidence_grade": "Consensus Screening Tool",
        "clinical_triggers": ["QSOFA_SCREENING", "BEDSIDE_EVALUATION"],
        "escalation_level": "STANDARD",
        "text": "qSOFA (quick SOFA) criteria identify patients with suspected infection outside the ICU at risk of deterioration: (1) Respiratory rate >= 22 breaths/min, (2) Altered mentation (GCS < 15), and (3) Systolic blood pressure <= 100 mmHg. Presence of >= 2 criteria suggests high risk of poor outcome and warrants prompt formal SOFA calculation and diagnostic workup."
    },
    {
        "id": "SEPSIS3-SOFA-CV",
        "title": "SOFA Cardiovascular Scoring Criteria",
        "category": "Sepsis-3 Definitions",
        "source": "The Third International Consensus Definitions for Sepsis (JAMA 2016), Table 1",
        "evidence_grade": "Standardized Clinical Score",
        "clinical_triggers": ["MAP_LT_70", "MAP_LT_65", "VASOPRESSOR_ACTIVE"],
        "escalation_level": "STANDARD",
        "text": "Cardiovascular SOFA score tiers: Score 0: MAP >= 70 mmHg. Score 1: MAP < 70 mmHg. Score 2: Dopamine <= 5 mcg/kg/min or Dobutamine (any dose). Score 3: Dopamine > 5 mcg/kg/min OR Epinephrine <= 0.1 mcg/kg/min OR Norepinephrine <= 0.1 mcg/kg/min. Score 4: Dopamine > 15 mcg/kg/min OR Epinephrine > 0.1 mcg/kg/min OR Norepinephrine > 0.1 mcg/kg/min."
    },
    {
        "id": "SEPSIS3-SOFA-RENAL",
        "title": "SOFA Renal Scoring Criteria",
        "category": "Sepsis-3 Definitions",
        "source": "The Third International Consensus Definitions for Sepsis (JAMA 2016), Table 1",
        "evidence_grade": "Standardized Clinical Score",
        "clinical_triggers": ["CREATININE_GE_1_2", "CREATININE_GE_2", "CREATININE_GE_3_5", "AKI_PRESENT"],
        "escalation_level": "STANDARD",
        "text": "Renal SOFA score tiers based on Creatinine: Score 0: Creatinine < 1.2 mg/dL (< 110 umol/L). Score 1: Creatinine 1.2 to 1.9 mg/dL (110-170 umol/L). Score 2: Creatinine 2.0 to 3.4 mg/dL (171-299 umol/L). Score 3: Creatinine 3.5 to 4.9 mg/dL (300-440 umol/L) or urine output < 500 mL/day. Score 4: Creatinine >= 5.0 mg/dL (> 440 umol/L) or urine output < 200 mL/day."
    },
    {
        "id": "SEPSIS3-SOFA-COAG",
        "title": "SOFA Coagulation Scoring Criteria",
        "category": "Sepsis-3 Definitions",
        "source": "The Third International Consensus Definitions for Sepsis (JAMA 2016), Table 1",
        "evidence_grade": "Standardized Clinical Score",
        "clinical_triggers": ["PLATELETS_LT_150", "PLATELETS_LT_100", "PLATELETS_LT_50", "THROMBOCYTOPENIA"],
        "escalation_level": "STANDARD",
        "text": "Coagulation SOFA score tiers based on Platelets: Score 0: Platelets >= 150 x 10^3/uL. Score 1: Platelets < 150 x 10^3/uL. Score 2: Platelets < 100 x 10^3/uL. Score 3: Platelets < 50 x 10^3/uL. Score 4: Platelets < 20 x 10^3/uL."
    },
    {
        "id": "SEPSIS3-SOFA-LIVER",
        "title": "SOFA Liver Scoring Criteria",
        "category": "Sepsis-3 Definitions",
        "source": "The Third International Consensus Definitions for Sepsis (JAMA 2016), Table 1",
        "evidence_grade": "Standardized Clinical Score",
        "clinical_triggers": ["BILIRUBIN_GE_1_2", "BILIRUBIN_GE_2", "BILIRUBIN_GE_6", "JAUNDICE"],
        "escalation_level": "STANDARD",
        "text": "Liver SOFA score tiers based on Total Bilirubin: Score 0: Bilirubin < 1.2 mg/dL (< 20 umol/L). Score 1: Bilirubin 1.2 to 1.9 mg/dL (20-32 umol/L). Score 2: Bilirubin 2.0 to 5.9 mg/dL (33-101 umol/L). Score 3: Bilirubin 6.0 to 11.9 mg/dL (102-204 umol/L). Score 4: Bilirubin >= 12.0 mg/dL (> 204 umol/L)."
    },
    {
        "id": "SEPSIS3-SOFA-RESP",
        "title": "SOFA Respiration Scoring Criteria",
        "category": "Sepsis-3 Definitions",
        "source": "The Third International Consensus Definitions for Sepsis (JAMA 2016), Table 1",
        "evidence_grade": "Standardized Clinical Score",
        "clinical_triggers": ["RESP_SOFA_GE_1", "RESP_SOFA_GE_2", "HYPOXIA"],
        "escalation_level": "STANDARD",
        "text": "Respiration SOFA score tiers based on PaO2/FiO2 (or SaO2/FiO2 proxy): Score 0: PaO2/FiO2 >= 400 mmHg (SaO2/FiO2 >= 400). Score 1: PaO2/FiO2 < 400 mmHg. Score 2: PaO2/FiO2 < 300 mmHg. Score 3: PaO2/FiO2 < 200 mmHg with ventilatory support. Score 4: PaO2/FiO2 < 100 mmHg with ventilatory support."
    },

    # =========================================================================
    # 3. ANTIMICROBIAL DOSING PROTOCOLS: VANCOMYCIN
    # =========================================================================
    {
        "id": "DOSE-VANC-01",
        "title": "Vancomycin: Sepsis Loading Dose Protocol",
        "category": "Antimicrobial Dosing",
        "source": "ASHP/IDSA/SIDP 2020 Guidelines & FDA Prescribing Information",
        "evidence_grade": "Strong recommendation, moderate-quality evidence",
        "clinical_triggers": ["DRUG_VANCOMYCIN", "SEPSIS3_CONFIRMED", "SEPTIC_SHOCK"],
        "escalation_level": "STANDARD",
        "text": "In severe sepsis or septic shock, administer a weight-based loading dose of 25 to 30 mg/kg IV (based on actual body weight, maximum single dose 2,000 to 3,000 mg) to rapidly achieve therapeutic target concentrations. Infuse at a rate not exceeding 1,000 mg/hour (or 10 mg/min) to prevent infusion-related histamine reactions (Red Man syndrome)."
    },
    {
        "id": "DOSE-VANC-02",
        "title": "Vancomycin: Maintenance Dosing Stratified by Renal Function",
        "category": "Renal Dosing",
        "source": "ASHP/IDSA/SIDP 2020 Guidelines & Sanford Guide 2024",
        "evidence_grade": "Mandatory Renal Protocol",
        "clinical_triggers": ["DRUG_VANCOMYCIN", "CREATININE_GE_1_2", "CREATININE_GE_1_5", "AKI_STAGE_1"],
        "escalation_level": "CAUTION",
        "text": "Vancomycin maintenance dosing following initial loading dose: (1) CrCl > 90 mL/min: 15-20 mg/kg IV q8-12h. (2) CrCl 50-89 mL/min: 15-20 mg/kg IV q12h. (3) CrCl 30-49 mL/min: 15 mg/kg IV q24h. (4) CrCl 15-29 mL/min: 15 mg/kg IV q24-48h. (5) CrCl < 15 mL/min or Anuric AKI: 15-25 mg/kg single dose; re-dose only when serum level < 15-20 mcg/mL. Note: in fluctuating AKI, monitor levels daily."
    },
    {
        "id": "DOSE-VANC-03",
        "title": "Vancomycin: Therapeutic AUC/MIC vs Trough Monitoring",
        "category": "Antimicrobial Stewardship",
        "source": "ASHP/IDSA/PIDS/SIDP 2020 Vancomycin Monitoring Guidelines",
        "evidence_grade": "Strong recommendation, moderate-quality evidence",
        "clinical_triggers": ["DRUG_VANCOMYCIN", "THERAPEUTIC_DRUG_MONITORING"],
        "escalation_level": "STANDARD",
        "text": "In patients with suspected or documented serious MRSA sepsis, target an AUC24/MIC ratio of 400 to 600 (assuming MIC <= 1 mg/L) guided by Bayesian estimation software or two-sample pharmacokinetic equations. AUC-guided dosing significantly reduces nephrotoxicity compared to targeting empirical high troughs of 15-20 mcg/mL."
    },
    {
        "id": "DOSE-VANC-CONTRA-01",
        "title": "Vancomycin + Piperacillin-Tazobactam Synergistic AKI Warning",
        "category": "Drug Safety Alerts",
        "source": "FDA Safety Alert & Clinical Infectious Diseases Meta-Analyses",
        "evidence_grade": "Critical Safety Alert",
        "clinical_triggers": ["DRUG_VANCOMYCIN", "DRUG_PIPERACILLIN_TAZOBACTAM", "CREATININE_GE_1_5", "AKI_PRESENT"],
        "escalation_level": "ESCALATE_CRITICAL",
        "contraindication_warning": "High risk of synergistic acute kidney injury",
        "text": "CO-ADMINISTRATION ALERT: The combination of Vancomycin + Piperacillin-Tazobactam (Vanc + Zosyn) is associated with a 2- to 3-fold higher incidence of acute kidney injury compared to Vancomycin + Cefepime or Vancomycin + Meropenem. In patients with preexisting renal impairment (Creatinine >= 1.5 mg/dL) or rising creatinine, strongly consider substituting Cefepime or Meropenem for Piperacillin-Tazobactam."
    },

    # =========================================================================
    # 4. ANTIMICROBIAL DOSING PROTOCOLS: PIPERACILLIN-TAZOBACTAM (ZOSYN)
    # =========================================================================
    {
        "id": "DOSE-PIPTAZO-01",
        "title": "Piperacillin-Tazobactam: Severe Sepsis Empiric Dosing",
        "category": "Antimicrobial Dosing",
        "source": "FDA Package Insert (Zosyn) & Sanford Guide 2024",
        "evidence_grade": "Standard Dosing Protocol",
        "clinical_triggers": ["DRUG_PIPERACILLIN_TAZOBACTAM", "SEPSIS3_CONFIRMED"],
        "escalation_level": "STANDARD",
        "text": "For severe sepsis and septic shock with suspected Pseudomonas aeruginosa or intra-abdominal/pulmonary source, the standard initial regimen is 4.5 g IV every 6 hours (administered as an extended infusion over 3 to 4 hours, or 30-minute standard infusion). Do not reduce the initial loading dose in acute sepsis regardless of renal function."
    },
    {
        "id": "DOSE-PIPTAZO-02",
        "title": "Piperacillin-Tazobactam: Renal Dose Adjustments",
        "category": "Renal Dosing",
        "source": "FDA Package Insert (Zosyn) & Renal Pharmacotherapy Protocols",
        "evidence_grade": "Mandatory Renal Protocol",
        "clinical_triggers": ["DRUG_PIPERACILLIN_TAZOBACTAM", "CREATININE_GE_1_5", "AKI_STAGE_1", "AKI_STAGE_2"],
        "escalation_level": "CAUTION",
        "text": "Piperacillin-Tazobactam maintenance dosing in renal impairment: (1) CrCl 40-50 mL/min: 3.375 g IV q6h (or 4.5 g q8h). (2) CrCl 20-39 mL/min: 3.375 g IV q6h. (3) CrCl < 20 mL/min: 2.25 g IV q6h. (4) Intermittent Hemodialysis: 2.25 g IV q8h with a supplemental dose of 0.75 g post-dialysis on dialysis days. (5) Continuous Renal Replacement Therapy (CRRT): 3.375 g IV q6h or 4.5 g IV q8h."
    },
    {
        "id": "DOSE-PIPTAZO-HEPATIC",
        "title": "Piperacillin-Tazobactam: Hepatic Impairment Considerations",
        "category": "Hepatic Dosing",
        "source": "FDA Package Insert (Zosyn)",
        "evidence_grade": "Clinical Pharmacology",
        "clinical_triggers": ["DRUG_PIPERACILLIN_TAZOBACTAM", "BILIRUBIN_GE_2", "HEPATIC_DYSFUNCTION"],
        "escalation_level": "STANDARD",
        "text": "In patients with isolated hepatic impairment (elevated bilirubin or AST/ALT) with preserved renal function, no dosage adjustment of piperacillin-tazobactam is required. However, if hepatic cirrhosis is accompanied by hepatorenal syndrome or renal impairment, renal dose adjustments must be strictly applied."
    },

    # =========================================================================
    # 5. ANTIMICROBIAL DOSING PROTOCOLS: CEFEPIME (MAXIPIME)
    # =========================================================================
    {
        "id": "DOSE-CEFEPIME-01",
        "title": "Cefepime: Severe Sepsis Empiric Dosing Protocol",
        "category": "Antimicrobial Dosing",
        "source": "FDA Package Insert (Maxipime) & Sanford Guide 2024",
        "evidence_grade": "Standard Dosing Protocol",
        "clinical_triggers": ["DRUG_CEFEPIME", "SEPSIS3_CONFIRMED", "PSEUDOMONAS_RISK"],
        "escalation_level": "STANDARD",
        "text": "For severe sepsis or febrile neutropenia, the standard adult regimen is 2 g IV every 8 hours (extended infusion over 3-4 hours preferred for Pseudomonas aeruginosa coverage). In acute presentation, administer a full 2 g IV loading dose before applying maintenance renal reductions."
    },
    {
        "id": "DOSE-CEFEPIME-02",
        "title": "Cefepime: Mandatory Renal Dose Adjustments",
        "category": "Renal Dosing",
        "source": "FDA Package Insert (Maxipime) & Clinical Pharmacology Guidelines",
        "evidence_grade": "Mandatory Renal Protocol",
        "clinical_triggers": ["DRUG_CEFEPIME", "CREATININE_GE_1_5", "AKI_STAGE_1", "AKI_STAGE_2", "AKI_STAGE_3"],
        "escalation_level": "CAUTION",
        "text": "Cefepime maintenance dosing stratified by CrCl: (1) CrCl > 60 mL/min: 2 g IV q8h. (2) CrCl 30-60 mL/min: 2 g IV q12h. (3) CrCl 11-29 mL/min: 2 g IV q24h. (4) CrCl <= 10 mL/min: 1 g IV q24h. (5) Hemodialysis: 1 g IV every 24 hours, administered after completion of hemodialysis on dialysis days. (6) CRRT: 2 g IV q12h."
    },
    {
        "id": "DOSE-CEFEPIME-CONTRA-01",
        "title": "Cefepime Neurotoxicity Black-Box Warning in Renal Failure",
        "category": "Drug Safety Alerts",
        "source": "FDA Drug Safety Communication & Critical Care Medicine Reviews",
        "evidence_grade": "Critical Safety Alert",
        "clinical_triggers": ["DRUG_CEFEPIME", "CREATININE_GE_1_5", "CREATININE_GE_2", "AKI_PRESENT"],
        "escalation_level": "ESCALATE_CRITICAL",
        "contraindication_warning": "High risk of cefepime-induced encephalopathy and neurotoxicity",
        "text": "BLACK-BOX NEUROTOXICITY ALERT: Severe life-threatening neurotoxicity (encephalopathy, myoclonus, confusion, aphasia, non-convulsive status epilepticus) occurs when cefepime dosage is not adjusted for renal impairment. If Creatinine >= 1.5 mg/dL or CrCl < 60 mL/min, dosage MUST be reduced to 2 g q12h or 2 g q24h. Neurotoxicity typically reverses upon dose reduction or hemodialysis."
    },

    # =========================================================================
    # 6. ANTIMICROBIAL DOSING PROTOCOLS: MEROPENEM (MERREM)
    # =========================================================================
    {
        "id": "DOSE-MEROPENEM-01",
        "title": "Meropenem: Severe Sepsis Empiric Dosing Protocol",
        "category": "Antimicrobial Dosing",
        "source": "FDA Package Insert (Merrem) & Sanford Guide 2024",
        "evidence_grade": "Standard Dosing Protocol",
        "clinical_triggers": ["DRUG_MEROPENEM", "SEPSIS3_CONFIRMED", "ESBL_SUSPECTED"],
        "escalation_level": "STANDARD",
        "text": "For severe sepsis, septic shock, or suspected extended-spectrum beta-lactamase (ESBL) producing pathogens, the standard dose is 1 g to 2 g IV every 8 hours. Administering meropenem as an extended infusion over 3 hours significantly enhances bactericidal activity and pharmacodynamic target attainment in critical illness."
    },
    {
        "id": "DOSE-MEROPENEM-02",
        "title": "Meropenem: Renal Dose Adjustments",
        "category": "Renal Dosing",
        "source": "FDA Package Insert (Merrem) & Renal Dosing Manuals",
        "evidence_grade": "Mandatory Renal Protocol",
        "clinical_triggers": ["DRUG_MEROPENEM", "CREATININE_GE_1_5", "AKI_STAGE_1", "AKI_STAGE_2"],
        "escalation_level": "CAUTION",
        "text": "Meropenem maintenance dosing based on CrCl: (1) CrCl > 50 mL/min: 1 g IV q8h. (2) CrCl 26-50 mL/min: 1 g IV q12h. (3) CrCl 10-25 mL/min: 500 mg IV q12h. (4) CrCl < 10 mL/min: 500 mg IV q24h. (5) Intermittent Hemodialysis: 500 mg IV q24h (administer dose after hemodialysis). (6) CRRT: 1 g IV q8-12h."
    },
    {
        "id": "DOSE-MEROPENEM-CNS",
        "title": "Meropenem: Seizure Risk & Valproic Acid Interaction",
        "category": "Drug Safety Alerts",
        "source": "FDA Package Insert (Merrem)",
        "evidence_grade": "Critical Safety Alert",
        "clinical_triggers": ["DRUG_MEROPENEM", "SEIZURE_HISTORY", "CNS_INFECTION"],
        "escalation_level": "CAUTION",
        "contraindication_warning": "Seizure risk with unadjusted renal dosing; marked reduction in valproate levels",
        "text": "SAFETY WARNING: Carbapenems including meropenem lower serum valproic acid concentrations to subtherapeutic levels within 24 hours, precipitating breakthrough seizures. Meropenem also carries intrinsic neurotoxicity risk if doses are not reduced in renal failure. Monitor renal clearance closely."
    },

    # =========================================================================
    # 7. ANTIMICROBIAL DOSING PROTOCOLS: GENTAMICIN (AMINOGLYCOSIDE)
    # =========================================================================
    {
        "id": "DOSE-GENT-01",
        "title": "Gentamicin: Sepsis Extended-Interval (Once-Daily) Dosing",
        "category": "Antimicrobial Dosing",
        "source": "FDA Package Insert & IDSA Severe Sepsis Synergy Guidelines",
        "evidence_grade": "Standard Dosing Protocol",
        "clinical_triggers": ["DRUG_GENTAMICIN", "GRAM_NEGATIVE_SYNERGY"],
        "escalation_level": "STANDARD",
        "text": "For empiric broad-spectrum synergy in severe sepsis, gentamicin is administered as a single high dose of 5 to 7 mg/kg IV once daily (calculated using Ideal Body Weight, or Adjusted Body Weight in obesity: IBW + 0.4 * [Actual - IBW]). High once-daily dosing achieves peak bactericidal Cmax/MIC ratios > 10."
    },
    {
        "id": "DOSE-GENT-CONTRA-01",
        "title": "Gentamicin: High-Risk Contraindication in Acute Kidney Injury",
        "category": "Drug Safety Alerts",
        "source": "FDA Black-Box Warning & Kidney Disease Improving Global Outcomes (KDIGO)",
        "evidence_grade": "Critical Safety Alert",
        "clinical_triggers": ["DRUG_GENTAMICIN", "CREATININE_GE_1_5", "AKI_PRESENT", "AKI_STAGE_1", "AKI_STAGE_2"],
        "escalation_level": "ESCALATE_CRITICAL",
        "contraindication_warning": "Nephrotoxic acute tubular necrosis & irreversible ototoxicity",
        "text": "BLACK-BOX CONTRAINDICATION ALERT: Gentamicin accumulates in renal proximal tubular cells and inner ear perilymph. In patients with preexisting acute kidney injury (Creatinine >= 1.5 mg/dL, CrCl < 30 mL/min, or oliguria), aminoglycosides carry severe risks of accelerating acute tubular necrosis and causing irreversible bilateral ototoxicity/vestibular damage. AVOID Gentamicin in AKI; select non-nephrotoxic alternatives (such as Meropenem or Cefepime)."
    },
    {
        "id": "DOSE-GENT-02",
        "title": "Gentamicin: Therapeutic Trough & Peak Target Monitoring",
        "category": "Antimicrobial Stewardship",
        "source": "Sanford Guide 2024 & FDA Prescribing Information",
        "evidence_grade": "Mandatory Therapeutic Monitoring",
        "clinical_triggers": ["DRUG_GENTAMICIN", "THERAPEUTIC_DRUG_MONITORING"],
        "escalation_level": "CAUTION",
        "text": "In patients receiving gentamicin: (1) Trough levels must be measured immediately prior to the next scheduled dose and must be < 1.0 mcg/mL to avoid renal accumulation. (2) If trough >= 1.0 mcg/mL, extend the dosing interval to q36h or q48h. (3) Limit therapy duration to a maximum of 3 to 5 days, discontinuing as soon as culture susceptibilities permit."
    },

    # =========================================================================
    # 8. CLINICAL ESCALATION & REFRACTORY SHOCK PROTOCOLS
    # =========================================================================
    {
        "id": "ESCALATE-REFRACTORY-01",
        "title": "Refractory Septic Shock Escalation Pathway",
        "category": "Clinical Escalation",
        "source": "Surviving Sepsis Campaign 2021 & SCCM Guidelines",
        "evidence_grade": "Critical Care Escalation Algorithm",
        "clinical_triggers": ["REFRACTORY_SHOCK", "NOREPINEPHRINE_HIGH", "VASOPRESSIN_ACTIVE", "MAP_LT_65"],
        "escalation_level": "ESCALATE_CRITICAL",
        "text": "REFRACTORY SHOCK PATHWAY: If MAP remains < 65 mmHg despite 30 mL/kg crystalloid resuscitation, norepinephrine > 0.25 mcg/kg/min, and vasopressin 0.03 units/min: (1) Request immediate bedside Critical Care Attending evaluation. (2) Initiate IV Hydrocortisone 200 mg/day. (3) Add Epinephrine (0.01-0.5 mcg/kg/min) or Dobutamine if myocardial dysfunction is suspected. (4) Place invasive arterial line. (5) Screen for occult compartment syndrome, pneumothorax, or catastrophic source control failure."
    },
    {
        "id": "ESCALATE-CULTURE-NEG-01",
        "title": "Culture-Negative Sepsis & Non-Infectious Shock Differentials",
        "category": "Clinical Escalation",
        "source": "Surviving Sepsis Campaign 2021 Guidelines, Rec 33",
        "evidence_grade": "Diagnostic Escalation",
        "clinical_triggers": ["CULTURE_NEGATIVE", "PERSISTENT_SHOCK", "UNRESPONSIVE_SEPSIS"],
        "escalation_level": "CAUTION",
        "text": "In patients who fail to improve within 48 to 72 hours of empiric antimicrobials and fluid resuscitation: (1) Actively re-evaluate for non-infectious shock etiologies: acute pulmonary embolism (obtain CTPA/echocardiogram), acute myocardial infarction (Troponin, ECG), acute pancreatitis, adrenal insufficiency, or drug-induced anaphylaxis. (2) Obtain urgent Infectious Disease consultation for atypical, viral, or fungal pathogens."
    }
]

def save_curated_knowledge():
    output_path = os.path.join(CURATED_DIR, "knowledge_chunks_raw.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump({
            "version": "1.0.0",
            "curated_at": "2026-11-09",
            "total_chunks": len(CHUNKS),
            "sources": [
                "Surviving Sepsis Campaign: International Guidelines for Management of Sepsis and Septic Shock 2021 (Crit Care Med / Intensive Care Med)",
                "The Third International Consensus Definitions for Sepsis and Septic Shock (Sepsis-3) (JAMA 2016)",
                "FDA Prescribing Information & ASHP/IDSA Guidelines for Vancomycin, Piperacillin-Tazobactam, Cefepime, Meropenem, Gentamicin"
            ],
            "chunks": CHUNKS
        }, f, indent=2)
    print(f"Saved {len(CHUNKS)} high-yield clinical guideline chunks to {output_path} ({os.path.getsize(output_path):,} bytes)!")

if __name__ == "__main__":
    save_curated_knowledge()
