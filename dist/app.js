import { SAMPLE_MEMORIES } from './data.js';
import { validateMemories } from './semantic.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'ghostlight.memories.v1';
let memories = structuredClone(SAMPLE_MEMORIES);
let worker;
let sequence = 0;
let loaded = false;
let busy = false;
let archiveRevision = 0;
const pending = new Map();

function toast(message) { $('toast').hidden = false; $('toast').textContent = message; }
function setBusy(value) {
  busy = value;
  $('search-button').disabled = value;
  $('load-model').disabled = value || loaded;
  $('search-form').setAttribute('aria-busy', String(value));
}
function loadStored() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      memories = validateMemories(JSON.parse(saved));
      $('remember-device').checked = true;
    }
  } catch { toast('Saved archive could not be opened. Fictional examples are shown.'); }
}
function persist() {
  try {
    if ($('remember-device').checked) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(memories));
      $('privacy-status').textContent = 'Saved in this browser. Anyone using this browser profile can read these memories.';
    } else {
      localStorage.removeItem(STORAGE_KEY);
      $('privacy-status').textContent = 'Session only. Export a copy before closing this tab.';
    }
  } catch {
    $('remember-device').checked = false;
    $('privacy-status').textContent = 'Browser storage is unavailable. Export a copy before closing this tab.';
  }
}
function element(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function memoryId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // getRandomValues also works on local preview origins where randomUUID is unavailable.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function memoryCard(memory, score) {
  const card = element('article', undefined, 'memory-card');
  const meta = element('div', undefined, 'memory-meta');
  meta.append(element('span', memory.date || 'Undated'));
  if (score !== undefined) meta.append(element('span', `Similarity ${score.toFixed(3)}`, 'score'));
  card.append(meta, element('h3', memory.title), element('p', memory.text));
  return card;
}
function clearResults(message = 'Search the archive to find a memory.') {
  $('results').replaceChildren();
  $('result-status').textContent = message;
}
function renderArchive() {
  archiveRevision += 1;
  const fragment = document.createDocumentFragment();
  for (const memory of memories) {
    const card = memoryCard(memory);
    const remove = element('button', 'Remove', 'text-button');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${memory.title}`);
    remove.addEventListener('click', () => {
      memories = memories.filter((entry) => entry.id !== memory.id);
      persist(); renderArchive(); clearResults(); toast('Memory removed.');
    });
    card.append(remove); fragment.append(card);
  }
  if (!memories.length) fragment.append(element('p', 'The archive is empty. Add a memory below or restore the fictional examples.', 'empty-state'));
  $('archive-list').replaceChildren(fragment);
  $('archive-count').textContent = `${memories.length} ${memories.length === 1 ? 'memory' : 'memories'}`;
}
function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./model-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      $('model-status').textContent = data.message;
      if (typeof data.progress === 'number') $('model-progress').value = data.progress;
      else $('model-progress').removeAttribute('value');
      return;
    }
    const task = pending.get(data.id);
    if (!task) return;
    pending.delete(data.id);
    if (data.type === 'error') task.reject(new Error(data.message));
    else task.resolve(data);
  };
  worker.onerror = () => {
    for (const task of pending.values()) task.reject(new Error('The local AI worker could not start. Check your connection and try again in a current browser.'));
    pending.clear(); worker.terminate(); worker = undefined; loaded = false;
  };
  return worker;
}
function request(type, payload = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    try { getWorker().postMessage({ id, type, ...payload }); }
    catch (error) { pending.delete(id); reject(error); }
  });
}
async function ensureModel() {
  if (loaded) return;
  $('model-status').textContent = 'Opening the lantern… downloading the model and runtime.';
  $('model-progress').hidden = false;
  await request('load');
  loaded = true;
  $('model-progress').value = 100;
  $('model-status').textContent = 'Lantern lit · AI is running on your device';
  $('load-model').textContent = 'Lantern is lit';
}
function showError(error) {
  $('model-status').textContent = `Could not finish: ${error.message}`;
  $('model-progress').hidden = true;
  toast('Your archive is still available. Please retry when the model can load.');
}
$('load-model').addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  try { await ensureModel(); } catch (error) { if (error.message !== 'Archive cleared.') showError(error); }
  finally { setBusy(false); }
});
$('search-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = $('query').value.trim();
  if (busy || !query) return;
  if (!memories.length) { clearResults('Add a memory before searching.'); return; }
  setBusy(true);
  $('result-status').textContent = 'Looking for a connection…';
  $('results').replaceChildren();
  const searchedRevision = archiveRevision;
  try {
    await ensureModel();
    const response = await request('search', { query: query.slice(0, 500), memories });
    $('model-status').textContent = 'Lantern lit · AI is running on your device';
    $('model-progress').value = 100;
    if (searchedRevision !== archiveRevision) { clearResults('The archive changed during search. Search again to use the current memories.'); return; }
    $('results').replaceChildren(...response.results.slice(0, 3).map(({ memory, score }) => memoryCard(memory, score)));
    const best = response.results[0]?.score ?? 0;
    $('result-status').textContent = `${best < 0.25 ? 'No close connection found. These are the nearest passages.' : 'The nearest memories, in their original words.'} Search took ${(response.elapsedMs / 1000).toFixed(2)}s. Similarity is a ranking, not factual confidence.`;
  } catch (error) {
    if (error.message !== 'Archive cleared.') { showError(error); clearResults('Search could not finish. Your memories remain in the archive.'); }
  }
  finally { setBusy(false); }
});
$('sample-queries').addEventListener('click', (event) => {
  const button = event.target.closest('[data-query]');
  if (!button) return;
  $('query').value = button.dataset.query;
  $('search-form').requestSubmit();
});
$('add-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    const entry = { id: memoryId(), title: $('title').value.trim(), text: $('memory-text').value.trim(), date: $('memory-date').value };
    const next = validateMemories([...memories, entry]);
    memories = next; persist(); renderArchive(); clearResults(); $('add-form').reset(); toast('Memory added to your archive.');
  } catch (error) { toast(error.message); }
});
$('remember-device').addEventListener('change', persist);
$('import-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 1_000_000) throw new Error('Choose an archive smaller than 1 MB.');
    const parsed = JSON.parse(await file.text());
    const imported = validateMemories(Array.isArray(parsed) ? parsed : parsed.memories);
    if (!window.confirm(`Replace the current archive with ${imported.length} imported memories? Export your current archive first if you need it.`)) return;
    memories = imported; persist(); renderArchive(); clearResults(); toast('Archive imported. Text stayed in this browser.');
  } catch (error) { toast(`Import failed: ${error.message}`); }
  finally { event.target.value = ''; }
});
$('export-archive').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ version: 1, memories }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = element('a'); link.href = url; link.download = 'ghostlight-memories.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Archive exported. Keep the downloaded file somewhere private.');
});
$('reset-demo').addEventListener('click', () => {
  if (!window.confirm('Replace your archive with the fictional examples? Export a copy first if you need it.')) return;
  memories = structuredClone(SAMPLE_MEMORIES); persist(); renderArchive(); clearResults(); toast('Fictional examples restored.');
});
$('forget-all').addEventListener('click', () => {
  if (!window.confirm('Remove every memory from this tab and its browser storage? Downloaded exports and browser model files are not removed.')) return;
  memories = []; $('remember-device').checked = false;
  $('query').value = '';
  $('add-form').reset();
  if (worker) {
    worker.terminate(); worker = undefined; loaded = false;
    for (const task of pending.values()) task.reject(new Error('Archive cleared.'));
    pending.clear(); setBusy(false);
  }
  $('load-model').textContent = 'Light the lantern';
  $('load-model').disabled = false;
  $('model-status').textContent = 'Model not loaded. Your archive is empty.';
  $('model-progress').hidden = true;
  persist(); renderArchive(); clearResults(); toast('Memories removed from this tab and browser storage.');
});
loadStored(); persist(); renderArchive();
