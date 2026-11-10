/**
 * Clinical Markdown & Action Card Parser
 * Converts structured clinical notes and raw markdown into clean, high-contrast, accessible HTML.
 * Designed for clinical decision support environments (Epic/Cerner/UpToDate styling).
 */

export function renderClinicalMarkdown(text) {
  if (!text) return "";

  let html = text;

  // 1. Convert headers (###, ##, #)
  html = html.replace(/^### (.*$)/gim, '<h4 class="clinical-subheading">$1</h4>');
  html = html.replace(/^## (.*$)/gim, '<h3 class="clinical-heading">$1</h3>');

  // 2. Convert Bold (**text**) into styled <strong>
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="clinical-bold">$1</strong>');

  // 3. Convert Italic (*text*) into styled <em>
  html = html.replace(/\*([^*]+)\*/g, '<em class="clinical-italic">$1</em>');

  // 4. Convert Bullet Points (• or -) into clean styled list items or action cards
  const lines = html.split("\n");
  const processedLines = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (line.startsWith("• ") || line.startsWith("- ")) {
      if (!inList) {
        processedLines.push('<ul class="clinical-action-list">');
        inList = true;
      }
      const itemContent = line.replace(/^[•-]\s*/, "");
      
      // Determine icon based on clinical content
      let icon = "🔹";
      if (itemContent.toLowerCase().includes("fluid") || itemContent.toLowerCase().includes("crystalloid")) {
        icon = "💧";
      } else if (itemContent.toLowerCase().includes("culture") || itemContent.toLowerCase().includes("blood")) {
        icon = "🧪";
      } else if (itemContent.toLowerCase().includes("antimicrobial") || itemContent.toLowerCase().includes("antibiotic")) {
        icon = "💊";
      } else if (itemContent.toLowerCase().includes("hemodynamic") || itemContent.toLowerCase().includes("map")) {
        icon = "❤️";
      } else if (itemContent.toLowerCase().includes("lactate")) {
        icon = "⏱️";
      } else if (itemContent.toLowerCase().includes("vasopressor") || itemContent.toLowerCase().includes("norepi")) {
        icon = "💉";
      }

      processedLines.push(`
        <li class="clinical-action-item">
          <span class="action-icon" aria-hidden="true">${icon}</span>
          <div class="action-text">${itemContent}</div>
        </li>
      `);
    } else {
      if (inList) {
        processedLines.push('</ul>');
        inList = false;
      }

      if (line.length > 0) {
        // Check if this line is an alert callout (⚠️)
        if (line.includes("⚠️") || line.includes("PROACTIVE SAFETY") || line.includes("WARNING")) {
          processedLines.push(`
            <div class="clinical-alert-callout">
              <div class="callout-content">${line}</div>
            </div>
          `);
        } else if (line.startsWith("1. ") || line.startsWith("2. ") || line.startsWith("3. ") || line.startsWith("4. ") || line.startsWith("5. ")) {
          // Numbered section headers
          processedLines.push(`<h3 class="clinical-section-header">${line}</h3>`);
        } else {
          processedLines.push(`<p class="clinical-p">${line}</p>`);
        }
      }
    }
  }

  if (inList) {
    processedLines.push('</ul>');
  }

  html = processedLines.join("\n");

  // 5. Convert Citation Bracket Pills [SSC-2021-...] into interactive buttons
  html = html.replace(/\[([A-Z0-9_-]+)\]/g, (match, id) => {
    return `<button type="button" class="citation-pill" onclick="inspectCitation('${id}')" title="Inspect clinical evidence for ${id}">[${id}]</button>`;
  });

  return html;
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
      spectrum: "Gram-positive (MRSA)",
      standardDose: "25–30 mg/kg IV loading, then 15–20 mg/kg IV q8–12h",
      renalAdj: isAki 
        ? "<strong>15 mg/kg IV q24h</strong> (maintain AUC24/MIC 400–600 mg·h/L)" 
        : "Standard interval (q8–12h)",
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
        ? "<strong>3.375 g IV q6h</strong> or 2.25 g IV q6h extended infusion" 
        : "4.5 g IV q6h extended infusion",
      safetyAlert: alerts.find(a => a.drug && a.drug.toLowerCase().includes("piperacillin"))
        ? "⚠️ Synergistic AKI hazard when co-administered with Vancomycin."
        : "Normal renal dose.",
      citation: "DOSE-PIPTAZO-01",
      citation2: null
    },
    {
      id: "cefepime",
      name: "Cefepime (Maxipime)",
      spectrum: "Antipseudomonal 4th-gen Cephalosporin",
      standardDose: "2 g IV every 8 hours (extended infusion)",
      renalAdj: isAki 
        ? "<strong class='text-critical'>2 g IV q12h</strong> (mandatory dose reduction to avoid neurotoxicity)" 
        : "2 g IV q8h extended infusion",
      safetyAlert: isAki 
        ? "⚠️ <strong>High Neurotoxicity Risk:</strong> Encephalopathy, myoclonus, nonconvulsive status epilepticus."
        : "Standard monitoring.",
      citation: "DOSE-CEFEPIME-01",
      citation2: "DOSE-CEFEPIME-CONTRA-01"
    },
    {
      id: "meropenem",
      name: "Meropenem (Merrem)",
      spectrum: "Ultra-broad Carbapenem (ESBL-producing strains)",
      standardDose: "1 g IV every 8 hours (extended 3 hr infusion)",
      renalAdj: isAki 
        ? "<strong>1 g IV q12h</strong> (extended infusion)" 
        : "1 g IV q8h extended infusion",
      safetyAlert: "Reserve for proven resistant gram-negative or septic shock with ESBL risk.",
      citation: "DOSE-MEROPENEM-01",
      citation2: null
    },
    {
      id: "gentamicin",
      name: "Gentamicin",
      spectrum: "Aminoglycoside synergy / Resistant Gram-negatives",
      standardDose: "5–7 mg/kg IV once daily (extended-interval dosing)",
      renalAdj: isAki 
        ? "<strong class='text-critical'>CONTRAINDICATED in AKI (WITHHOLD)</strong>" 
        : "5–7 mg/kg IV q24h with trough monitoring",
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
        <td>${r.standardDose}</td>
        <td>${r.renalAdj}</td>
        <td>
          <div class="safety-cell-text">${r.safetyAlert}</div>
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
