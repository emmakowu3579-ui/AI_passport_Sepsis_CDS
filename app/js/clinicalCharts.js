/**
 * Interactive Clinical Trajectory & Hemodynamic Charting Engine
 * Pure client-side SVG charting engine. Zero external dependencies.
 * Implements ICU hemodynamic trends, target threshold bands, and Sepsis-3 onset milestones.
 */

export class ClinicalChartEngine {
  constructor() {
    this.hoverTooltip = null;
    this.createTooltipElement();
  }

  createTooltipElement() {
    if (typeof document === "undefined") return;
    let tip = document.getElementById("chartHoverTooltip");
    if (!tip) {
      tip = document.createElement("div");
      tip.id = "chartHoverTooltip";
      tip.style.position = "fixed";
      tip.style.display = "none";
      tip.style.pointerEvents = "none";
      tip.style.zIndex = "1000";
      tip.style.backgroundColor = "var(--bg-card, #ffffff)";
      tip.style.color = "var(--text-primary, #0f172a)";
      tip.style.border = "1px solid var(--border-strong, #cbd5e1)";
      tip.style.borderRadius = "8px";
      tip.style.padding = "8px 12px";
      tip.style.fontSize = "13px";
      tip.style.fontWeight = "600";
      tip.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
      document.body.appendChild(tip);
    }
    this.hoverTooltip = tip;
  }

