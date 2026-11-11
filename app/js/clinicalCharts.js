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
   * Safely extracts total SOFA score across varied patient record schema conventions
   */
  getRecordSofa(rec) {
    if (!rec) return 0;
    if (rec.sofa && typeof rec.sofa.sofa_total === "number") return rec.sofa.sofa_total;
    if (rec.sofa_scores && typeof rec.sofa_scores.total === "number") return rec.sofa_scores.total;
    if (typeof rec.sofa === "number") return rec.sofa;
    return 0;
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
      <text x="${padLeft - 38}" y="${padTop - 12}" fill="var(--clinical-blue, #008775)" font-size="12" font-weight="800">MAP (mmHg)</text>
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
        <rect x="${onsetX - 50}" y="${padTop - 28}" width="100" height="22" rx="4" fill="#fee2e2" stroke="#dc2626" stroke-width="1.5" />
        <text x="${onsetX}" y="${padTop - 13}" fill="#991b1b" font-size="11" font-weight="800" text-anchor="middle">SEPSIS-3 ONSET</text>
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
        <polyline points="${mapPoints.join(' ')}" fill="none" stroke="var(--clinical-blue, #008775)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
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
        <circle cx="${curX}" cy="${curMapY}" r="7" fill="var(--clinical-blue, #008775)" stroke="#ffffff" stroke-width="2.5" />
        <rect x="${curX - 42}" y="${padTop + plotH + 24}" width="84" height="20" rx="4" fill="var(--clinical-blue, #008775)" />
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
      const sVal = this.getRecordSofa(rec);
      const recSofa = sVal !== null && sVal !== undefined ? sVal : "--";

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
          <div style="font-size:12px; font-weight:800; color:var(--clinical-blue, #008775); margin-bottom:2px;">ICU Hour ${h}</div>
          <div>MAP: <strong style="color:${map < 65 ? '#ef4444' : '#10b981'};">${map} mmHg</strong></div>
          <div>Serum Lactate: <strong style="color:#f59e0b;">${lact} mmol/L</strong></div>
          <div>Heart Rate: <strong>${hr} bpm</strong></div>
          <div>Total SOFA: <strong style="color:var(--text-primary);">${sofa} pts</strong></div>
          <div style="font-size:10px; color:var(--text-muted); margin-top:3px;"><i class="bi bi-cursor-fill" style="margin-right:3px;"></i>Click point to scrub timeline</div>
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
  renderSofaProgression(svgElementId, timeline, currentHourIndex, sepsisOnsetHour, onHourClick, currentActiveSofa) {
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

    // Calculate dynamic max SOFA from trajectory or at least 12
    let highestSofa = 12;
    for (let i = 0; i < timeline.length; i++) {
      const s = this.getRecordSofa(timeline[i]);
      if (s > highestSofa) highestSofa = s;
    }
    if (typeof currentActiveSofa === "number" && currentActiveSofa > highestSofa) {
      highestSofa = currentActiveSofa;
    }
    const maxSofa = Math.min(24, Math.max(12, Math.ceil(highestSofa / 3) * 3));

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

    // X-Axis Ticks & Labels
    const step = totalHours > 50 ? 12 : (totalHours > 20 ? 6 : 2);
    for (let i = 0; i < totalHours; i += step) {
      const x = hourX(i);
      elements.push(`
        <line x1="${x}" y1="${padTop + plotH}" x2="${x}" y2="${padTop + plotH + 5}" stroke="var(--border-strong, #94a3b8)" stroke-width="1" />
        <text x="${x}" y="${padTop + plotH + 18}" fill="var(--text-muted, #64748b)" font-size="11" font-weight="600" text-anchor="middle">Hr ${i + 1}</text>
      `);
    }

    // Sepsis-3 Onset Marker (if present)
    if (sepsisOnsetHour && sepsisOnsetHour <= totalHours) {
      const onsetIdx = sepsisOnsetHour - 1;
      const onsetX = hourX(onsetIdx);
      elements.push(`
        <line x1="${onsetX}" y1="${padTop}" x2="${onsetX}" y2="${padTop + plotH}" stroke="#ef4444" stroke-width="2.5" stroke-dasharray="5,3" />
        <rect x="${onsetX - 50}" y="${padTop - 28}" width="100" height="22" rx="4" fill="#fee2e2" stroke="#dc2626" stroke-width="1.5" />
        <text x="${onsetX}" y="${padTop - 13}" fill="#991b1b" font-size="11" font-weight="800" text-anchor="middle">SEPSIS-3 ONSET</text>
      `);
    }

    // SOFA Polyline Area & Curve
    const sofaPoints = [];
    const areaPoints = [];
    areaPoints.push(`${hourX(0).toFixed(1)},${(padTop + plotH).toFixed(1)}`);

    for (let i = 0; i < totalHours; i++) {
      let score = this.getRecordSofa(timeline[i]);
      if (i === currentHourIndex && typeof currentActiveSofa === "number") {
        score = currentActiveSofa;
      }
      const pt = `${hourX(i).toFixed(1)},${sofaY(score).toFixed(1)}`;
      sofaPoints.push(pt);
      areaPoints.push(pt);
    }
    areaPoints.push(`${hourX(totalHours - 1).toFixed(1)},${(padTop + plotH).toFixed(1)}`);

    if (sofaPoints.length > 1) {
      elements.push(`
        <polygon points="${areaPoints.join(' ')}" fill="rgba(124, 58, 237, 0.12)" />
        <polyline points="${sofaPoints.join(' ')}" fill="none" stroke="#7c3aed" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      `);
    }

    // Active Hour Indicator
    if (currentHourIndex >= 0 && currentHourIndex < totalHours) {
      const curX = hourX(currentHourIndex);
      let curScore = this.getRecordSofa(timeline[currentHourIndex]);
      if (typeof currentActiveSofa === "number") {
        curScore = currentActiveSofa;
      }
      elements.push(`
        <line x1="${curX}" y1="${padTop}" x2="${curX}" y2="${padTop + plotH}" stroke="var(--text-primary)" stroke-width="1.8" stroke-dasharray="3,3" />
        <circle cx="${curX}" cy="${sofaY(curScore)}" r="6" fill="#7c3aed" stroke="#ffffff" stroke-width="2" />
      `);
    }

    // Invisible Click Targets for Scrubbing & Hover Tooltips
    for (let i = 0; i < totalHours; i++) {
      const x = hourX(i);
      const stepW = plotW / totalHours;
      const rec = timeline[i];
      let sVal = this.getRecordSofa(rec);
      if (i === currentHourIndex && typeof currentActiveSofa === "number") {
        sVal = currentActiveSofa;
      }
      const recMap = rec.vitals.map !== null ? rec.vitals.map : "--";
      const recLact = rec.labs.lactate_mmol_l !== null ? rec.labs.lactate_mmol_l : "--";
      const recHr = rec.vitals.hr !== null ? rec.vitals.hr : "--";

      elements.push(`
        <rect class="sofa-chart-scrub-trigger" x="${x - stepW / 2}" y="${padTop}" width="${stepW}" height="${plotH}" fill="transparent" style="cursor:pointer;"
          data-hour-index="${i}"
          data-hour="${rec.hour}"
          data-map="${recMap}"
          data-lact="${recLact}"
          data-hr="${recHr}"
          data-sofa="${sVal}"
        />
      `);
    }

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.innerHTML = elements.join("\n");

    // Bind interaction events (click to scrub, hover for tooltip)
    const triggers = svg.querySelectorAll(".sofa-chart-scrub-trigger");
    triggers.forEach(tr => {
      tr.addEventListener("click", () => {
        const idx = parseInt(tr.getAttribute("data-hour-index"), 10);
        if (typeof onHourClick === "function") {
          onHourClick(idx);
        }
      });

      tr.addEventListener("mouseenter", (e) => {
        if (!this.hoverTooltip) return;
        const h = tr.getAttribute("data-hour");
        const map = tr.getAttribute("data-map");
        const lact = tr.getAttribute("data-lact");
        const hr = tr.getAttribute("data-hr");
        const sofa = tr.getAttribute("data-sofa");

        this.hoverTooltip.innerHTML = `
          <div style="font-size:12px; font-weight:800; color:#7c3aed; margin-bottom:2px;">ICU Hour ${h}</div>
          <div>Total SOFA: <strong style="color:${parseInt(sofa, 10) >= 2 ? '#ef4444' : 'var(--status-normal)'}; font-size:13px;">${sofa} pts</strong></div>
          <div>MAP: <strong style="color:${map < 65 ? '#ef4444' : '#10b981'};">${map} mmHg</strong></div>
          <div>Serum Lactate: <strong style="color:#f59e0b;">${lact} mmol/L</strong></div>
          <div>Heart Rate: <strong>${hr} bpm</strong></div>
          <div style="font-size:10px; color:var(--text-muted); margin-top:3px;"><i class="bi bi-cursor-fill" style="margin-right:3px;"></i>Click point to scrub timeline</div>
        `;
        this.hoverTooltip.style.display = "block";
        this.hoverTooltip.style.left = `${e.clientX + 14}px`;
        this.hoverTooltip.style.top = `${e.clientY - 20}px`;
      });

      tr.addEventListener("mousemove", (e) => {
        if (!this.hoverTooltip) return;
        this.hoverTooltip.style.left = `${e.clientX + 14}px`;
        this.hoverTooltip.style.top = `${e.clientY - 20}px`;
      });

      tr.addEventListener("mouseleave", () => {
        if (this.hoverTooltip) this.hoverTooltip.style.display = "none";
      });
    });
  }

  /**
   * Renders the "What-If" Resuscitation Perfusion Comparison Gauge
   * High-contrast clinical visualizer with clear color coding and no text collisions.
   */
  renderSimulationComparison(svgElementId, baselineMap, simulatedMap, isAchieved, overloadRisk) {
    const svg = document.getElementById(svgElementId);
    if (!svg) return;

    const width = 520;
    const height = 185;
    const minMap = 40;
    const maxMap = 110;

    const xStart = 35;
    const xEnd = 485;
    const xWidth = xEnd - xStart;

    const barX = (val) => xStart + ((Math.min(maxMap, Math.max(minMap, val)) - minMap) / (maxMap - minMap)) * xWidth;

    const baseW = Math.max(10, barX(baselineMap) - xStart);
    const simW = Math.max(10, barX(simulatedMap) - xStart);
    const targetX = barX(65);

    const isBaseAchieved = baselineMap >= 65;
    const baseColor = isBaseAchieved ? 'var(--brand-teal, #00bfa6)' : '#ef4444';
    const simColor = isAchieved ? 'var(--brand-teal, #00bfa6)' : '#ef4444';

    const deltaMap = Math.round(simulatedMap - baselineMap);
    const deltaStr = deltaMap >= 0 ? `+${deltaMap}` : `${deltaMap}`;

    const elements = `
      <!-- Danger (<65) and Target (>=65) Background Shading Zones -->
      <rect x="${xStart}" y="38" width="${targetX - xStart}" height="96" rx="4" fill="rgba(239, 68, 68, 0.08)" />
      <rect x="${targetX}" y="38" width="${xEnd - targetX}" height="96" rx="4" fill="rgba(0, 191, 166, 0.10)" />

      <!-- Zone Indicator Labels -->
      <text x="${(xStart + targetX) / 2}" y="18" fill="#b91c1c" font-size="11" font-weight="800" text-anchor="middle" letter-spacing="0.04em">
        DANGER ZONE (&lt; 65 mmHg)
      </text>
      <text x="${(targetX + xEnd) / 2}" y="18" fill="var(--clinical-blue, #008775)" font-size="11" font-weight="800" text-anchor="middle" letter-spacing="0.04em">
        ADEQUATE PERFUSION ZONE (&ge; 65 mmHg)
      </text>

      <!-- Track 1: Baseline MAP -->
      <text x="${xStart}" y="36" fill="var(--text-primary)" font-size="13.5" font-weight="800">
        Baseline MAP: <tspan fill="${baseColor}" font-weight="900">${baselineMap} mmHg</tspan>
      </text>
      <text x="${xEnd}" y="36" fill="${baseColor}" font-size="12" font-weight="800" text-anchor="end">
        ${isBaseAchieved ? 'Target Met (&ge; 65 mmHg)' : 'Hypoperfusion Alert (&lt; 65)'}
      </text>
      <rect x="${xStart}" y="44" width="${xWidth}" height="26" rx="6" fill="var(--bg-inset, #f1f5f9)" stroke="var(--border-subtle, #cbd5e1)" stroke-width="1.2" />
      <rect x="${xStart}" y="44" width="${baseW}" height="26" rx="6" fill="${baseColor}" />

      <!-- Track 2: Simulated Post-Resuscitation MAP -->
      <text x="${xStart}" y="96" fill="var(--text-primary)" font-size="13.5" font-weight="800">
        Simulated Post-Resuscitation MAP: <tspan fill="${simColor}" font-weight="900">${simulatedMap} mmHg</tspan>
      </text>
      <text x="${xEnd}" y="96" fill="${simColor}" font-size="12" font-weight="800" text-anchor="end">
        ${isAchieved ? `Target Achieved (${deltaStr} mmHg)` : 'Below Target (&lt; 65 mmHg)'}
      </text>
      <rect x="${xStart}" y="104" width="${xWidth}" height="26" rx="6" fill="var(--bg-inset, #f1f5f9)" stroke="var(--border-subtle, #cbd5e1)" stroke-width="1.2" />
      <rect x="${xStart}" y="104" width="${simW}" height="26" rx="6" fill="${simColor}" />

      <!-- Target 65 Goal Line (Only drawn through tracks, cleanly avoiding text collision) -->
      <line x1="${targetX}" y1="40" x2="${targetX}" y2="74" stroke="var(--clinical-navy, #002757)" stroke-width="2.5" stroke-dasharray="4,3" />
      <line x1="${targetX}" y1="100" x2="${targetX}" y2="148" stroke="var(--clinical-navy, #002757)" stroke-width="2.5" stroke-dasharray="4,3" />

      <!-- Target 65 Badge & Pointer -->
      <polygon points="${targetX - 5},148 ${targetX + 5},148 ${targetX},152" fill="var(--clinical-navy, #002757)" />
      <rect x="${targetX - 54}" y="152" width="108" height="24" rx="5" fill="var(--clinical-navy, #002757)" />
      <text x="${targetX}" y="168" fill="#ffffff" font-size="12" font-weight="900" text-anchor="middle">Goal: 65 mmHg</text>

      <!-- Tick Labels -->
      <text x="${xStart}" y="164" fill="var(--text-muted)" font-size="12" font-weight="700">40 mmHg</text>
      <text x="${xEnd}" y="164" fill="var(--text-muted)" font-size="12" font-weight="700" text-anchor="end">110 mmHg</text>
    `;

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.innerHTML = elements;
  }
}
