/**
 * First-Time User Onboarding & Interactive Clinical Step-by-Step Tour Guide
 * Guides first-time clinicians, supervisors, and evaluators through the system.
 * Highlights target UI elements with an accessible spotlight overlay.
 */

const TOUR_COMPLETED_KEY = "sepsis_cds_tour_completed";

export const TOUR_STEPS = [
  {
    targetId: "patientSelect",
    pageStep: 1,
    title: "1. Select ICU Patient & Clinical Archetype",
    badge: "Step 1 of 8 • Page 1",
    content: "Start here: Select from <strong>25 curated PhysioNet ICU patients</strong> across 4 clinical archetypes (<em>Septic Shock</em>, <em>Pre-Sepsis Transition</em>, <em>Acute Kidney Injury</em>, and <em>Non-Sepsis SIRS Controls</em>), or inspect <strong>24 clinical partner ICU windows</strong> enriched with full-cohort Z-scores and bedside progress notes.",
    position: "bottom"
  },
  {
    targetId: "patientControlBar",
    subSelector: ".timeline-scrubber-box",
    pageStep: 1,
    title: "2. Hourly ICULOS Timeline Scrubber",
    badge: "Step 2 of 8 • Page 1",
    content: "Scrub hour-by-hour through the patient's entire admission or press <strong><i class='bi bi-play-fill'></i> Play</strong> to observe vitals, lab trends, early warning risk forecasts, and sepsis progression unfold simultaneously inside the docked screen—and unlock <strong>Page 2</strong> in the top bar.",
    position: "bottom"
  },
  {
    targetId: "step1Card",
    pageStep: 1,
    title: "3. Page 1: Bedside Vitals & Dual-Unit Normalized Labs",
    badge: "Step 3 of 8 • Page 1",
    content: "On <strong>Page 1</strong>, review full-screen vitals and critical labs without scrolling. Notice automated dual-unit normalization (<strong>Lactate in both mmol/L and mg/dL</strong>), cohort-scaler Z-score de-standardization for partner windows, and <strong>Last-Observation-Carried-Forward (LOCF)</strong> stale lab tags for draws older than 6 hours.",
    position: "bottom"
  },
  {
    targetId: "sofaTotalVal",
    parentTargetId: "step1Card",
    subSelector: ".sofa-scorecard-strip",
    pageStep: 1,
    title: "4. Page 1: Deterministic Sepsis-3 SOFA Scorecard",
    badge: "Step 4 of 8 • Page 1",
    content: "Calculated deterministically without LLM arithmetic to guarantee zero hallucinations. Organ failure is highlighted in red whenever a sub-score reaches <strong>&ge; 2 points</strong> across Respiration, Coagulation, Liver, Cardiovascular, or Renal systems.",
    position: "bottom"
  },
  {
    targetId: "predictiveRiskCard",
    pageStep: 1,
    title: "5. Page 1: Tier 1 Predictive 6-Hour Sepsis Forecast",
    badge: "Step 5 of 8 • Page 1",
    content: "Runs a causal <strong>5-Fold PLE-ResNet</strong> neural network across 79 temporal features to forecast sepsis risk <strong>up to 6 hours before Sepsis-3 onset</strong>. Displays Two-Tier alert states (<strong>Watch &ge; 2.9%</strong> early surveillance and <strong>Crit &ge; 7%</strong> with <strong>2-of-3h sustained</strong> alarm confirmation) alongside the <strong>Top Risk Drivers</strong> pushing the prediction.",
    position: "bottom"
  },
  {
    targetId: "trajectoryCard",
    subSelector: "#hemodynamicTrajectorySvg",
    pageStep: 2,
    title: "6. Page 2: Longitudinal Trajectory Explorer & Live Strip",
    badge: "Step 6 of 8 • Page 2",
    content: "Now on dedicated <strong>Page 2</strong>: view continuous <strong>MAP</strong> (65 mmHg target line), <strong>Serum Lactate</strong>, and <strong>SOFA Organ Progression</strong> side-by-side or individually, with a pinned <strong>Live Summary Strip</strong> above the plots. <em>Click any hour on a curve to scrub and unlock Page 3!</em>",
    position: "bottom"
  },
  {
    targetId: "step2Card",
    pageStep: 3,
    title: "7. Page 3: 'What-If' Resuscitation & 5-Drug Safety Gates",
    badge: "Step 7 of 8 • Page 3",
    content: "On dedicated <strong>Page 3</strong>, simulate crystalloid boluses (0–40 mL/kg), norepinephrine titration, and 5 empiric antibiotics on the left while watching the Perfusion Gauge and scrollable <strong>Organ Safety Gates</strong> update side-by-side on the right. Every change unlocks <strong>Page 4</strong>.",
    position: "bottom"
  },
  {
    targetId: "step3Card",
    pageStep: 4,
    title: "8. Page 4: RAG Plan, Engine Provenance & Clinical AI Copilot",
    badge: "Step 8 of 8 • Page 4",
    content: "On <strong>Page 4</strong>, compare deterministic guideline rules vs. violet Ollama hybrid synthesis via the provenance banner, inspect any <strong>[CHUNK-ID] citation pill</strong> on the right, or switch to the <strong>Ask Clinical AI</strong> tab to query guidelines in real time.",
    position: "bottom"
  }
];

