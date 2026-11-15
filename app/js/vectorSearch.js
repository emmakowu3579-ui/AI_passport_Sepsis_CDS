/**
 * Hybrid Vector & Lexical Clinical Search Engine (In-Browser)
 * Combines 384-dimensional cosine similarity, BM25-style lexical query matching,
 * and deterministic clinical trigger tag overlap.
 */

const CLINICAL_STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "what", "when", "where",
  "which", "why", "how", "should", "would", "could", "are", "was", "were",
  "have", "has", "had", "not", "but", "can", "into", "about", "there", "their",
  "they", "them", "then", "than", "also", "very", "just", "please", "tell",
  "explain", "give", "patient", "current", "hour", "hours", "now"
]);

const CLINICAL_QUERY_EXPANSIONS = {
  pressor: ["norepinephrine", "vasopressin", "vasopressor", "map"],
  pressors: ["norepinephrine", "vasopressin", "vasopressor", "map"],
  vasopressor: ["norepinephrine", "vasopressin", "map", "shock"],
  levophed: ["norepinephrine", "vasopressor", "map"],
  fluid: ["crystalloid", "resuscitation", "lactate", "bolus"],
  fluids: ["crystalloid", "resuscitation", "lactate", "bolus"],
  bolus: ["crystalloid", "fluid", "resuscitation"],
  antibiotic: ["antimicrobial", "cefepime", "piperacillin", "vancomycin", "meropenem"],
  antibiotics: ["antimicrobial", "cefepime", "piperacillin", "vancomycin", "meropenem"],
  abx: ["antimicrobial", "cefepime", "piperacillin", "vancomycin", "meropenem"],
  kidney: ["renal", "creatinine", "aki", "nephrotoxic"],
  renal: ["creatinine", "aki", "clearance", "cefepime", "vancomycin"],
  aki: ["renal", "creatinine", "nephrotoxic", "zosyn", "vancomycin"],
  neurotoxicity: ["cefepime", "encephalopathy", "myoclonus", "renal"],
  encephalopathy: ["cefepime", "neurotoxicity", "renal"],
  steroid: ["hydrocortisone", "corticosteroid", "refractory", "shock"],
  steroids: ["hydrocortisone", "corticosteroid", "refractory", "shock"],
  risk: ["forecast", "early", "warning", "sofa", "lactate"],
  forecast: ["risk", "early", "warning", "sofa", "lactate"]
};

export function tokenizeClinicalQuery(text = "") {
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token.length >= 2 && !CLINICAL_STOPWORDS.has(token));
}

export class LocalVectorIndex {
  constructor() {
    this.chunks = [];
    this.dimensions = 384;
    this.isLoaded = false;
    this._lexicalStats = null;
  }

