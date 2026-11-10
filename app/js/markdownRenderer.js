/**
 * Clinical Markdown & Action Card Parser
 * Converts structured clinical notes and raw markdown into clean, high-contrast, accessible HTML.
 * Designed for clinical decision support environments (Epic/Cerner/UpToDate styling).
 */

export function renderClinicalMarkdown(text) {
  if (!text) return "";

  // 1. Clean up bracketed citations with outer parentheses like "( [CITATION] )" or "([CITATION])"
  let html = text.replace(/\(\s*\[([A-Z0-9_-]+)\]\s*\)/g, '[$1]');
  html = html.replace(/\(\s*\[([A-Z0-9_-]+)\]\s*,\s*\[([A-Z0-9_-]+)\]\s*\)/g, '[$1] [$2]');
  html = html.replace(/\(\s*\[([A-Z0-9_-]+)\]\s*,\s*\[([A-Z0-9_-]+)\]\s*,\s*\[([A-Z0-9_-]+)\]\s*\)/g, '[$1] [$2] [$3]');

  // 2. Convert Bold (**text**) into styled <strong>
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="clinical-bold">$1</strong>');

  // 3. Convert Italic (*text*) into styled <em>
  html = html.replace(/\*([^*]+)\*/g, '<em class="clinical-italic">$1</em>');

  // 4. Convert Citation Bracket Pills [SSC-2021-...] into interactive buttons
  html = html.replace(/\[([A-Z0-9_-]+)\]/g, (match, id) => {
    return `<button type="button" class="citation-pill" onclick="inspectCitation('${id}')" title="Inspect clinical evidence for ${id}">[${id}]</button>`;
  });

  // 5. Line-by-line processing
  const lines = html.split("\n");
  const processed = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      if (inList) {
        processed.push('</ul>');
        inList = false;
      }
      continue;
    }

    // A. Sub-section headers like "PROACTIVE SAFETY CONTRAINDICATION WARNINGS:" or "ANTIMICROBIAL DOSING REGIMEN:"
    if (line.includes("PROACTIVE SAFETY CONTRAINDICATION WARNINGS") || line.includes("ANTIMICROBIAL DOSING REGIMEN")) {
      if (inList) {
        processed.push('</ul>');
        inList = false;
      }
      const isWarning = line.includes("WARNINGS");
      const icon = isWarning ? "⚠️" : "💊";
      const cleanTitle = line.replace(/<[^>]+>/g, '').replace(/[:*]/g, '').trim();
      processed.push(`
        <div class="clinical-group-header ${isWarning ? 'header-warning' : 'header-regimen'}">
          <span class="group-icon">${icon}</span>
          <span class="group-title">${cleanTitle}</span>
        </div>
      `);
      continue;
    }

    // B. Contraindication / Hazard alert lines (contains ⚠️ or ⛔)
    if (line.includes("⚠️") || line.includes("⛔")) {
      if (inList) {
        processed.push('</ul>');
        inList = false;
      }
      
      const isCritical = line.includes("⛔") || line.toLowerCase().includes("contraindicated") || line.toLowerCase().includes("overload");
      
      // Clean emoji and variations
      let alertBody = line.replace(/^[⚠️⛔\uFE0F\s]+/, "");
      let actionPart = "";
      
      const actionMatch = alertBody.match(/<em class="clinical-italic">Recommended Action:<\/em>\s*(.*?)(?=(?:<button|$))/i);
      if (actionMatch) {
        actionPart = `<div class="alert-action-strip">👉 <strong style="color:var(--text-primary);">Recommended Action:</strong> ${actionMatch[1].trim()}</div>`;
        alertBody = alertBody.replace(actionMatch[0], "");
      }

      processed.push(`
        <div class="clinical-alert-callout ${isCritical ? 'callout-critical' : 'callout-warning'}">
          <div class="callout-header-row">
            <span class="callout-icon">${isCritical ? '⛔' : '⚠️'}</span>
            <div class="callout-content-text">${alertBody}</div>
          </div>
          ${actionPart}
        </div>
      `);
      continue;
    }

    // C. Bulleted action items (• or -)
    if (line.startsWith("• ") || line.startsWith("- ")) {
      if (!inList) {
        processed.push('<ul class="clinical-action-list">');
        inList = true;
      }
      const itemContent = line.replace(/^[•-]\s*/, "");
      
      // Determine icon based on clinical content
      let icon = "🔹";
      if (itemContent.toLowerCase().includes("fluid") || itemContent.toLowerCase().includes("crystalloid") || itemContent.toLowerCase().includes("edema")) {
        icon = "💧";
      } else if (itemContent.toLowerCase().includes("culture") || itemContent.toLowerCase().includes("blood")) {
        icon = "🧪";
      } else if (itemContent.toLowerCase().includes("antimicrobial") || itemContent.toLowerCase().includes("antibiotic") || itemContent.toLowerCase().includes("vancomycin") || itemContent.toLowerCase().includes("cefepime")) {
        icon = "💊";
      } else if (itemContent.toLowerCase().includes("hemodynamic") || itemContent.toLowerCase().includes("map")) {
        icon = "❤️";
      } else if (itemContent.toLowerCase().includes("lactate")) {
        icon = "⏱️";
      } else if (itemContent.toLowerCase().includes("vasopressor") || itemContent.toLowerCase().includes("norepi") || itemContent.toLowerCase().includes("vasopressin")) {
        icon = "💉";
      } else if (itemContent.toLowerCase().includes("renal") || itemContent.toLowerCase().includes("creatinine")) {
        icon = "🫘";
      }

      processed.push(`
        <li class="clinical-action-item">
          <span class="action-icon" aria-hidden="true">${icon}</span>
          <div class="action-text">${itemContent}</div>
        </li>
      `);
      continue;
    }

    // D. Numbered section headers (1. , 2. , 3. ...)
    if (/^[1-5]\.\s+/.test(line)) {
      if (inList) {
        processed.push('</ul>');
        inList = false;
      }
      processed.push(`<h3 class="clinical-section-header">${line}</h3>`);
      continue;
    }

    // E. General Paragraph
    if (inList) {
      processed.push('</ul>');
      inList = false;
    }
    processed.push(`<p class="clinical-p">${line}</p>`);
  }

  if (inList) {
    processed.push('</ul>');
  }

  return processed.join("\n");
}

