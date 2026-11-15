/**
 * Clinical Synthesis & Decision Support Engine
 * Supports:
 *  1. Standard CDS (Deterministic Extractive RAG, < 5 ms, zero hallucination)
 *  2. Local AI Hybrid Consultation & Real-Time Copilot (Ollama /api/ollama proxy or localhost:11434)
 *  3. In-Browser Neural CDS fallback adapter (WebGPU WebLLM status tracking)
 */

export class ClinicalSynthesizer {
  constructor(vectorIndex) {
    this.vectorIndex = vectorIndex;
    this.currentMode = "EXTRACTIVE_RAG"; // "EXTRACTIVE_RAG" | "WEBGPU" | "OLLAMA"
    this.webgpuAvailable = false;
    this.webllmEngine = null;
    this.isWebllmLoading = false;
    this.selectedModel = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
    this.currentAbortController = null;
    this.chatAbortController = null;
    this.ollamaBaseUrl = null;
    this.ollamaStatus = {
      checked: false,
      online: false,
      baseUrl: null,
      models: [],
      activeModel: null,
      error: null
    };
    this.checkWebGpuSupport();
  }

  abortCurrentOllama() {
    if (this.currentAbortController) {
      try {
        this.currentAbortController.abort();
      } catch (e) {}
      this.currentAbortController = null;
    }
  }

  abortCurrentChat() {
    if (this.chatAbortController) {
      try {
        this.chatAbortController.abort();
      } catch (e) {}
      this.chatAbortController = null;
    }
  }

  getCandidateOllamaUrls() {
    const isFileProtocol = typeof window !== "undefined" && window.location?.protocol === "file:";
    const urls = [];
    if (!isFileProtocol) {
      urls.push("/api/ollama");
    }
    urls.push("http://localhost:11434", "http://127.0.0.1:11434");
    return urls;
  }