  async load(url = "data/knowledge_index.json") {
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`Failed to load knowledge index: ${resp.status} ${resp.statusText}`);
      }
      const data = await resp.json();
      this.chunks = data.chunks || [];
      this.dimensions = data.dimensions || 384;
      this.isLoaded = true;
      this._lexicalStats = null;
      this._ensureLexicalStats();
      console.log(`[VectorSearch] Successfully loaded ${this.chunks.length} chunks with ${this.dimensions}d vectors.`);
      return true;
    } catch (err) {
      console.error("[VectorSearch] Error loading vector index:", err);
      return false;
    }
  }

  _buildTermFreq(tokens) {
    const tf = new Map();
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      tf.set(t, (tf.get(t) || 0) + 1);
    }
    return tf;
  }

  _ensureLexicalStats() {
    if (this._lexicalStats && this._lexicalStats.chunkCount === this.chunks.length) {
      return this._lexicalStats;
    }

    const docFreq = new Map();
    const docs = [];
    let totalBodyLen = 0;

    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];
      const titleTokens = tokenizeClinicalQuery(`${chunk.id || ""} ${chunk.title || ""} ${chunk.source || ""}`);
      const triggerTokens = tokenizeClinicalQuery((chunk.clinical_triggers || []).join(" "));
      const bodyTokens = tokenizeClinicalQuery(chunk.text || "");

      const titleTf = this._buildTermFreq(titleTokens);
      const triggerTf = this._buildTermFreq(triggerTokens);
      const bodyTf = this._buildTermFreq(bodyTokens);
      const uniqueTerms = new Set([...titleTf.keys(), ...triggerTf.keys(), ...bodyTf.keys()]);

      uniqueTerms.forEach(term => {
        docFreq.set(term, (docFreq.get(term) || 0) + 1);
      });

      const bodyLen = Math.max(1, bodyTokens.length);
      totalBodyLen += bodyLen;
      docs.push({
        titleTf,
        triggerTf,
        bodyTf,
        bodyLen,
        lowerHaystack: `${chunk.id || ""} ${chunk.title || ""} ${chunk.text || ""}`.toLowerCase()
      });
    }

    this._lexicalStats = {
      chunkCount: this.chunks.length,
      avgBodyLen: this.chunks.length > 0 ? totalBodyLen / this.chunks.length : 1,
      docFreq,
      docs
    };
    return this._lexicalStats;
  }

  cosineSimilarity(vecA, vecB) {
    let dot = 0;
    const len = vecA.length;
    for (let i = 0; i < len; i++) {
      dot += vecA[i] * vecB[i];
    }
    return dot;
  }

  /**
   * Hybrid Search:
   * Score = (alpha * CosineSimilarity) + ((1 - alpha) * TagOverlapScore)
   */
  search(queryVector, activeTriggers = [], topK = 5, alpha = 0.65) {
    if (!this.isLoaded || this.chunks.length === 0) {
      return [];
    }

    const activeSet = new Set(activeTriggers);
    const scoredChunks = [];

    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];
      let cosSim = 0;
      if (queryVector && queryVector.length === this.dimensions) {
        cosSim = this.cosineSimilarity(queryVector, chunk.embedding);
      }

      // Tag overlap score
      let matchCount = 0;
      const cTriggers = chunk.clinical_triggers || [];
      for (let t = 0; t < cTriggers.length; t++) {
        if (activeSet.has(cTriggers[t])) {
          matchCount++;
        }
      }

      // Normalize tag score between 0 and 1
      const tagScore = activeSet.size > 0 ? (matchCount / Math.max(1, Math.min(activeSet.size, 5))) : 0;
      
      // Calculate hybrid score
      const hybridScore = (alpha * cosSim) + ((1 - alpha) * tagScore);

      scoredChunks.push({
        ...chunk,
        cosineSimilarity: cosSim,
        tagMatchCount: matchCount,
        hybridScore
      });
    }

    // Sort descending by hybrid score
    scoredChunks.sort((a, b) => b.hybridScore - a.hybridScore);
    return scoredChunks.slice(0, topK);
  }

  /**
   * Lexical BM25-style query scoring + clinical trigger fusion for real-time Copilot queries.
   * Works 100% client-side in <2 ms without requiring a browser embedding model.
   */
  searchByQueryAndTriggers(queryText = "", activeTriggers = [], topK = 5) {
    if (!this.isLoaded || this.chunks.length === 0) {
      return [];
    }

    const stats = this._ensureLexicalStats();
    const rawTokens = tokenizeClinicalQuery(queryText);
    if (rawTokens.length === 0) {
      return this.searchByTriggers(activeTriggers, topK).map(chunk => ({
        ...chunk,
        lexicalScore: 0,
        tagMatchCount: chunk.matchCount || 0,
        tagScore: chunk.score || 0,
        hybridScore: chunk.score || 0,
        matchedTerms: []
      }));
    }

    // Build weighted query term map (exact query tokens = 1.0, expanded clinical aliases = 0.45)
    const queryTermWeights = new Map();
    for (let i = 0; i < rawTokens.length; i++) {
      const tok = rawTokens[i];
      queryTermWeights.set(tok, 1.0);
      const aliases = CLINICAL_QUERY_EXPANSIONS[tok];
      if (aliases) {
        for (let j = 0; j < aliases.length; j++) {
          const alias = aliases[j];
          if (!queryTermWeights.has(alias)) {
            queryTermWeights.set(alias, 0.45);
          }
        }
      }
    }

    const activeSet = new Set(activeTriggers);
    const trimmedPhrase = String(queryText || "").trim().toLowerCase();
    const nDocs = Math.max(1, stats.chunkCount);
    const k1 = 1.2;
    const b = 0.6;
    const scored = [];

    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];
      const doc = stats.docs[i];
      let bm25Raw = 0;
      const matchedTerms = [];

      queryTermWeights.forEach((termWeight, term) => {
        const titleHits = doc.titleTf.get(term) || 0;
        const triggerHits = doc.triggerTf.get(term) || 0;
        const bodyHits = doc.bodyTf.get(term) || 0;
        const weightedTf = (titleHits * 2.6) + (triggerHits * 2.0) + bodyHits;
        if (weightedTf <= 0) return;

        const df = stats.docFreq.get(term) || 0;
        const idf = Math.log(1 + ((nDocs - df + 0.5) / (df + 0.5)));
        const norm = weightedTf + k1 * (1 - b + (b * doc.bodyLen) / Math.max(1, stats.avgBodyLen));
        const bm25Term = idf * ((weightedTf * (k1 + 1)) / Math.max(0.0001, norm));
        bm25Raw += termWeight * bm25Term;
        if (termWeight >= 0.99) {
          matchedTerms.push(term);
        }
      });

      if (trimmedPhrase.length >= 4 && doc.lowerHaystack.includes(trimmedPhrase)) {
        bm25Raw += 0.85;
      }

      const lexicalScore = bm25Raw > 0 ? Math.min(1, bm25Raw / (bm25Raw + 2.6)) : 0;

      let matchCount = 0;
      const cTriggers = chunk.clinical_triggers || [];
      for (let t = 0; t < cTriggers.length; t++) {
        if (activeSet.has(cTriggers[t])) {
          matchCount++;
        }
      }
      const tagScore = activeSet.size > 0 ? (matchCount / Math.max(1, Math.min(activeSet.size, 5))) : 0;
      const hybridScore = (0.74 * lexicalScore) + (0.26 * tagScore);

      scored.push({
        ...chunk,
        lexicalScore,
        tagMatchCount: matchCount,
        tagScore,
        hybridScore,
        matchedTerms
      });
    }

    scored.sort((a, b) =>
      b.hybridScore - a.hybridScore ||
      b.lexicalScore - a.lexicalScore ||
      b.tagMatchCount - a.tagMatchCount
    );
    return scored.slice(0, topK);
  }

  /**
   * Search by active clinical triggers (pure tag overlap + category priority)
   */
  searchByTriggers(activeTriggers = [], topK = 5) {
    if (!this.isLoaded || this.chunks.length === 0) {
      return [];
    }

    const activeSet = new Set(activeTriggers);
    const scored = this.chunks.map(chunk => {
      let matchCount = 0;
      const cTriggers = chunk.clinical_triggers || [];
      for (let t = 0; t < cTriggers.length; t++) {
        if (activeSet.has(cTriggers[t])) {
          matchCount++;
        }
      }
      return {
        ...chunk,
        matchCount,
        score: matchCount / Math.max(1, cTriggers.length)
      };
    });

    scored.sort((a, b) => b.matchCount - a.matchCount || b.score - a.score);
    return scored.slice(0, topK);
  }

  getChunkById(chunkId) {
    return this.chunks.find(c => c.id === chunkId) || null;
  }
}
