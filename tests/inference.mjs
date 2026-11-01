/** Real, network-backed smoke test. No mocks and no lexical fallback. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { rankMemories, validateMemories } from '../dist/semantic.js';
import { SAMPLE_MEMORIES } from '../dist/data.js';

const model = 'Xenova/all-MiniLM-L6-v2';
const revision = '751bff37182d3f1213fa05d7196b954e230abad9';
const start = performance.now();
const attemptedAt = new Date().toISOString();
try {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = new URL('../.cache/', import.meta.url).pathname;
  env.allowLocalModels = false;
  const extractor = await pipeline('feature-extraction', model, { dtype: 'q8', revision, device: 'cpu' });
  const memories = validateMemories(SAMPLE_MEMORIES);
  const sourceTensor = await extractor(memories.map(memory => `${memory.title}. ${memory.text}`), { pooling: 'mean', normalize: true });
  const vectors = sourceTensor.tolist();
  assert.equal(vectors.length, memories.length);
  assert.equal(vectors[0].length, 384);
  const checks = [
    { query: 'music during a power cut', expectedTitle: 'Radio in the rain' },
    { query: 'how someone taught me to ride', expectedTitle: 'The blue bicycle' },
  ];
  const results = [];
  for (const check of checks) {
    const vector = await extractor(check.query, { pooling: 'mean', normalize: true });
    const ranked = rankMemories(Array.from(vector.data), memories, vectors);
    assert.equal(ranked[0].memory.title, check.expectedTitle, `Unexpected top result for ${check.query}`);
    assert.ok(Number.isFinite(ranked[0].score));
    results.push({ query: check.query, expectedTitle: check.expectedTitle, ranking: ranked.map(({ memory, score }) => ({ title: memory.title, score })) });
  }
  const report = { status: 'passed', verifiedAt: new Date().toISOString(), model, revision, dtype: 'q8', backend: 'onnxruntime-node CPU', dimensions: 384, elapsedMs: Math.round(performance.now() - start), archiveSize: memories.length, checks: results };
  await writeFile(new URL('./inference-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  const blocked = error.code === 'ERR_MODULE_NOT_FOUND' || /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(String(error));
  const report = { status: blocked ? 'blocked' : 'failed', attemptedAt, verifiedAt: null, model, revision, dtype: 'q8', elapsedMs: Math.round(performance.now() - start), reason: error.message, code: error.code ?? null, checks: [] };
  await writeFile(new URL('./inference-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
}