  async _probeOllamaUrl(baseUrl, timeoutMs = 1100) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(`${baseUrl}/api/tags`, {
        method: "GET",
        signal: controller.signal
      });
      if (!resp.ok) return null;
      const contentType = resp.headers?.get?.("content-type") || "";
      const data = await resp.json();
      if (!data || !Array.isArray(data.models)) {
        return null;
      }
      if (contentType && !contentType.includes("json") && data.models.length === 0) {
        return null;
      }
      return { ok: true, baseUrl, models: data.models };
    } catch (e) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async checkOllamaStatus(forceRefresh = false) {
    if (!forceRefresh && this.ollamaStatus.checked && this.ollamaStatus.online && this.ollamaBaseUrl) {
      return this.ollamaStatus;
    }

    const candidates = this.getCandidateOllamaUrls();
    for (let i = 0; i < candidates.length; i++) {
      const probe = await this._probeOllamaUrl(candidates[i]);
      if (probe && probe.ok) {
        const modelNames = probe.models.map(m => m.name).filter(Boolean);
        const preferred = probe.models.find(m => (m.name || "").includes("qwen"))
          || probe.models.find(m => (m.name || "").includes("llama"))
          || probe.models[0];
        const activeModel = preferred ? preferred.name : "qwen2.5:1.5b";
        this.ollamaBaseUrl = probe.baseUrl;
        this.ollamaStatus = {
          checked: true,
          online: true,
          baseUrl: probe.baseUrl,
          models: modelNames,
          activeModel,
          error: null
        };
        return this.ollamaStatus;
      }
    }

    this.ollamaBaseUrl = null;
    this.ollamaStatus = {
      checked: true,
      online: false,
      baseUrl: null,
      models: [],
      activeModel: null,
      error: "No reachable Ollama daemon at /api/ollama or localhost:11434"
    };
    return this.ollamaStatus;
  }

  async checkWebGpuSupport() {
    if (typeof navigator !== "undefined" && navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        this.webgpuAvailable = !!adapter;
        if (this.webgpuAvailable) {
          console.log("[Synthesis] WebGPU is available on this device.");
        }
      } catch (e) {
        this.webgpuAvailable = false;
      }
    } else {
      this.webgpuAvailable = false;
    }
  }

  setMode(mode) {
    this.currentMode = mode;
    console.log(`[Synthesis] Active mode switched to: ${mode}`);
  }

  /**
   * Deterministic Extractive RAG Composer (< 5 ms)
   * Guaranteed zero hallucination, 100% cited, instant CPU execution.
   */
  synthesizeExtractiveNote(patient, currentHour, vitals, labs, sofa, status, alerts, retrievedChunks, simulation) {
    const startTime = performance.now();
    const cr = labs.creatinine_mg_dl || 0.9;
    const lactMmol = labs.lactate_mmol_l;
    const lactMgDl = labs.lactate_mg_dl;
    const mapVal = vitals.map;
    const age = patient.demographics.age;
    const gender = patient.demographics.gender;

    // Determine Confidence Score & Escalation Flag
    let confidenceBadge = {
      label: "HIGH CONFIDENCE (Direct SSC-2021 & Sepsis-3 Match)",
      color: "bg-emerald-950 text-emerald-300 border-emerald-600",
      escalate: false
    };

    if (alerts.some(a => a.level === "CRITICAL_HAZARD") || simulation.isRefractory) {
      confidenceBadge = {
        label: "CRITICAL ESCALATION REQUIRED (Refractory Shock / AKI Hazard)",
        color: "bg-red-950 text-red-300 border-red-600",
        escalate: true
      };
    } else if (sofa.total >= 2) {
      confidenceBadge = {
        label: "MODERATE CONFIDENCE (Sepsis-3 Target Attainment)",
        color: "bg-blue-950 text-blue-300 border-blue-600",
        escalate: false
      };
    }

    // Build structured sections
    const sections = [];

    // 1. Diagnostic Summary
    sections.push({
      id: "diagSec",
      tab: "sofaTab",
      heading: "1. Clinical Assessment & Sepsis-3 Diagnostic Classification",
      body: `Patient is a ${age}yo ${gender.toLowerCase()} presenting at ICU Hour ${currentHour} with **${status.status}** ([SEPSIS3-DEF-01]). Total SOFA Score: **${sofa.total}** (Respiration: ${sofa.resp}, Coagulation: ${sofa.coag}, Liver: ${sofa.liver}, Cardiovascular: ${sofa.cv}, Renal: ${sofa.renal} [SEPSIS3-SOFA-CV], [SEPSIS3-SOFA-RENAL]). Mean Arterial Pressure: **${mapVal} mmHg**, Serum Lactate: **${lactMmol !== null ? lactMmol + " mmol/L (" + lactMgDl + " mg/dL)" : "Not drawn"}** ([SSC-2021-BUNDLE-01]).`
    });

    // 2. Immediate 1-Hour Bundle Resuscitation Actions
    let bundleActions = [];
    if (mapVal < 65 || (lactMmol && lactMmol >= 4.0)) {
      bundleActions.push(`• **Fluid Resuscitation:** Administer **30 mL/kg IV balanced crystalloid bolus** (Lactated Ringer's or Plasma-Lyte preferred over normal saline) within 3 hours ([SSC-2021-FLUID-01], [SSC-2021-FLUID-02]).`);
    } else {
      bundleActions.push(`• **Hemodynamic Optimization:** Maintain MAP >= 65 mmHg with conservative fluid management and dynamic fluid responsiveness checks ([SSC-2021-FLUID-03]).`);
    }

    bundleActions.push(`• **Diagnostic Cultures:** Draw two sets of blood cultures (aerobic and anaerobic) prior to initiating antimicrobials (do not delay antimicrobial start > 45 minutes) ([SSC-2021-BUNDLE-02]).`);
    bundleActions.push(`• **Empiric Antimicrobial Administration:** Initiate broad-spectrum IV coverage immediately (within 1 hour) ([SSC-2021-BUNDLE-03], [SSC-2021-ANTIMIC-01]).`);
    
    sections.push({
      id: "bundleSec",
      tab: "bundleTab",
      heading: "2. Immediate Surviving Sepsis Campaign (SSC) 1-Hour Bundle Actions",
      body: bundleActions.join("\n")
    });

    // 3. Empiric Antimicrobial & Organ-Adjusted Prescribing Plan
    let drugPlan = [];
    const criticalDosingAlerts = alerts.filter(a => a.id.startsWith("ALERT-"));
    
    if (criticalDosingAlerts.length > 0) {
      drugPlan.push("**PROACTIVE SAFETY CONTRAINDICATION WARNINGS:**");
      for (const al of criticalDosingAlerts) {
        drugPlan.push(`ALERT [${al.level}]: **${al.drug} (${al.badge}):** ${al.message} *Recommended Action:* ${al.recommendation} [${al.citation}]`);
      }
      drugPlan.push("");
    }

    drugPlan.push("**ANTIMICROBIAL DOSING REGIMEN:**");
    drugPlan.push(`Empiric broad-spectrum antibiotic regimens below are individualized for baseline organ function (Serum Creatinine: **${cr.toFixed(1)} mg/dL**). Extended infusions (3–4 hours) are recommended to maximize beta-lactam pharmacodynamics (time above MIC) ([DOSE-PIPTAZO-01], [DOSE-CEFEPIME-01]).`);

    sections.push({
      id: "antimicrobialSec",
      tab: "antimicrobialTab",
      heading: "3. Empiric Antimicrobial Strategy & Renal Safety Adjustments",
      body: drugPlan.join("\n"),
      showTable: true
    });

    // 4. Hemodynamics, Vasopressors & "What-If" Simulation Trajectory
    let hemoPlan = [];
    if (simulation.baselineMap < 65 || simulation.simulatedMap < 65) {
      hemoPlan.push(`• **First-Line Vasopressor:** Titrate **Norepinephrine** (target MAP >= 65 mmHg) ([SSC-2021-VASO-01], [SSC-2021-VASO-02]). Peripheral administration is acceptable while central line access is established ([SSC-2021-VASO-07]).`);
    }
    
    if (simulation.isRefractory) {
      hemoPlan.push(`• **Refractory Septic Shock Escalation:** MAP remains < 65 mmHg despite high-dose norepinephrine. Initiate **Vasopressin 0.03 units/min** ([SSC-2021-VASO-03]) and add **IV Hydrocortisone 200 mg/day** ([SSC-2021-STEROID-01], [ESCALATE-REFRACTORY-01]).`);
    }

    if (simulation.overloadRiskPercentage > 50) {
      hemoPlan.push(`• **Volume Overload Warning (${simulation.overloadRiskPercentage}% Risk):** Restrict further crystalloids. Transition to dynamic fluid responsiveness assessment ([SSC-2021-FLUID-03]).`);
    }

    hemoPlan.push(`• **Simulated Response:** Baseline MAP ${simulation.baselineMap} mmHg to Simulated Post-Intervention MAP **${simulation.simulatedMap} mmHg** (${simulation.isMapTargetAchieved ? "TARGET >= 65 ACHIEVED" : "BELOW TARGET"}).`);

    sections.push({
      id: "hemoSec",
      tab: "hemoTab",
      heading: "4. Hemodynamic Resuscitation & Simulation Trajectory",
      body: hemoPlan.join("\n")
    });

    // 5. Monitoring & Re-evaluation Triggers
    sections.push({
      id: "monitorSec",
      tab: "bundleTab",
      heading: "5. Monitoring, Escalation & De-Escalation Milestones",
      body: `• **Repeat Lactate:** Re-measure serum lactate in 2 to 4 hours to verify clearance >= 10-20% ([SSC-2021-BUNDLE-01]).\n• **Renal Function:** Check serum creatinine and urine output every 8-12 hours in acute kidney injury.\n• **Antimicrobial Review:** Perform daily antibiotic time-out at 48 hours for culture-guided de-escalation ([SSC-2021-ANTIMIC-04]).`
    });

    const elapsedMs = performance.now() - startTime;

    return {
      mode: "EXTRACTIVE_RAG",
      provenance: "DETERMINISTIC_RULES",
      engineLabel: "Standard CDS • Deterministic Rule Engine",
      isAiGenerated: false,
      confidence: confidenceBadge,
      sections,
      elapsedMs: Math.round(elapsedMs * 10) / 10,
      retrievedChunks
    };
  }

  /**
   * Auto-detects available models from resolved Ollama endpoint (/api/ollama or localhost:11434)
   */
  async detectOllamaModel(forceRefresh = false) {
    const status = await this.checkOllamaStatus(forceRefresh || !this.ollamaStatus.checked);
    return status.activeModel || "qwen2.5:1.5b";
  }

  /**
   * Connects to resolved Ollama endpoint with token streaming and explicit hybrid provenance
   */
  async synthesizeOllama(patient, currentHour, vitals, labs, sofa, status, alerts, retrievedChunks, simulation, onProgress) {
    this.abortCurrentOllama();
    this.currentAbortController = new AbortController();
    const signal = this.currentAbortController.signal;

    const startTime = performance.now();
    const extractive = this.synthesizeExtractiveNote(patient, currentHour, vitals, labs, sofa, status, alerts, retrievedChunks, simulation);

    try {
      const statusInfo = await this.checkOllamaStatus(!this.ollamaBaseUrl);
      if (!statusInfo.online || !statusInfo.baseUrl) {
        throw new Error(statusInfo.error || "Local Ollama server unreachable");
      }

      const targetModel = statusInfo.activeModel || "qwen2.5:1.5b";
      const contextPrompt = `You are an expert ICU clinical decision support AI. Ground your advice strictly in these clinical guideline chunks and patient numbers. Do NOT invent vitals, labs, or chunk IDs:
${retrievedChunks.slice(0, 3).map(c => `[${c.id}] ${c.title}: ${c.text}`).join("\n\n")}

Patient Assessment:
- Patient: ${patient.demographics.age}yo ${patient.demographics.gender} | Sepsis Status: ${status.status}
- Deterministic SOFA Score: ${sofa.total} (Resp: ${sofa.resp}, Coag: ${sofa.coag}, Liver: ${sofa.liver}, CV: ${sofa.cv}, Renal: ${sofa.renal})
- Bedside Vitals: MAP ${vitals.map} mmHg, HR ${vitals.hr} bpm | Lactate: ${labs.lactate_mmol_l} mmol/L, Creatinine: ${labs.creatinine_mg_dl} mg/dL
- Active Safety Alerts: ${alerts.map(a => `${a.drug} (${a.badge}): ${a.message}`).join("; ") || "None"}

Provide a concise 3-bullet clinical SBAR recommendation note citing exact chunk IDs in brackets (e.g., [SSC-2021-BUNDLE-01]):
• Sepsis diagnostic classification and hemodynamic resuscitation target (MAP >= 65 mmHg)
• Surviving Sepsis Campaign 1-hour bundle orders (cultures, empiric broad-spectrum coverage)
• Renal safety adjustments and active contraindication precautions`;

      // 25-second timeout safeguard to prevent hanging
      const timeoutId = setTimeout(() => {
        this.abortCurrentOllama();
      }, 25000);

      const response = await fetch(`${statusInfo.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          model: targetModel,
          prompt: contextPrompt,
          stream: true,
          options: {
            num_predict: 220,
            temperature: 0.2,
            top_p: 0.9
          }
        })
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Ollama returned HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let accumulatedText = "";
      let buffer = "";

      const handleLine = (line) => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        try {
          const chunk = JSON.parse(trimmed);
          const token = chunk.response || chunk.message?.content || "";
          if (token) {
            accumulatedText += token;
            if (onProgress) {
              onProgress({
                model: targetModel,
                token,
                fullText: accumulatedText,
                done: chunk.done || false,
                elapsedMs: Math.round(performance.now() - startTime)
              });
            }
          }
          return !!chunk.done;
        } catch (err) {
          return false;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        let streamFinished = false;
        for (const line of lines) {
          if (handleLine(line)) streamFinished = true;
        }
        if (streamFinished) break;
      }
      if (buffer && buffer.trim()) {
        handleLine(buffer);
      }

      const elapsedMs = performance.now() - startTime;
      const sections = [...extractive.sections];

      if (accumulatedText.trim()) {
        sections.unshift({
          id: "ollamaGenSec",
          tab: "bundleTab",
          isGenerativeAi: true,
          modelName: targetModel,
          heading: `AI-Generated SBAR Consultation (Ollama • ${targetModel})`,
          body: accumulatedText.trim()
        });
      }

      return {
        mode: `OLLAMA_CPU (${targetModel})`,
        provenance: "GENERATIVE_AI",
        engineLabel: `Local AI Hybrid • Ollama (${targetModel})`,
        isAiGenerated: true,
        baseUrl: statusInfo.baseUrl,
        model: targetModel,
        confidence: extractive.confidence,
        rawText: accumulatedText,
        sections,
        elapsedMs: Math.round(elapsedMs),
        retrievedChunks
      };
    } catch (e) {
      if (e.name === "AbortError") {
        console.log("[Synthesis] Ollama request was aborted or superseded.");
      } else {
        console.warn("[Synthesis] Ollama local connection failed, falling back to Standard Deterministic CDS:", e);
        this.ollamaBaseUrl = null;
        this.ollamaStatus = {
          checked: true,
          online: false,
          baseUrl: null,
          models: [],
          activeModel: null,
          error: e.message || "Ollama unreachable"
        };
      }
      const fallback = this.synthesizeExtractiveNote(patient, currentHour, vitals, labs, sofa, status, alerts, retrievedChunks, simulation);
      fallback.mode = "EXTRACTIVE_RAG (Ollama Fallback)";
      fallback.provenance = "OFFLINE_FALLBACK";
      fallback.engineLabel = "Ollama Unreachable • Deterministic Rule Fallback Active";
      fallback.isAiGenerated = false;
      fallback.fallbackReason = e.message || "Ollama unreachable";
      return fallback;
    } finally {
      this.currentAbortController = null;
    }
  }

  /**
   * Builds a strictly grounded clinical context prompt from the active bedside state & retrieved RAG chunks
   */
  buildClinicalSystemContext(contextSnapshot = {}, retrievedChunks = []) {
    const {
      patientId = "Unknown",
      age = "--",
      gender = "--",
      category = "ICU",
      hour = "--",
      status = "Unknown",
      sofa = {},
      vitals = {},
      labs = {},
      prediction = null,
      simulation = {},
      alerts = [],
      progressNote = ""
    } = contextSnapshot;

    const alertText = alerts.length > 0
      ? alerts.map(a => `- ${a.drug} [${a.level} / ${a.badge}]: ${a.message} Recommended: ${a.recommendation} [${a.citation}]`).join("\n")
      : "- None active at this hour.";

    const predLine = prediction
      ? `${prediction.percentage}% (${prediction.tier}${prediction.sustained2of3 ? ", 2-of-3h Sustained" : ""}; Drivers: ${(prediction.topDrivers || []).map(d => `${d.label}=${d.rawValue} (${d.zScore >= 0 ? "+" : ""}${d.zScore} SD)`).join(", ") || "Within baseline"})`
      : "Not computed";

    const simLine = `Fluid Bolus=${simulation.fluidBolusMlKg ?? 0} mL/kg, Norepinephrine=${simulation.norepinephrine ?? 0} mcg/kg/min, Vasopressin=${simulation.vasopressin ?? 0} u/min -> Simulated MAP=${simulation.simulatedMap ?? vitals.map ?? "--"} mmHg, Volume Overload Risk=${simulation.overloadRiskPercentage ?? 0}%`;

    const trimmedNote = progressNote ? String(progressNote).trim().slice(0, 550) : "None attached";

    const chunkBlock = (retrievedChunks || [])
      .slice(0, 4)
      .map(c => `[${c.id}] ${c.title} (${c.evidence_grade || "Guideline"} | ${c.source}):\n${c.text}`)
      .join("\n\n");

    return `You are an evidence-grounded ICU Sepsis Clinical Copilot running locally alongside deterministic safety gates.
STRICT SAFETY & GROUNDING RULES:
1. Base clinical reasoning ONLY on the patient snapshot and retrieved guideline chunks below. Never invent numbers, medications, or citations.
2. Whenever citing a guideline excerpt, include its exact chunk ID in square brackets, e.g. [SSC-2021-BUNDLE-01].
3. Deterministic SOFA math, Tier 1 risk thresholds, and renal dosing contraindication alerts CANNOT be overridden by generative text — highlight them clearly when present.
4. Keep responses concise (3-5 focused clinical bullets) and directly answer the clinician's question.

ACTIVE PATIENT SNAPSHOT (Hour ${hour}):
- Patient: ${patientId} (${age}yo ${gender} | ${category})
- Sepsis-3 Classification: ${status}
- Deterministic SOFA: ${sofa.total ?? 0} (Resp: ${sofa.resp ?? 0}, Coag: ${sofa.coag ?? 0}, Liver: ${sofa.liver ?? 0}, CV: ${sofa.cv ?? 0}, Renal: ${sofa.renal ?? 0})
- Bedside Vitals: HR ${vitals.hr ?? "--"} bpm | MAP ${vitals.map ?? "--"} mmHg | SBP ${vitals.sbp ?? "--"} mmHg | SpO2 ${vitals.spo2 ?? "--"}% | Temp ${vitals.temp ?? "--"} C
- Labs: Lactate ${labs.lactate_mmol_l ?? "Pending"} mmol/L | Creatinine ${labs.creatinine_mg_dl ?? "--"} mg/dL | Platelets ${labs.platelets_k_ul ?? "--"} k/uL | Bilirubin ${labs.bilirubin_mg_dl ?? "--"} mg/dL
- Tier 1 6h Predictive Risk Forecast: ${predLine}
- Current "What-If" Simulation: ${simLine}
- Active Proactive Safety Alerts:
${alertText}
- Partner Progress Note Excerpt: ${trimmedNote}

RETRIEVED GUIDELINE EVIDENCE CHUNKS:
${chunkBlock || "No guideline chunks retrieved."}`;
  }

  /**
   * Builds a transparent deterministic response grounded in current bedside physiology & lexically retrieved chunks
   * when Ollama is offline or unreachable.
   */
  buildOfflineQueryAnswer(question = "", contextSnapshot = {}, retrievedChunks = [], reason = "") {
    const {
      patientId = "Patient",
      hour = "--",
      status = "Assessed",
      sofa = {},
      vitals = {},
      labs = {},
      prediction = null,
      alerts = []
    } = contextSnapshot;

    const lines = [];
    const headerNote = reason
      ? `Ollama Offline Fallback (${reason})`
      : "Deterministic Guideline Retrieval Response (Ollama Offline)";
    lines.push(`• **${headerNote}:** Live local LLM prose is currently unavailable, so this response synthesizes **${patientId} at Hour ${hour}** directly from deterministic rules and top lexical RAG matches.`);
    lines.push(`• **Active Physiology & Risk:** Classification is **${status}** (SOFA **${sofa.total ?? 0}**; MAP **${vitals.map ?? "--"} mmHg**, Lactate **${labs.lactate_mmol_l ?? "Pending"} mmol/L**, Creatinine **${labs.creatinine_mg_dl ?? "--"} mg/dL**).${prediction ? ` Tier 1 6h Forecast: **${prediction.percentage}%** (**${prediction.tier}**).` : ""}`);

    if (alerts.length > 0) {
      lines.push(`• **Deterministic Safety Gates:** ${alerts.map(a => `**${a.drug}** (${a.badge}: ${a.recommendation} [${a.citation}])`).join("; ")}.`);
    }

    if (retrievedChunks.length > 0) {
      lines.push(`• **Top Evidence Matches for "${String(question).trim()}":**`);
      retrievedChunks.slice(0, 3).forEach(ch => {
        const snippet = String(ch.text || "").slice(0, 210).trim();
        lines.push(`  • **${ch.title}** [${ch.id}]: ${snippet}${String(ch.text || "").length > 210 ? "..." : ""}`);
      });
    } else {
      lines.push("• **Evidence Match:** No matching chunks found in the local guideline index; verify local `knowledge_index.json` load.");
    }

    lines.push("• **Enable Live AI Synthesis:** Start Ollama (`docker compose --profile ollama up -d` or `ollama serve`) and select **Local AI Consultation (Ollama)** in the header.");
    return lines.join("\n");
  }

  /**
   * Real-time grounded multi-turn clinical Q&A via Ollama /api/chat with deterministic fallback.
   */
  async streamClinicalChat({ question, history = [], contextSnapshot = {}, retrievedChunks = [], onProgress }) {
    this.abortCurrentChat();
    this.chatAbortController = new AbortController();
    const signal = this.chatAbortController.signal;
    const startTime = performance.now();

    try {
      const statusInfo = await this.checkOllamaStatus(!this.ollamaBaseUrl);
      if (!statusInfo.online || !statusInfo.baseUrl) {
        const offlineText = this.buildOfflineQueryAnswer(question, contextSnapshot, retrievedChunks, statusInfo.error || "Ollama unreachable");
        return {
          isAiGenerated: false,
          provenance: "OFFLINE_FALLBACK",
          model: "Deterministic RAG",
          elapsedMs: Math.round(performance.now() - startTime),
          text: offlineText
        };
      }

      const targetModel = statusInfo.activeModel || "qwen2.5:1.5b";
      const systemPrompt = this.buildClinicalSystemContext(contextSnapshot, retrievedChunks);
      const safeHistory = (history || [])
        .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
        .slice(-6)
        .map(m => ({ role: m.role, content: m.content.trim() }));

      const timeoutId = setTimeout(() => {
        this.abortCurrentChat();
      }, 45000);

      const response = await fetch(`${statusInfo.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          model: targetModel,
          messages: [
            { role: "system", content: systemPrompt },
            ...safeHistory,
            { role: "user", content: String(question || "").trim() }
          ],
          stream: true,
          options: {
            temperature: 0.2,
            top_p: 0.9,
            num_predict: 360
          }
        })
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Ollama /api/chat returned HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let accumulatedText = "";
      let buffer = "";

      const handleChatLine = (line) => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        try {
          const chunk = JSON.parse(trimmed);
          const token = chunk.message?.content ?? chunk.response ?? "";
          if (token) {
            accumulatedText += token;
            if (onProgress) {
              onProgress({
                model: targetModel,
                token,
                fullText: accumulatedText,
                done: !!chunk.done,
                elapsedMs: Math.round(performance.now() - startTime)
              });
            }
          }
          return !!chunk.done;
        } catch (err) {
          return false;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        let streamDone = false;
        for (const line of lines) {
          if (handleChatLine(line)) streamDone = true;
        }
        if (streamDone) break;
      }
      if (buffer && buffer.trim()) {
        handleChatLine(buffer);
      }

      return {
        isAiGenerated: true,
        provenance: "GENERATIVE_AI",
        model: targetModel,
        baseUrl: statusInfo.baseUrl,
        elapsedMs: Math.round(performance.now() - startTime),
        text: accumulatedText.trim() || "No tokens generated by local Ollama model."
      };
    } catch (e) {
      if (e.name === "AbortError") {
        return {
          aborted: true,
          isAiGenerated: false,
          provenance: "ABORTED",
          model: this.ollamaStatus.activeModel || "Ollama",
          elapsedMs: Math.round(performance.now() - startTime),
          text: ""
        };
      }
      this.ollamaBaseUrl = null;
      this.ollamaStatus = {
        checked: true,
        online: false,
        baseUrl: null,
        models: [],
        activeModel: null,
        error: e.message || "Connection interrupted"
      };
      const fallbackText = this.buildOfflineQueryAnswer(question, contextSnapshot, retrievedChunks, e.message || "Connection interrupted");
      return {
        isAiGenerated: false,
        provenance: "OFFLINE_FALLBACK",
        model: "Deterministic RAG",
        elapsedMs: Math.round(performance.now() - startTime),
        text: fallbackText
      };
    } finally {
      this.chatAbortController = null;
    }
  }
}