  /**
   * Renders the Longitudinal Hemodynamic & Lactate Trajectory Plot
   */
  renderHemodynamicTrajectory(svgElementId, timeline, currentHourIndex, sepsisOnsetHour, onHourClick) {
    const svg = document.getElementById(svgElementId);
    if (!svg || !timeline || timeline.length === 0) return;

    const width = 850;
    const height = 260;
    const padLeft = 60;
    const padRight = 60;
    const padTop = 35;
    const padBottom = 45;

    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    // MAP Range: 40 to 120 mmHg
    const minMap = 40;
    const maxMap = 120;
    const mapY = (val) => padTop + plotH - ((val - minMap) / (maxMap - minMap)) * plotH;

    // Lactate Range: 0 to 8 mmol/L
    const minLact = 0;
    const maxLact = 8;
    const lactY = (val) => padTop + plotH - ((val - minLact) / (maxLact - minLact)) * plotH;

    const totalHours = timeline.length;
    const hourX = (idx) => padLeft + (idx / Math.max(1, totalHours - 1)) * plotW;

    let elements = [];

    // 1. Hypoperfusion Danger Zone Background Shading (MAP < 65)
    const y65 = mapY(65);
    const yBottom = padTop + plotH;
    elements.push(`
      <rect x="${padLeft}" y="${y65}" width="${plotW}" height="${yBottom - y65}" fill="rgba(239, 68, 68, 0.08)" rx="0" />
      <text x="${padLeft + 8}" y="${yBottom - 10}" fill="#ef4444" font-size="11" font-weight="700">Hypoperfusion Danger Zone (MAP &lt; 65 mmHg)</text>
    `);

    // 2. Normal Perfusion Target Zone (MAP >= 65)
    elements.push(`
      <line x1="${padLeft}" y1="${y65}" x2="${padLeft + plotW}" y2="${y65}" stroke="#10b981" stroke-width="2" stroke-dasharray="6,4" />
      <text x="${padLeft + plotW - 6}" y="${y65 - 6}" fill="#10b981" font-size="12" font-weight="800" text-anchor="end">Target MAP &ge; 65 mmHg Goal</text>
    `);

    // 3. Lactate Threshold Line (2.0 mmol/L)
    const yLact2 = lactY(2.0);
    elements.push(`
      <line x1="${padLeft}" y1="${yLact2}" x2="${padLeft + plotW}" y2="${yLact2}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4,4" opacity="0.8" />
      <text x="${padLeft + 8}" y="${yLact2 - 6}" fill="#f59e0b" font-size="11" font-weight="700">Lactate Normal Ref &lt; 2.0 mmol/L</text>
    `);

    // 4. Horizontal Grid Lines & Y-Axis Labels
    const mapTicks = [40, 60, 80, 100, 120];
    for (const t of mapTicks) {
      const y = mapY(t);
      elements.push(`
        <line x1="${padLeft}" y1="${y}" x2="${padLeft + plotW}" y2="${y}" stroke="var(--border-subtle, #e2e8f0)" stroke-width="1" stroke-dasharray="3,3" opacity="0.6" />
        <text x="${padLeft - 8}" y="${y + 4}" fill="var(--text-muted, #64748b)" font-size="11" font-weight="700" text-anchor="end">${t}</text>
      `);
    }

    // Right Y-Axis (Lactate mmol/L)
    const lactTicks = [0, 2, 4, 6, 8];
    for (const lt of lactTicks) {
      const y = lactY(lt);
      elements.push(`
        <text x="${padLeft + plotW + 10}" y="${y + 4}" fill="#f59e0b" font-size="11" font-weight="700" text-anchor="start">${lt} mM</text>
      `);
    }

    // Axis Labels
    elements.push(`
      <text x="${padLeft - 38}" y="${padTop - 12}" fill="#0284c7" font-size="12" font-weight="800">MAP (mmHg)</text>
      <text x="${padLeft + plotW + 10}" y="${padTop - 12}" fill="#f59e0b" font-size="12" font-weight="800">Lactate</text>
    `);

    // 5. X-Axis Ticks & Labels
    const step = totalHours > 50 ? 12 : (totalHours > 20 ? 6 : 2);
    for (let i = 0; i < totalHours; i += step) {
      const x = hourX(i);
      elements.push(`
        <line x1="${x}" y1="${padTop + plotH}" x2="${x}" y2="${padTop + plotH + 5}" stroke="var(--border-strong, #94a3b8)" stroke-width="1" />
        <text x="${x}" y="${padTop + plotH + 18}" fill="var(--text-muted, #64748b)" font-size="11" font-weight="600" text-anchor="middle">Hr ${i + 1}</text>
      `);
    }

    // 6. Sepsis Onset Indicator Marker (if present)
    if (sepsisOnsetHour && sepsisOnsetHour <= totalHours) {
      const onsetIdx = sepsisOnsetHour - 1;
      const onsetX = hourX(onsetIdx);
      elements.push(`
        <line x1="${onsetX}" y1="${padTop}" x2="${onsetX}" y2="${padTop + plotH}" stroke="#ef4444" stroke-width="2.5" stroke-dasharray="5,3" />
        <rect x="${onsetX - 45}" y="${padTop - 28}" width="90" height="22" rx="4" fill="#fee2e2" stroke="#dc2626" stroke-width="1.5" />
        <text x="${onsetX}" y="${padTop - 13}" fill="#991b1b" font-size="11" font-weight="800" text-anchor="middle">🚨 Sepsis Onset</text>
      `);
    }

    // 7. Lactate Trajectory Path
    const lactPoints = [];
    for (let i = 0; i < totalHours; i++) {
      const val = timeline[i].labs.lactate_mmol_l;
      if (val !== null && val !== undefined) {
        lactPoints.push(`${hourX(i).toFixed(1)},${Math.min(padTop + plotH, Math.max(padTop, lactY(val))).toFixed(1)}`);
      }
    }
    if (lactPoints.length > 1) {
      elements.push(`
        <polyline points="${lactPoints.join(' ')}" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      `);
    }

    // 8. MAP Trajectory Path
    const mapPoints = [];
    for (let i = 0; i < totalHours; i++) {
      const val = timeline[i].vitals.map;
      if (val !== null && val !== undefined) {
        mapPoints.push(`${hourX(i).toFixed(1)},${Math.min(padTop + plotH, Math.max(padTop, mapY(val))).toFixed(1)}`);
      }
    }
    if (mapPoints.length > 1) {
      elements.push(`
        <polyline points="${mapPoints.join(' ')}" fill="none" stroke="#0284c7" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
      `);
    }

    // 9. Current ICU Hour Scrubber Cursor Line
    if (currentHourIndex >= 0 && currentHourIndex < totalHours) {
      const curX = hourX(currentHourIndex);
      const curRecord = timeline[currentHourIndex];
      const curMap = curRecord.vitals.map !== null ? curRecord.vitals.map : 65;
      const curMapY = mapY(curMap);

      elements.push(`
        <line x1="${curX}" y1="${padTop}" x2="${curX}" y2="${padTop + plotH}" stroke="var(--text-primary, #0f172a)" stroke-width="2" />
        <circle cx="${curX}" cy="${curMapY}" r="7" fill="#0284c7" stroke="#ffffff" stroke-width="2.5" />
        <rect x="${curX - 42}" y="${padTop + plotH + 24}" width="84" height="20" rx="4" fill="#0284c7" />
        <text x="${curX}" y="${padTop + plotH + 38}" fill="#ffffff" font-size="11" font-weight="800" text-anchor="middle">Hr ${currentHourIndex + 1} (Active)</text>
      `);
    }

    // 10. Invisible Click Targets for Scrubbing
    for (let i = 0; i < totalHours; i++) {
      const x = hourX(i);
      const stepW = plotW / totalHours;
      const rec = timeline[i];
      const recMap = rec.vitals.map !== null ? rec.vitals.map : "--";
      const recLact = rec.labs.lactate_mmol_l !== null ? rec.labs.lactate_mmol_l : "--";
      const recHr = rec.vitals.hr !== null ? rec.vitals.hr : "--";
      const recSofa = rec.sofa_scores ? rec.sofa_scores.total : "--";

      elements.push(`
        <rect class="chart-scrub-trigger" x="${x - stepW / 2}" y="${padTop}" width="${stepW}" height="${plotH}" fill="transparent" style="cursor:pointer;"
          data-hour-index="${i}"
          data-hour="${rec.hour}"
          data-map="${recMap}"
          data-lact="${recLact}"
          data-hr="${recHr}"
          data-sofa="${recSofa}"
        />
      `);
    }

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.innerHTML = elements.join("\n");

    // Bind interaction events (click to scrub, hover for tooltip)
    const triggers = svg.querySelectorAll(".chart-scrub-trigger");
    triggers.forEach(tr => {
      tr.addEventListener("click", () => {
        const idx = parseInt(tr.getAttribute("data-hour-index"), 10);
        if (onHourClick) onHourClick(idx);
      });

      tr.addEventListener("mousemove", (e) => {
        if (!this.hoverTooltip) return;
        const h = tr.getAttribute("data-hour");
        const map = tr.getAttribute("data-map");
        const lact = tr.getAttribute("data-lact");
        const hr = tr.getAttribute("data-hr");
        const sofa = tr.getAttribute("data-sofa");

        this.hoverTooltip.innerHTML = `
          <div style="font-size:12px; font-weight:800; color:var(--accent-primary, #0284c7); margin-bottom:2px;">ICU Hour ${h}</div>
          <div>MAP: <strong style="color:${map < 65 ? '#ef4444' : '#10b981'};">${map} mmHg</strong></div>
          <div>Serum Lactate: <strong style="color:#f59e0b;">${lact} mmol/L</strong></div>
          <div>Heart Rate: <strong>${hr} bpm</strong></div>
          <div>Total SOFA: <strong style="color:var(--text-primary);">${sofa} pts</strong></div>
          <div style="font-size:10px; color:var(--text-muted); margin-top:3px;">👉 Click point to scrub timeline</div>
        `;
        this.hoverTooltip.style.display = "block";
        this.hoverTooltip.style.left = `${e.clientX + 14}px`;
        this.hoverTooltip.style.top = `${e.clientY - 20}px`;
      });

      tr.addEventListener("mouseleave", () => {
        if (this.hoverTooltip) this.hoverTooltip.style.display = "none";
      });
    });
  }

