/**
 * First-Time User Onboarding & Interactive Clinical Step-by-Step Tour Guide
 * Guides first-time clinicians, supervisors, and evaluators through the system.
 * Highlights target UI elements with an accessible spotlight overlay.
 */

const TOUR_COMPLETED_KEY = "sepsis_cds_tour_completed";

export const TOUR_STEPS = [
  {
    targetId: "patientControlBar",
    title: "1. Select ICU Patient & Clinical Archetype",
    badge: "Step 1 of 7",
    content: "Start here: Select any of the <strong>25 curated PhysioNet ICU patients</strong> representing 4 clinical archetypes (<em>Septic Shock</em>, <em>Pre-Sepsis Transition</em>, <em>Acute Kidney Injury</em>, and <em>Non-Sepsis SIRS Controls</em>).",
    position: "bottom"
  },
  {
    targetId: "patientControlBar",
    subSelector: ".timeline-scrubber-box",
    title: "2. Hourly ICULOS Timeline Scrubber",
    badge: "Step 2 of 7",
    content: "Scrub hour-by-hour through the patient's entire admission or press <strong>▶ Play</strong> to observe vitals, lab trends, and sepsis progression unfold dynamically.",
    position: "bottom"
  },
  {
    targetId: "step1Card",
    title: "3. Bedside Vitals & Dual-Unit Normalized Labs",
    badge: "Step 3 of 7",
    content: "Review real-time vitals and critical labs. Notice automated dual-unit normalization (<strong>Lactate in both mmol/L and mg/dL</strong>) and <strong>Last-Observation-Carried-Forward (LOCF)</strong> stale lab tags for draws older than 6 hours.",
    position: "bottom"
  },
  {
    targetId: "sofaTotalVal",
    parentTargetId: "step1Card",
    subSelector: ".sofa-scorecard-strip",
    title: "4. Deterministic Sepsis-3 SOFA Scorecard",
    badge: "Step 4 of 7",
    content: "Calculated in <strong>&lt; 2 ms</strong> without LLM arithmetic. Organ failure is highlighted in red whenever a sub-score reaches <strong>&ge; 2 points</strong> across Respiration, Coagulation, Liver, Cardiovascular, or Renal systems.",
    position: "bottom"
  },
  {
    targetId: "hemodynamicTrajectorySvg",
    title: "5. Longitudinal Trajectory & Target Plots",
    badge: "Step 5 of 7",
    content: "Continuous hemodynamic curves displaying <strong>Mean Arterial Pressure (MAP)</strong> with the <strong>65 mmHg target goal line</strong>, shaded red <strong>Hypoperfusion Danger Zone</strong>, Serum Lactate curve, and <strong>🚨 Sepsis-3 Onset</strong> marker. <em>Click anywhere on the curve to scrub to that hour!</em>",
    position: "top"
  },
  {
    targetId: "step2Card",
    title: "6. 'What-If' Resuscitation & 5-Drug Safety Gates",
    badge: "Step 6 of 7",
    content: "Simulate balanced crystalloid boluses (0–40 mL/kg), norepinephrine titration, and select from 5 empiric antimicrobials. The safety engine immediately alerts to <strong>nephrotoxic synergy (Vanc + Pip-Tazo)</strong>, <strong>neurotoxicity (Cefepime)</strong>, and <strong>AKI blocks (Gentamicin)</strong>.",
    position: "top"
  },
  {
    targetId: "step3Card",
    title: "7. Evidence-Based RAG Note & Verifiable Citations",
    badge: "Step 7 of 7",
    content: "Inspect the synthesized SBAR consultation note and structured 5-drug dosing table. <strong>Click any [SSC-2021-...] or [DOSE-...] citation pill</strong> to view verbatim guideline text and evidence grades, then click <strong>Copy Note to EHR</strong> to export to hospital charts.",
    position: "left"
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

    let targetEl = document.getElementById(step.targetId);
    if (step.subSelector && targetEl) {
      const sub = targetEl.querySelector(step.subSelector);
      if (sub) targetEl = sub;
    } else if (step.subSelector && !targetEl) {
      targetEl = document.querySelector(step.subSelector);
    }

    // Scroll smoothly to target element
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
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
          ${!isFirst ? `<button class="tour-btn tour-btn-secondary" onclick="window.tourGuideInstance.prev()">◀ Back</button>` : ''}
          <button class="tour-btn tour-btn-primary" onclick="window.tourGuideInstance.next()">
            ${isLast ? 'Finish & Explore ➔' : 'Next Step ➔'}
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
    if (!targetEl || !this.cardElement) return;

    setTimeout(() => {
      const rect = targetEl.getBoundingClientRect();
      const cardRect = this.cardElement.getBoundingClientRect();
      const pad = 16;

      let top = 100;
      let left = (window.innerWidth - cardRect.width) / 2;

      if (preferredPos === "bottom") {
        top = rect.bottom + pad;
        left = Math.max(pad, Math.min(window.innerWidth - cardRect.width - pad, rect.left + (rect.width - cardRect.width) / 2));
      } else if (preferredPos === "top") {
        top = Math.max(pad, rect.top - cardRect.height - pad);
        left = Math.max(pad, Math.min(window.innerWidth - cardRect.width - pad, rect.left + (rect.width - cardRect.width) / 2));
      } else if (preferredPos === "left") {
        top = Math.max(pad, rect.top);
        left = Math.max(pad, rect.left - cardRect.width - pad);
      }

      // Keep inside viewport vertically
      if (top + cardRect.height > window.innerHeight) {
        top = Math.max(pad, window.innerHeight - cardRect.height - pad);
      }

      this.cardElement.style.top = `${Math.round(top)}px`;
      this.cardElement.style.left = `${Math.round(left)}px`;
    }, 150);
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
