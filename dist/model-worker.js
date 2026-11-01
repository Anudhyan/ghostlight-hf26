import { rankMemories, validateMemories } from './semantic.js';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const MODEL_REVISION = '751bff37182d3f1213fa05d7196b954e230abad9';
const LIBRARY_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
let extractorPromise;
let activeRequest = null;
const embeddingCache = new Map();

function emit(id, type, fields = {}) { self.postMessage({ id, type, ...fields }); }

async function loadExtractor(id) {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      emit(id, 'progress', { message: 'Loading the open-source inference runtime…' });
      const { pipeline, env } = await import(LIBRARY_URL);
      env.allowLocalModels = false;
      // Single-thread WASM works without cross-origin isolation on ordinary static hosting.
      env.backends.onnx.wasm.numThreads = 1;
      env.backends.onnx.wasm.proxy = false;
      return pipeline('feature-extraction', MODEL_ID, {
        dtype: 'q8',
        revision: MODEL_REVISION,
        device: 'wasm',
        progress_callback(event) {
          const file = event.file?.split('/').at(-1) || 'model files';
          const progress = Number.isFinite(event.progress) ? event.progress : undefined;
          emit(id, 'progress', {
            message: event.status === 'progress' ? `Downloading ${file}…` :
              event.status === 'ready' ? 'The lantern is ready.' : `Preparing ${file}…`,
            ...(progress !== undefined ? { progress } : {}),
          });
        },
      });
    })();
    extractorPromise.catch(() => { extractorPromise = null; });
  }
  return extractorPromise;
}

self.onmessage = async ({ data }) => {
  const { id, type } = data ?? {};
  if (activeRequest !== null) {
    emit(id, 'error', { message: 'The lantern is busy. Wait for the current request to finish.' });
    return;
  }
  activeRequest = id;
  try {
    if (type !== 'load' && type !== 'search') throw new Error('Unsupported lantern request.');
    if (type === 'search') {
      if (typeof data.query !== 'string' || !data.query.trim() || data.query.trim().length > 500) {
        throw new Error('Enter a search phrase of 1–500 characters.');
      }
      validateMemories(data.memories);
      if (!data.memories.length) throw new Error('Add a memory before searching the archive.');
    }
    const extractor = await loadExtractor(id);
    if (type === 'load') { emit(id, 'loaded', { model: MODEL_ID }); return; }
    const start = performance.now();
    const memories = validateMemories(data.memories);
    // Evict removed or edited entries. Keys include the full source used for the embedding.
    const keys = memories.map(memory => JSON.stringify([memory.id, memory.title, memory.text]));
    const currentKeys = new Set(keys);
    for (const key of embeddingCache.keys()) if (!currentKeys.has(key)) embeddingCache.delete(key);
    const vectors = [];
    for (let index = 0; index < memories.length; index++) {
      const key = keys[index];
      let vector = embeddingCache.get(key);
      if (!vector) {
        emit(id, 'progress', { message: `Reading memory ${index + 1} of ${memories.length}…` });
        const memory = memories[index];
        const tensor = await extractor(`${memory.title}. ${memory.text}`, { pooling: 'mean', normalize: true });
        vector = Array.from(tensor.data);
        embeddingCache.set(key, vector);
      }
      vectors.push(vector);
    }
    emit(id, 'progress', { message: 'Following the thread of your question…' });
    const queryTensor = await extractor(data.query.trim(), { pooling: 'mean', normalize: true });
    const results = rankMemories(Array.from(queryTensor.data), memories, vectors).slice(0, 3);
    emit(id, 'results', { results, elapsedMs: Math.round(performance.now() - start), model: MODEL_ID });
  } catch (error) {
    emit(id, 'error', { message: error instanceof Error ? error.message : String(error) });
  } finally {
    activeRequest = null;
  }
};