  /**
   * Renders the Longitudinal SOFA Organ Failure Progression Chart
   */
  renderSofaProgression(svgElementId, timeline, currentHourIndex, sepsisOnsetHour) {
    const svg = document.getElementById(svgElementId);
    if (!svg || !timeline || timeline.length === 0) return;

    const width = 850;
    const height = 180;
    const padLeft = 60;
    const padRight = 30;
    const padTop = 30;
    const padBottom = 35;

    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const maxSofa = 14;
    const sofaY = (score) => padTop + plotH - (Math.min(maxSofa, score) / maxSofa) * plotH;
    const totalHours = timeline.length;
    const hourX = (idx) => padLeft + (idx / Math.max(1, totalHours - 1)) * plotW;

    let elements = [];

    // Acute Sepsis Threshold Line (SOFA >= 2)
    const y2 = sofaY(2);
    elements.push(`
      <rect x="${padLeft}" y="${sofaY(maxSofa)}" width="${plotW}" height="${y2 - sofaY(maxSofa)}" fill="rgba(245, 158, 11, 0.06)" />
      <line x1="${padLeft}" y1="${y2}" x2="${padLeft + plotW}" y2="${y2}" stroke="#f59e0b" stroke-width="1.8" stroke-dasharray="5,4" />
      <text x="${padLeft + plotW - 6}" y="${y2 - 6}" fill="#b45309" font-size="11" font-weight="800" text-anchor="end">Sepsis-3 Organ Failure Threshold (&ge; 2 Points)</text>
    `);

    // Y-Axis Ticks
    for (let s = 0; s <= maxSofa; s += 3) {
      const y = sofaY(s);
      elements.push(`
        <line x1="${padLeft}" y1="${y}" x2="${padLeft + plotW}" y2="${y}" stroke="var(--border-subtle, #e2e8f0)" stroke-width="1" opacity="0.5" />
        <text x="${padLeft - 8}" y="${y + 4}" fill="var(--text-muted, #64748b)" font-size="11" font-weight="700" text-anchor="end">${s}</text>
      `);
    }

    elements.push(`
      <text x="${padLeft - 40}" y="${padTop - 10}" fill="var(--text-primary, #0f172a)" font-size="12" font-weight="800">SOFA Score</text>
    `);

    // SOFA Polyline Area & Curve
    const sofaPoints = [];
    for (let i = 0; i < totalHours; i++) {
      const score = timeline[i].sofa_scores ? timeline[i].sofa_scores.total : 0;
      sofaPoints.push(`${hourX(i).toFixed(1)},${sofaY(score).toFixed(1)}`);
    }

    if (sofaPoints.length > 1) {
      elements.push(`
        <polyline points="${sofaPoints.join(' ')}" fill="none" stroke="#7c3aed" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      `);
    }

    // Active Hour Indicator
    if (currentHourIndex >= 0 && currentHourIndex < totalHours) {
      const curX = hourX(currentHourIndex);
      const curScore = timeline[currentHourIndex].sofa_scores ? timeline[currentHourIndex].sofa_scores.total : 0;
      elements.push(`
        <line x1="${curX}" y1="${padTop}" x2="${curX}" y2="${padTop + plotH}" stroke="var(--text-primary)" stroke-width="1.8" stroke-dasharray="3,3" />
        <circle cx="${curX}" cy="${sofaY(curScore)}" r="6" fill="#7c3aed" stroke="#ffffff" stroke-width="2" />
      `);
    }

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.innerHTML = elements.join("\n");
  }

