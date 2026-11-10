/**
 * Interactive "What-If" Resuscitation & Hemodynamic Simulator
 * Models physiological response to fluid boluses, vasopressor titration, and antimicrobial selection.
 */

export function simulateHemodynamics(baselineVitals, baselineLabs, interventions = {}) {
  const baseMap = baselineVitals.map || 70;
  const baseLactate = baselineLabs.lactate_mmol_l || 1.5;
  const fluidBolus = interventions.fluidBolusMlKg || 0; // 0 to 40 mL/kg
  const norepi = interventions.norepinephrine || 0; // 0.0 to 0.5 ug/kg/min
  const vasopressinActive = interventions.vasopressin || false;

  // 1. Fluid Response Modeling:
  // Initial 30 mL/kg bolus provides an expected +5 to +12 mmHg MAP rise if fluid-responsive (MAP < 65)
  // Higher boluses have diminishing returns and increase pulmonary edema risk
  let fluidMapGain = 0;
  if (fluidBolus > 0) {
    if (baseMap < 65) {
      // Hypoperfused: steeper initial slope
      fluidMapGain = Math.min(14, (fluidBolus / 30) * 10);
    } else {
      fluidMapGain = Math.min(6, (fluidBolus / 30) * 4);
    }
  }

  // 2. Norepinephrine Response Modeling:
  // Norepinephrine has strong alpha-1 vasoconstriction, increasing MAP by ~15-35 mmHg depending on dose
  let vasoMapGain = 0;
  if (norepi > 0) {
    // Logarithmic dose-response curve
    vasoMapGain = Math.min(35, (norepi / 0.1) * 8);
  }

  // 3. Vasopressin Synergy Modeling:
  // Fixed 0.03 units/min vasopressin restores vascular responsiveness, adding +4 to +8 mmHg
  let vasoAddonGain = 0;
  if (vasopressinActive) {
    vasoAddonGain = 6.0;
  }

  // Combined Simulated MAP
  const simulatedMap = Math.round(Math.min(110, baseMap + fluidMapGain + vasoMapGain + vasoAddonGain));

  // 4. Simulated Lactate Clearance:
  // Restoring MAP >= 65 and restoring microvascular perfusion triggers lactate clearance (~10-20% drop)
  let simulatedLactate = baseLactate;
  if (simulatedMap >= 65 && (fluidBolus >= 20 || norepi > 0)) {
    const clearanceFactor = 0.85; // 15% estimated clearance
    simulatedLactate = Math.round((baseLactate * clearanceFactor) * 10) / 10;
  }

  // 5. Volume Overload Warning Score (0 to 100)
  const respRatio = (baselineVitals.o2sat || 98) / (baselineLabs.fio2 || 0.21);
  let overloadRisk = 0;
  if (fluidBolus >= 30) overloadRisk += 40;
  if (fluidBolus >= 40) overloadRisk += 30;
  if (respRatio < 300) overloadRisk += 25;
  if (respRatio < 200) overloadRisk += 30;
  overloadRisk = Math.min(100, overloadRisk);

  return {
    baselineMap: baseMap,
    simulatedMap,
    deltaMap: simulatedMap - baseMap,
    baselineLactate: baseLactate,
    simulatedLactate,
    overloadRiskPercentage: overloadRisk,
    isMapTargetAchieved: simulatedMap >= 65,
    isRefractory: norepi >= 0.25 && simulatedMap < 65
  };
}
