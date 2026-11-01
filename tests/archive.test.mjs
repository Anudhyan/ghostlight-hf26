import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMemories, rankMemories, cosineSimilarity } from '../dist/semantic.js';
import { SAMPLE_MEMORIES } from '../dist/data.js';

test('bundled fictional archive survives an export/import round trip', () => {
  assert.deepEqual(validateMemories(JSON.parse(JSON.stringify(SAMPLE_MEMORIES))), SAMPLE_MEMORIES);
});

test('imports reject duplicate identifiers, invalid dates, and oversized archives', () => {
  const entry = SAMPLE_MEMORIES[0];
  assert.throws(() => validateMemories([entry, entry]), /Duplicate/);
  assert.throws(() => validateMemories([{ ...entry, date: '2026-02-31' }]), /valid/);
  assert.throws(() => validateMemories(Array.from({ length: 101 }, (_, i) => ({ ...entry, id: String(i) }))), /up to 100/);
  assert.throws(() => validateMemories([{ ...entry, text: 'x'.repeat(1001) }]), /1000/);
  assert.throws(() => validateMemories(null), /JSON array/);
});

test('import sanitizes extra fields without turning markup into code', () => {
  const text = '<img src=x onerror=alert(1)>';
  const [memory] = validateMemories([{ ...SAMPLE_MEMORIES[0], text, unknown: 'discard' }]);
  assert.equal(memory.text, text);
  assert.equal(Object.hasOwn(memory, 'unknown'), false);
});

test('ranking compares meaning vectors independent of vector magnitude', () => {
  const ranked = rankMemories([1, 0], SAMPLE_MEMORIES.slice(0, 3), [[0, 10], [100, 0], [-1, 0]]);
  assert.deepEqual(ranked.map(r => r.memory.id), ['bicycle', 'radio', 'recipe']);
  assert.equal(ranked[0].score, 1);
  assert.equal(ranked[2].score, -1);
});

test('zero vectors and invalid embeddings cannot fabricate high similarity', () => {
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
  assert.throws(() => cosineSimilarity([1], [1, 2]), /dimensions/);
  assert.throws(() => cosineSimilarity([NaN], [1]), /finite/);
  assert.throws(() => rankMemories([1, 0], SAMPLE_MEMORIES, []), /one embedding/);
});
