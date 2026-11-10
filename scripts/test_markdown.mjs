import { ClinicalSynthesizer } from "../app/js/llmSynthesis.js";
import { renderClinicalMarkdown, renderAntimicrobialTable } from "../app/js/markdownRenderer.js";

const synth = new ClinicalSynthesizer(null);
const mockPt = { demographics: { age: 65, gender: "Male" } };
const mockVitals = { map: 62, hr: 110, resp: 24, temp_c: 38.5 };
const mockLabs = { lactate_mmol_l: 3.5, lactate_mg_dl: 31.5, creatinine_mg_dl: 2.1 };
const mockSofa = { total: 8, resp: 2, coag: 1, liver: 1, cv: 2, renal: 2 };
const mockStatus = { status: "Sepsis-3 Confirmed" };
const mockAlerts = [{ id: "ALERT-VANC-AKI", drug: "Vancomycin", badge: "Nephrotoxic Synergy", message: "Nephrotoxic synergy with Pip-Tazo", recommendation: "Daily Cr monitoring", citation: "DOSE-VANC-CONTRA-01" }];
const mockSim = { baselineMap: 62, simulatedMap: 72, isMapTargetAchieved: true, isRefractory: false, overloadRiskPercentage: 15 };

const note = synth.synthesizeExtractiveNote(mockPt, 10, mockVitals, mockLabs, mockSofa, mockStatus, mockAlerts, [], mockSim);
console.log("Synthesized sections count:", note.sections.length);
let totalAsterisks = 0;
for (const s of note.sections) {
  const html = renderClinicalMarkdown(s.body);
  const remainingAsterisks = (html.match(/\*/g) || []).length;
  totalAsterisks += remainingAsterisks;
  console.log(`Section: "${s.heading}" -> Remaining asterisks: ${remainingAsterisks}`);
  if (remainingAsterisks > 0) {
    console.log("Unparsed snippet:\n", html);
  }
}
console.log("TOTAL REMAINING ASTERISKS ACROSS NOTE:", totalAsterisks);
