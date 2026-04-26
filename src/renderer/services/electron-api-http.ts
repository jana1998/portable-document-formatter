// HTTP-backed polyfill of `window.electronAPI` used when the renderer is
// loaded from a regular browser (mobile companion mode). The desktop Electron
// build sets window.electronAPI via the preload; we only install when that's
// missing. Methods that need the desktop OS or heavy ML stay as stubs in v1.

const TOKEN_KEY = 'companionToken';
const NOT_AVAILABLE = (op: string) => () => Promise.reject(new Error(`${op} is not available in mobile companion mode`));

function readAndScrubUrlToken(): string | null {
  try {
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get('t');
    if (fromQuery) {
      window.localStorage.setItem(TOKEN_KEY, fromQuery);
      url.searchParams.delete('t');
      window.history.replaceState(null, '', url.pathname + (url.searchParams.toString() ? '?' + url.searchParams : '') + url.hash);
      return fromQuery;
    }
  } catch {
    // ignore
  }
  return window.localStorage.getItem(TOKEN_KEY);
}

function getToken(): string {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) throw new Error('Companion token missing — re-scan the QR code from the desktop app.');
  return token;
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${getToken()}`, ...extra };
}

async function jsonRequest<T>(method: string, urlPath: string, body?: unknown): Promise<T> {
  const init: RequestInit = {
    method,
    headers: authHeaders(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(urlPath, init);
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`${method} ${urlPath} → ${res.status}: ${msg || res.statusText}`);
  }
  // If the response isn't JSON, it usually means we're not actually talking
  // to the companion server (most often: page loaded from Vite dev server,
  // not from the desktop on its companion port).
  const ct = res.headers.get('content-type') ?? '';
  const text = await res.text();
  if (!text) return null as T;
  if (!ct.includes('application/json')) {
    throw new Error(
      'Companion server not detected on this origin. Open the QR code from the desktop Settings panel — its URL uses a different port.'
    );
  }
  return JSON.parse(text) as T;
}

async function fetchBytes(urlPath: string): Promise<Uint8Array> {
  const res = await fetch(urlPath, { headers: authHeaders() });
  if (!res.ok) throw new Error(`${urlPath} → ${res.status}: ${res.statusText}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

// PDFViewer, ThumbnailsPanel, SearchPanel, OCRDialog, ReaderMode, and the
// embeddings indexer each pull readFile(path) independently. On mobile that
// would round-trip the same PDF over WiFi 5+ times per session — cache by
// path so first hit pays, the rest are instant.
const fileCache = new Map<string, Uint8Array>();
function invalidateFile(path: string): void {
  fileCache.delete(path);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function buildShim(): Window['electronAPI'] {
  const shim = {
    // Dialogs / file picker — mobile UI uses LibraryPicker instead.
    openFile: () => Promise.reject(new Error('Use the library picker on mobile.')),
    saveFile: () => Promise.resolve(null),

    // File IO
    readFile: async (filePath: string) => {
      const cached = fileCache.get(filePath);
      if (cached) return cached;
      const bytes = await fetchBytes(`/api/library/file?path=${encodeURIComponent(filePath)}`);
      fileCache.set(filePath, bytes);
      return bytes;
    },
    writeFile: NOT_AVAILABLE('writeFile'),

    // PDF info / structured text
    getPDFInfo: (filePath: string) =>
      jsonRequest('GET', `/api/pdf/info?path=${encodeURIComponent(filePath)}`),
    getPageStructuredText: (filePath: string, pageNumber: number) =>
      jsonRequest('GET', `/api/pdf/page-text?path=${encodeURIComponent(filePath)}&page=${pageNumber}`),

    // PDF mutations not in v1 mobile scope
    mergePDFs: NOT_AVAILABLE('mergePDFs'),
    splitPDF: NOT_AVAILABLE('splitPDF'),
    deletePage: NOT_AVAILABLE('deletePage'),
    extractPages: NOT_AVAILABLE('extractPages'),
    reorderPages: NOT_AVAILABLE('reorderPages'),
    rotatePage: NOT_AVAILABLE('rotatePage'),
    addTextToPDF: NOT_AVAILABLE('addTextToPDF'),
    addImageToPDF: NOT_AVAILABLE('addImageToPDF'),
    exportToImage: NOT_AVAILABLE('exportToImage'),
    extractText: NOT_AVAILABLE('extractText'),
    // bakeTextEdits is desktop-only; mobile renders the original PDF.
    bakeTextEdits: NOT_AVAILABLE('bakeTextEdits'),
    // locateTextEdit is the Phase 4a diagnostic; not exposed to mobile.
    locateTextEdit: () => Promise.resolve(null),

    // Annotations sidecar
    saveAnnotations: async (filePath: string, annotations: unknown) => {
      const result = await jsonRequest<{ sidecarPath: string }>('POST', '/api/annotations', {
        path: filePath,
        annotations,
      });
      return result.sidecarPath;
    },
    loadAnnotations: (filePath: string) =>
      jsonRequest<unknown>('GET', `/api/annotations?path=${encodeURIComponent(filePath)}`),

    // Save: applyModifications writes back to library AND triggers a download.
    // outputPath comes in as either a basename or a full path; we keep the basename.
    applyModifications: async (filePath: string, modifications: unknown, outputPath: string) => {
      const outputName = outputPath.split(/[\\/]/).pop() || outputPath;
      const res = await fetch('/api/library/save', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ sourcePath: filePath, modifications, outputName }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(`save → ${res.status}: ${msg || res.statusText}`);
      }
      const blob = await res.blob();
      triggerDownload(blob, outputName);
      // Library now contains a new file (and possibly an overwritten source).
      invalidateFile(outputName);
      invalidateFile(filePath);
      return true;
    },

    // OCR / LLM — out of v1 scope. Stubs keep existing renderer
    // code paths from crashing when they fire on document open.
    recognizePageImage: NOT_AVAILABLE('recognizePageImage'),
    cancelOCR: () => Promise.resolve(false),
    saveOCRSidecar: () => Promise.resolve(''),
    loadOCRSidecar: () => Promise.resolve(null),
    saveTextFile: NOT_AVAILABLE('saveTextFile'),
    exportOCRPDF: NOT_AVAILABLE('exportOCRPDF'),
    writeTextFile: NOT_AVAILABLE('writeTextFile'),
    llmGenerate: NOT_AVAILABLE('llmGenerate'),
    llmCancel: () => Promise.resolve(false),
    onLLMChunk: () => () => undefined,
    onLLMDone: () => () => undefined,
    onLLMError: () => () => undefined,

    // Companion control surface — desktop-only.
    companionStatus: NOT_AVAILABLE('companionStatus'),
    companionEnable: NOT_AVAILABLE('companionEnable'),
    companionDisable: NOT_AVAILABLE('companionDisable'),
    companionRotateToken: NOT_AVAILABLE('companionRotateToken'),
    companionPickLibrary: NOT_AVAILABLE('companionPickLibrary'),
    companionGetLanUrls: () => Promise.resolve([]),

    // Marker for renderer code that needs to branch on transport
    companionMode: true,
  } as unknown as Window['electronAPI'];

  return shim;
}

function shouldInstall(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.electronAPI) return false;
  // Only install when loaded over an http(s) origin — otherwise we're in tests/SSR.
  const proto = window.location.protocol;
  return proto === 'http:' || proto === 'https:';
}

if (shouldInstall()) {
  readAndScrubUrlToken();
  (window as unknown as { electronAPI: Window['electronAPI'] }).electronAPI = buildShim();
}
