# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Concurrent renderer (vite :5173) + electron (compiles main first, waits on vite)
npm run build            # build:renderer (vite) + build:main (tsc -p tsconfig.main.json)
npm run build:main       # Main-process TS compile only — required before `electron .` picks up main/preload changes
npm run lint             # ESLint over .ts/.tsx
npm run format           # Prettier on src/**/*.{ts,tsx,json,css}

npm test                 # Vitest (jsdom) — unit/UI tests under src/tests
npm run test:watch
npm run test:coverage
npx vitest run path/to/file.test.ts     # Single file
npx vitest run -t "test name"            # Single test by name

npm run test:e2e         # Playwright; webServer auto-starts dev:renderer on :5173

npm run dist:mac         # Universal DMG, unsigned (identity=-)
npm run dist:mac:signed  # Universal DMG, signed
npm run dist:win         # NSIS x64, unsigned
```

`restart-app.sh` is a convenience: it kills node/Electron, runs `build:main`, and prompts you to `npm run dev`. Use it when the main process seems to be running stale compiled JS.

## Architecture

Two TypeScript compilation targets share one repo:
- **Renderer** (`src/renderer`, `src/services`, `src/workers`): Vite + React, root set to `src/renderer`, output to `dist/renderer`. Uses path aliases `@/`, `@renderer/`, `@main/`, `@services/`, `@workers/`, `@components/` (defined in both `vite.config.ts` and `vitest.config.ts`).
- **Main** (`src/main`): `tsconfig.main.json` compiles to `dist/main` (CommonJS, rootDir = `src/main`). Package `main` points at `dist/main/main.js`. Main-process code cannot import from `src/renderer` or `src/services` — only `@main/*` / `@services/*` paths declared in `tsconfig.main.json`, and `src/services` is not currently on that list.

### Process boundary
`src/main/preload.ts` exposes `window.electronAPI` via `contextBridge`. **All renderer ↔ main communication must go through this surface** — `nodeIntegration` is off and `contextIsolation` is on. If you add a new main-process capability, add the IPC handler in `src/main/main.ts`, a passthrough in `preload.ts`, and the TypeScript signature in the `declare global { interface Window }` block at the bottom of `preload.ts`. The preload compiles to `dist/main/preload.js` and is loaded by `BrowserWindow` relative to `__dirname`.

### State
`src/renderer/store/usePDFStore.ts` (Zustand) is the single source of truth for documents, overlays, annotations, search, and OCR. Overlays are page-keyed `Map<number, T[]>` — keep that shape when adding new per-page collections rather than introducing parallel caches in components.

### Save pipeline (important)
Save is an **export**, not a copy. `SaveDialog` reads overlays/annotations from the store, parses page ranges, and calls `pdf:applyModifications` (IPC → `PDFService.applyModificationsToPDF`). For range saves it first calls `pdf:extractPages` into a temp file, remaps page numbers, then applies modifications. If you touch save, check both branches (all-pages and range) — the page-number remap is easy to break. Sidecar `.annotations.json` written via `annotations:save` is a **separate** persistence path from the embedded PDF export.

### PDF mutation
`src/main/services/pdf-service.ts` uses `pdf-lib` for most operations and lazy-loads ESM-only `mupdf` via a `new Function('return import("mupdf")')` trick — don't replace with a static `import`, TypeScript's CJS resolution will break it. `exportPageToImage()` and `extractText()` intentionally throw — they're not shipped.

### Rendering
Renderer uses `pdfjs-dist` through `src/services/pdf-renderer.ts`. The pdf.js worker is **bundled locally** via `import workerSrc from 'pdfjs-dist/build/pdf.worker.min.js?url'` — no CDN. Electron `Buffer` from `file:read` is converted to `ArrayBuffer` before handing to pdf.js (`PDFViewer.tsx`). Page rendering is gated on `isDocumentReady` to avoid racing the load. Overlay z-order (canvas → search highlights → annotations → text/image overlays) is intentional; don't reorder.

### OCR (PaddleOCR in a utilityProcess)
OCR runs in the main process via an Electron `utilityProcess`. Architecture:
- **Worker** (`src/main/workers/ocr-worker.ts`) — lazy-loads the ESM-only `@gutenye/ocr-node` (PaddleOCR v4 + onnxruntime-node) through the `new Function('s','return import(s)')` trick; `onnxruntime-node` itself is CJS and imported normally. Communicates with the service over `utilityProcess` message channels.
- **Service** (`src/main/services/ocr-service.ts`) — manages the worker lifecycle, writes the renderer's PNG bytes to a temp file, forwards to the worker, supports cancel via `AbortController`. Sidecar save/load at `<pdf>.ocr.json`.
- **Dialog** (`src/renderer/components/features/ocr/OCRDialog.tsx`) — checks `pdfjs` `getTextContent` first (text-layer short-circuit at 200-char threshold); only rasterizes + ships to the OCR service if the page is scan-like.
- **Sidecar auto-load** — `Toolbar.handleOpenFile` calls `loadOCRSidecar(path)` and seeds `ocrResults` via the new `hydrateOCRResults` store action.
- **Search integration** — `SearchPanel` merges pdfjs-layer matches with matches from `ocrResults`, dedup'd by page.

If you add a new OCR language, hand the models in `resources/ocr/<lang>/` and extend the worker to accept a `modelsDir`. If you swap engines, keep the worker's `OCRLine` shape (`{text, mean, box?}`) to avoid disturbing `linesToOCRResult` and the renderer.

### Packaging (native modules)
`asar: true` + `npmRebuild: false`. Native modules **must** be in `asarUnpack` — currently `onnxruntime-node`, `@gutenye/**`, `sharp`, `@img/**`. `resources/**` is also unpacked and duplicated into `extraResources/resources`. For universal macOS DMGs the current `dist:mac` flow depends on npm prebuilts already being present for both arches; add a `beforeBuild` hook running `npm rebuild --arch=<x64|arm64>` before universal merge if universal builds start failing.

### Known partial surfaces
- `PageManagement.tsx` is not connected to the main workflow; merge/split/delete/extract UI is incomplete.
- `exportPageToImage` / `extractText` in `pdf-service.ts` throw.
- `mupdf` is not on `main` — it lives on `feat/text-editing` for in-place text editing. Don't assume `getPageStructuredText` exists unless you're on that branch.

See `ARCHITECTURE.md` for the full runtime topology diagrams.

## Testing notes
- Vitest uses `jsdom` and excludes `src/e2e/**` and any `*.e2e.*` specs. Setup file: `src/tests/setup.ts`.
- Playwright's `webServer` runs `dev:renderer` only — E2E tests hit the Vite page, not packaged Electron.
- For changes near save, OCR, or viewer loading, unit tests won't catch regressions; manual verification under `npm run dev` is expected.
