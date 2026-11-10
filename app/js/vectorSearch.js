/**
 * Hybrid Vector Search Engine (In-Browser)
 * Combines 384-dimensional cosine similarity with deterministic clinical trigger tag overlap.
 */

export class LocalVectorIndex {
  constructor() {
    this.chunks = [];
    this.dimensions = 384;
    this.isLoaded = false;
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
      console.log(`[VectorSearch] Successfully loaded ${this.chunks.length} chunks with ${this.dimensions}d vectors.`);
      return true;
    } catch (err) {
      console.error("[VectorSearch] Error loading vector index:", err);
      return false;
    }
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
