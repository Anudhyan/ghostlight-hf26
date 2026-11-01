# Ghostlight

**A lantern for lost stories.** Ghostlight is a browser-local memory archive that finds passages by meaning with an open-source embedding model. It returns the words you saved rather than generating a new memory or impersonating someone who has died.

Built as a new project for the [Hacktoberfest Open-Source AI Challenge: Week 4](https://dev.to/challenges/hacktoberfest-week4-2026-10-26), whose theme is *Ghost in the Machine*. The included memories are fictional demonstration material.

## Try it

[Open Ghostlight](https://ghostlight-memory-lantern-2026.coatedaspen1.chatgpt.site).

The demo is deployed for owner review and currently private. Enable public access before using it as a challenge demo, or provide a video walkthrough accessible to judges.

1. Load the local model. The first visit downloads roughly 23 MB of model weights plus the JavaScript/WASM runtime, so it needs an internet connection.
2. Search the fictional archive with a phrase such as `music during a power cut` or `how someone taught me to ride`.
3. Read the retrieved original passages. Similarity scores measure proximity in the model's embedding space; they are not confidence that a story is true.
4. Add your own short notes, then export a JSON copy when you want to keep them.

## Run locally

No application build or server-side AI service is needed. Use a current browser with WebAssembly support and serve the static directory over HTTP:

```sh
python -m http.server 8000 --directory dist
```

Open `http://localhost:8000`. Model and runtime downloads still require internet access on the first load. Do not open `index.html` directly with a `file:` URL because module workers require an HTTP(S) origin.

## How it works

- [Transformers.js 3.8.1](https://github.com/huggingface/transformers.js) runs the quantized [Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2) model in a browser Web Worker using WebAssembly.
- The app embeds each note and the search phrase, using mean pooling and normalization.
- Cosine similarity ranks the saved notes. The result shows each original passage and its title.
- A worker keeps model initialization and inference away from the main interface thread. Embeddings are reused while that worker is alive.
- There is no generative model, remote inference API, account system, or application analytics.

This is a small semantic retrieval tool, not a claim to recover missing history. A model can rank the wrong passage, particularly for vague queries or unfamiliar language. Original notes remain the source of truth.

## Data and privacy

Notes and search phrases are processed on the device. The app does not send them to an inference server. Hosting, CDN, and model providers still receive ordinary requests for page assets, runtime files, and model files.

Session-only mode is the default. Opting into persistence stores the archive in this browser's `localStorage`; it is not encrypted and is visible to other people who use the same browser profile. Use JSON export for a portable backup. Import accepts the app's JSON archive format. The forget control removes the app's saved archive, but cannot delete copies you already exported.

Browser caches may retain downloaded model assets. Ghostlight does not promise complete offline operation, and cache eviction can require another download. Clearing the archive does not necessarily clear model downloads from the browser cache.

## Development and verification

Install the development dependencies before running the test commands:

```sh
ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci
npm test
npm run test:inference
```

`npm test` passes the archive validation and vector-ranking checks. `npm run test:inference` exercises the actual downloaded model against fictional retrieval fixtures; it requires internet for the first model download. Real CPU inference passed both paraphrase fixtures on 31 October 2026: “music during a power cut” retrieved “Radio in the rain” (cosine 0.403), and “how someone taught me to ride” retrieved “The blue bicycle” (0.417). The run took 4.75 seconds including model initialization in this environment; this is not a browser performance benchmark. Full output is in `tests/inference-results.json`.

On 1 November 2026, a fresh manual browser check on the local preview loaded the actual WebAssembly model and retrieved the same two expected stories (displayed similarities 0.395 and 0.405). An unrelated query, `quantum processors on Mars`, produced the low-similarity notice with a top score of 0.057. These are a few illustrative checks, not an accuracy benchmark; the 0.25 notice threshold is a heuristic. Adding a fictional note, opt-in persistence across reload, valid JSON export, confirmed import, individual removal, and returning to session-only mode were also checked. The add control now supports preview origins where `crypto.randomUUID` is unavailable. See `tests/browser-results.json` for the scope and observations. Public access to the production demo remains a separate publication step.

The project is buildless. Main files:

```text
dist/
  index.html          Interface
  style.css           Responsive styles
  app.js              Archive controls and worker coordination
  data.js             Fictional example memories
  semantic.js         Validation and ranking functions
  model-worker.js     Model initialization and semantic retrieval
tests/                Logic and actual-inference checks
docs/
  dev-post.md         DEV submission draft
  demo-script.md      Suggested video walkthrough
  publish-checklist.md
.openai/hosting.json   Sites identity and static deployment configuration
```

## Credits and licenses

Application code is released under the [MIT license](LICENSE).

- [Sentence Transformers/all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2), with [Xenova's ONNX conversion](https://huggingface.co/Xenova/all-MiniLM-L6-v2): Apache 2.0. Model weights remain subject to their upstream license.
- [Hugging Face Transformers.js](https://github.com/huggingface/transformers.js): Apache 2.0.
- [ONNX Runtime](https://github.com/microsoft/onnxruntime): MIT.
- OpenAI Codex assisted with implementation, documentation, and validation preparation. This is disclosed in the submission draft.

## Challenge timing and later changes

The Week 4 submission deadline is **31 October 2026 at 11:59 PM PDT**, which is **1 November 2026 at 12:29 PM IST / 06:59 UTC**. The challenge requires a new project and repository created within its entry window. The DEV post must link the code repository and either a deployed demo accessible to judges or a video walkthrough.

Any commits made after the challenge deadline must be disclosed below with their date, commit, and purpose. Do not present post-deadline changes as part of the submitted version.

### Post-deadline change log

No post-deadline changes have been recorded. Update this section if later commits are made.
