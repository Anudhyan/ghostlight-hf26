/** Pure archive validation and cosine ranking; never substitutes lexical search. */
export const LIMITS = Object.freeze({ memories: 100, title: 100, text: 1000, id: 120 });

export function validateMemories(value) {
  if (!Array.isArray(value)) throw new Error('The archive must be a JSON array of memories.');
  if (value.length > LIMITS.memories) throw new Error(`An archive can contain up to ${LIMITS.memories} memories.`);
  const ids = new Set();
  return value.map((memory, index) => {
    if (!memory || typeof memory !== 'object' || Array.isArray(memory)) {
      throw new Error(`Memory ${index + 1} must be an object.`);
    }
    const entry = {};
    for (const field of ['id', 'title', 'text']) {
      if (typeof memory[field] !== 'string' || !memory[field].trim()) {
        throw new Error(`Memory ${index + 1} needs a nonempty ${field}.`);
      }
      if (memory[field].trim().length > LIMITS[field]) {
        throw new Error(`Memory ${index + 1}: ${field} must be at most ${LIMITS[field]} characters.`);
      }
      entry[field] = memory[field].trim();
    }
    if (ids.has(entry.id)) throw new Error(`Duplicate memory ID: ${entry.id}.`);
    ids.add(entry.id);
    if (memory.date !== undefined && typeof memory.date !== 'string') {
      throw new Error(`Memory ${index + 1}: date must be a string.`);
    }
    entry.date = (memory.date ?? '').trim();
    if (entry.date && (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) ||
        Number.isNaN(Date.parse(entry.date)) || new Date(entry.date).toISOString().slice(0, 10) !== entry.date)) {
      throw new Error(`Memory ${index + 1}: date must be a valid YYYY-MM-DD date or empty.`);
    }
    return entry;
  });
}

export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length || !a.length) throw new Error('Embedding dimensions must match.');
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) throw new Error('Embeddings must contain finite numbers.');
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return Math.max(-1, Math.min(1, dot / Math.sqrt(normA * normB)));
}

export function rankMemories(queryVector, memories, vectors) {
  if (!Array.isArray(memories) || memories.length !== vectors?.length) {
    throw new Error('Each memory needs one embedding.');
  }
  return memories.map((memory, index) => ({ memory, score: cosineSimilarity(queryVector, vectors[index]), index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ memory, score }) => ({ memory, score }));
}