  /**
   * Renders the "What-If" Resuscitation Perfusion Comparison Gauge
   */
  renderSimulationComparison(svgElementId, baselineMap, simulatedMap, isAchieved, overloadRisk) {
    const svg = document.getElementById(svgElementId);
    if (!svg) return;

    const width = 450;
    const height = 160;
    const minMap = 40;
    const maxMap = 110;

    const barX = (val) => 40 + ((Math.min(maxMap, Math.max(minMap, val)) - minMap) / (maxMap - minMap)) * 360;

    const baseW = Math.max(10, barX(baselineMap) - 40);
    const simW = Math.max(10, barX(simulatedMap) - 40);
    const targetX = barX(65);

    const elements = `
      <!-- Background Bar Track -->
      <rect x="40" y="30" width="360" height="24" rx="6" fill="var(--bg-inset, #f1f5f9)" stroke="var(--border-subtle, #e2e8f0)" />
      <text x="40" y="22" fill="var(--text-muted, #64748b)" font-size="11" font-weight="700">Baseline MAP: ${baselineMap} mmHg</text>
      <rect x="40" y="30" width="${baseW}" height="24" rx="6" fill="${baselineMap < 65 ? '#ef4444' : '#10b981'}" />

      <!-- Simulated Post-Resuscitation Bar -->
      <text x="40" y="82" fill="var(--text-muted, #64748b)" font-size="11" font-weight="700">Simulated Post-Resuscitation MAP: ${simulatedMap} mmHg</text>
      <rect x="40" y="90" width="360" height="24" rx="6" fill="var(--bg-inset, #f1f5f9)" stroke="var(--border-subtle, #e2e8f0)" />
      <rect x="40" y="90" width="${simW}" height="24" rx="6" fill="${isAchieved ? '#10b981' : '#ef4444'}" />

      <!-- Target 65 Goal Line -->
      <line x1="${targetX}" y1="18" x2="${targetX}" y2="124" stroke="#0284c7" stroke-width="2.5" stroke-dasharray="4,3" />
      <text x="${targetX}" y="142" fill="#0284c7" font-size="11" font-weight="800" text-anchor="middle">Goal: 65 mmHg</text>

      <!-- Tick Labels -->
      <text x="40" y="142" fill="var(--text-muted)" font-size="10" font-weight="600">40</text>
      <text x="400" y="142" fill="var(--text-muted)" font-size="10" font-weight="600" text-anchor="end">110 mmHg</text>
    `;

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.innerHTML = elements;
  }
}