export class TourGuide {
  constructor() {
    this.currentStepIndex = 0;
    this.isActive = false;
    this.overlayElement = null;
    this.cardElement = null;
    this.initDOM();
  }

  initDOM() {
    if (typeof document === "undefined") return;

    // Dark backdrop overlay with spotlight cutout
    let overlay = document.getElementById("tourOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "tourOverlay";
      overlay.className = "tour-overlay";
      document.body.appendChild(overlay);
    }
    this.overlayElement = overlay;

    // Popover guidance card
    let card = document.getElementById("tourCard");
    if (!card) {
      card = document.createElement("div");
      card.id = "tourCard";
      card.className = "tour-card";
      document.body.appendChild(card);
    }
    this.cardElement = card;
    this.bindWindowListeners();
  }

  bindWindowListeners() {
    if (typeof window === "undefined") return;
    this._repositionHandler = () => {
      if (this.isActive && this.cardElement && this.cardElement.style.display !== "none") {
        const step = TOUR_STEPS[this.currentStepIndex];
        if (step) {
          let targetEl = document.getElementById(step.targetId);
          if (step.subSelector && targetEl) {
            const sub = targetEl.querySelector(step.subSelector);
            if (sub) targetEl = sub;
          } else if (step.subSelector && !targetEl) {
            targetEl = document.querySelector(step.subSelector);
          }
          this.positionCard(targetEl, step.position);
        }
      }
    };
    window.addEventListener("resize", this._repositionHandler, { passive: true });
    window.addEventListener("orientationchange", this._repositionHandler, { passive: true });
  }

  hasCompletedTour() {
    try {
      return localStorage.getItem(TOUR_COMPLETED_KEY) === "true";
    } catch (e) {
      return false;
    }
  }

  markTourCompleted() {
    try {
      localStorage.setItem(TOUR_COMPLETED_KEY, "true");
    } catch (e) {}
  }

  resetTourStatus() {
    try {
      localStorage.removeItem(TOUR_COMPLETED_KEY);
    } catch (e) {}
  }

  start(step = 0) {
    this.currentStepIndex = step;
    this.isActive = true;
    this.overlayElement.style.display = "block";
    this.cardElement.style.display = "flex";
    this.showStep(this.currentStepIndex);
  }

  showStep(index) {
    if (index < 0 || index >= TOUR_STEPS.length) {
      this.finish();
      return;
    }

    this.currentStepIndex = index;
    const step = TOUR_STEPS[index];

    if (step.pageStep && typeof window !== "undefined" && window.navigateToStepPage) {
      window.navigateToStepPage(step.pageStep, false);
    }

    let targetEl = document.getElementById(step.targetId);
    if (step.subSelector && targetEl) {
      const sub = targetEl.querySelector(step.subSelector);
      if (sub) targetEl = sub;
    } else if (step.subSelector && !targetEl) {
      targetEl = document.querySelector(step.subSelector);
    }

    // Scroll target into view cleanly if outside viewport (no-op inside zero-scroll desktop shell)
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      this.highlightElement(targetEl);
    }

    // Render Guidance Card HTML
    const isFirst = index === 0;
    const isLast = index === TOUR_STEPS.length - 1;
    const progressPct = Math.round(((index + 1) / TOUR_STEPS.length) * 100);