/**
 * Generates an executive structured HTML table for antimicrobial regimens.
 */
export function renderAntimicrobialTable(selectedDrugs, creatinine, alerts) {
  const isAki = creatinine >= 1.5;

  const drugRows = [
    {
      id: "vancomycin",
      name: "Vancomycin",
      spectrum: "Gram-positive (MRSA coverage)",
      standardDose: "25–30 mg/kg IV loading dose, then 15–20 mg/kg IV q8–12h",
      renalAdj: isAki 
        ? "<span class='dose-badge dose-adjusted'>15 mg/kg IV q24h</span> (Target AUC₂₄/MIC 400–600 mg·h/L)" 
        : "<span class='dose-badge dose-standard'>Standard interval (q8–12h)</span>",
      safetyAlert: alerts.find(a => a.drug && a.drug.toLowerCase().includes("vancomycin"))
        ? "⚠️ Nephrotoxic synergy with Pip-Tazo. Daily Cr monitoring required."
        : "Therapeutic drug monitoring required.",
      citation: "DOSE-VANC-01",
      citation2: "DOSE-VANC-02"
    },
    {
      id: "piperacillin_tazobactam",
      name: "Piperacillin-Tazobactam (Zosyn)",
      spectrum: "Broad Pseudomonas & Enterobacteriaceae",
      standardDose: "4.5 g IV every 6 hours (extended 3–4 hr infusion)",
      renalAdj: isAki 
        ? "<span class='dose-badge dose-adjusted'>3.375 g IV q6h</span> or 2.25 g IV q6h extended infusion" 
        : "<span class='dose-badge dose-standard'>4.5 g IV q6h extended infusion</span>",
      safetyAlert: alerts.find(a => a.drug && a.drug.toLowerCase().includes("piperacillin"))
        ? "⚠️ Synergistic AKI hazard when co-administered with Vancomycin."
        : "Standard renal dose.",
      citation: "DOSE-PIPTAZO-01",
      citation2: null
    },
    {
      id: "cefepime",
      name: "Cefepime (Maxipime)",
      spectrum: "Antipseudomonal 4th-gen Cephalosporin",
      standardDose: "2 g IV every 8 hours (extended infusion)",
      renalAdj: isAki 
        ? "<span class='dose-badge dose-critical'>2 g IV q12h</span> (Mandatory dose reduction to avoid neurotoxicity)" 
        : "<span class='dose-badge dose-standard'>2 g IV q8h extended infusion</span>",
      safetyAlert: isAki 
        ? "⛔ <strong>High Neurotoxicity Risk:</strong> Encephalopathy, myoclonus, seizures."
        : "Standard renal clearance.",
      citation: "DOSE-CEFEPIME-01",
      citation2: "DOSE-CEFEPIME-CONTRA-01"
    },
    {
      id: "meropenem",
      name: "Meropenem (Merrem)",
      spectrum: "Ultra-broad Carbapenem (ESBL strains)",
      standardDose: "1 g IV every 8 hours (extended 3 hr infusion)",
      renalAdj: isAki 
        ? "<span class='dose-badge dose-adjusted'>1 g IV q12h</span> (extended infusion)" 
        : "<span class='dose-badge dose-standard'>1 g IV q8h extended infusion</span>",
      safetyAlert: "Reserve for proven resistant gram-negative pathogens or septic shock with ESBL risk.",
      citation: "DOSE-MEROPENEM-01",
      citation2: null
    },
    {
      id: "gentamicin",
      name: "Gentamicin",
      spectrum: "Aminoglycoside synergy / Resistant Gram-negatives",
      standardDose: "5–7 mg/kg IV once daily (extended-interval dosing)",
      renalAdj: isAki 
        ? "<span class='dose-badge dose-contraindicated'>CONTRAINDICATED in AKI (WITHHOLD)</span>" 
        : "<span class='dose-badge dose-standard'>5–7 mg/kg IV q24h with trough monitoring</span>",
      safetyAlert: isAki 
        ? "⛔ <strong>Acute Kidney Injury Hazard:</strong> Direct tubular damage & irreversible ototoxicity."
        : "Monitor peak & trough levels closely.",
      citation: "DOSE-GENT-CONTRA-01",
      citation2: null
    }
  ];

  // Filter to active selected drugs or show all 5
  const activeRows = drugRows.filter(d => selectedDrugs.length === 0 || selectedDrugs.includes(d.id));

  let html = `
    <div class="clinical-table-wrapper">
      <table class="clinical-dosing-table">
        <thead>
          <tr>
            <th>Antimicrobial</th>
            <th>Standard Regimen</th>
            <th>Renal Adjustment (Cr ${creatinine.toFixed(1)} mg/dL)</th>
            <th>Safety Status &amp; Evidence</th>
          </tr>
        </thead>
        <tbody>
  `;

  for (const r of activeRows) {
    const isRowHazard = r.safetyAlert.includes("⚠️") || r.safetyAlert.includes("⛔");
    html += `
      <tr class="${isRowHazard ? 'row-hazard' : ''}">
        <td>
          <div class="drug-name-cell">${r.name}</div>
          <div class="drug-spec-sub">${r.spectrum}</div>
        </td>
        <td style="font-size:0.88rem; color:var(--text-secondary);">${r.standardDose}</td>
        <td>${r.renalAdj}</td>
        <td>
          <div class="safety-cell-text" style="font-size:0.86rem; margin-bottom:4px;">${r.safetyAlert}</div>
          <div class="evidence-pills-row">
            <button type="button" class="citation-pill" onclick="inspectCitation('${r.citation}')" title="Inspect ${r.citation}">[${r.citation}]</button>
            ${r.citation2 ? `<button type="button" class="citation-pill" onclick="inspectCitation('${r.citation2}')" title="Inspect ${r.citation2}">[${r.citation2}]</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }

  html += `
        </tbody>
      </table>
    </div>
  `;

  return html;
}