    this.cardElement.innerHTML = `
      <div class="tour-card-header">
        <span class="tour-badge">${step.badge}</span>
        <button class="tour-close-btn" onclick="window.tourGuideInstance.finish()" title="Exit Tour">&times;</button>
      </div>
      <div class="tour-progress-bar-track">
        <div class="tour-progress-bar-fill" style="width: ${progressPct}%;"></div>
      </div>
      <h3 class="tour-card-title">${step.title}</h3>
      <div class="tour-card-body">${step.content}</div>
      <div class="tour-card-footer">
        <button class="tour-btn tour-btn-secondary" onclick="window.tourGuideInstance.finish()">
          Skip Tour
        </button>
        <div style="display:flex; gap:8px;">
          ${!isFirst ? `<button class="tour-btn tour-btn-secondary" onclick="window.tourGuideInstance.prev()"><i class="bi bi-arrow-left" style="margin-right:4px;"></i>Back</button>` : ''}
          <button class="tour-btn tour-btn-primary" onclick="window.tourGuideInstance.next()">
            ${isLast ? 'Finish &amp; Explore <i class="bi bi-check2-circle" style="margin-left:4px;"></i>' : 'Next Step <i class="bi bi-arrow-right" style="margin-left:4px;"></i>'}
          </button>
        </div>
      </div>
    `;

    // Position Card near target
    this.positionCard(targetEl, step.position);
  }

  highlightElement(el) {
    // Remove previous highlights
    document.querySelectorAll(".tour-highlighted-element").forEach(e => {
      e.classList.remove("tour-highlighted-element");
    });

    if (el) {
      el.classList.add("tour-highlighted-element");
    }
  }

  positionCard(targetEl, preferredPos = "bottom") {
    if (!this.cardElement) return;

    // Use a short delay to ensure target geometry and DOM layout have completed
    setTimeout(() => {
      const vpWidth = window.visualViewport ? window.visualViewport.width : (document.documentElement.clientWidth || window.innerWidth);
      const vpHeight = window.visualViewport ? window.visualViewport.height : (document.documentElement.clientHeight || window.innerHeight);
      const pad = 16;

      // Adaptive card width strictly capped at available viewport width minus margins
      const cardWidth = Math.min(380, vpWidth - (pad * 2));
      this.cardElement.style.width = `${cardWidth}px`;
      this.cardElement.style.maxWidth = `calc(100vw - ${pad * 2}px)`;

      // If no valid target, safely center card in visible viewport
      if (!targetEl) {
        this.cardElement.style.top = `${Math.round(Math.max(pad, (vpHeight - 240) / 2))}px`;
        this.cardElement.style.left = `${Math.round(Math.max(pad, (vpWidth - cardWidth) / 2))}px`;
        this.cardElement.style.right = "auto";
        return;
      }

      const rect = targetEl.getBoundingClientRect();
      const cardHeight = this.cardElement.offsetHeight || 220;

      let top = 100;
      let idealLeft = rect.left + (rect.width - cardWidth) / 2;

      // Positioning logic with smart vertical flipping
      if (preferredPos === "bottom") {
        top = rect.bottom + pad;
        if (top + cardHeight > vpHeight - pad) {
          if (rect.top - cardHeight - pad >= pad) {
            top = rect.top - cardHeight - pad;
          } else {
            top = Math.max(pad, vpHeight - cardHeight - pad);
          }
        }
      } else if (preferredPos === "top") {
        top = rect.top - cardHeight - pad;
        if (top < pad) {
          if (rect.bottom + pad + cardHeight <= vpHeight - pad) {
            top = rect.bottom + pad;
          } else {
            top = pad;
          }
        }
      } else if (preferredPos === "left") {
        top = Math.max(pad, rect.top);
        idealLeft = rect.left - cardWidth - pad;
        if (idealLeft < pad) {
          idealLeft = rect.left;
          top = rect.bottom + pad;
        }
      }

      // Hard viewport boundary clamping guarantees: Card NEVER overflows screen
      const left = Math.max(pad, Math.min(vpWidth - cardWidth - pad, idealLeft));
      top = Math.max(pad, Math.min(vpHeight - cardHeight - pad, top));

      this.cardElement.style.top = `${Math.round(top)}px`;
      this.cardElement.style.left = `${Math.round(left)}px`;
      this.cardElement.style.right = "auto";
    }, 100);
  }

  next() {
    this.showStep(this.currentStepIndex + 1);
  }

  prev() {
    this.showStep(this.currentStepIndex - 1);
  }

  finish() {
    this.isActive = false;
    this.markTourCompleted();
    this.overlayElement.style.display = "none";
    this.cardElement.style.display = "none";
    document.querySelectorAll(".tour-highlighted-element").forEach(e => {
      e.classList.remove("tour-highlighted-element");
    });
  }
}
