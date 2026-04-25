export {};

// OCR utilityProcess worker.
// Runs isolated from the main process. Loads PaddleOCR via @gutenye/ocr-node
// (ESM-only, so lazy-loaded via dynamic import) and recognizes pre-rasterized
// page images pointed to by a file path.
//
// Protocol (request → response on `process.parentPort`):
//   { type: 'init',      id, modelsDir? }                        → { type: 'ready', id }          | { type: 'error', id, message }
//   { type: 'recognize', id, imagePath }                         → { type: 'result', id, lines }  | { type: 'error', id, message }
//
// `lines` is `Line[]` from @gutenye/ocr-common: { text: string; mean: number; box?: number[][] }

/* eslint-disable @typescript-eslint/no-explicit-any */

type Lines = Array<{ text: string; mean: number; box?: number[][] }>;

let ocrInstance: any = null;
let initPromise: Promise<any> | null = null;

async function dynamicImport<T = unknown>(specifier: string): Promise<T> {
  return (await (new Function('s', 'return import(s)')(specifier))) as T;
}

async function ensureOcr(modelsDir?: string) {
  if (ocrInstance) return ocrInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const ocrMod = await dynamicImport<{ default: { create: (opts?: any) => Promise<any> } }>(
      '@gutenye/ocr-node'
    );
    const Ocr = ocrMod.default;

    let options: any = undefined;
    if (modelsDir) {
      // Resolve models from a user-supplied directory (e.g. unpacked app resources).
      const path = await dynamicImport<typeof import('node:path')>('node:path');
      options = {
        models: {
          detectionPath: path.join(modelsDir, 'ch_PP-OCRv4_det_infer.onnx'),
          recognitionPath: path.join(modelsDir, 'ch_PP-OCRv4_rec_infer.onnx'),
          dictionaryPath: path.join(modelsDir, 'ppocr_keys_v1.txt'),
        },
      };
    }

    ocrInstance = await Ocr.create(options);
    return ocrInstance;
  })();

  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
}

// utilityProcess parent port. Typed loosely because @types/node's utility proc
// types lag behind the runtime API.
const parentPort: any = (process as any).parentPort;

if (!parentPort) {
  // eslint-disable-next-line no-console
  console.error('[ocr-worker] no parentPort — must be launched via utilityProcess.fork');
  process.exit(1);
}

parentPort.on('message', async (evt: { data: any }) => {
  const msg = evt?.data;
  if (!msg || typeof msg !== 'object') return;
  const { type, id } = msg;

  try {
    if (type === 'init') {
      await ensureOcr(msg.modelsDir);
      parentPort.postMessage({ type: 'ready', id });
      return;
    }

    if (type === 'recognize') {
      const ocr = await ensureOcr(msg.modelsDir);
      const lines: Lines = await ocr.detect(msg.imagePath);
      parentPort.postMessage({ type: 'result', id, lines });
      return;
    }

    parentPort.postMessage({ type: 'error', id, message: `unknown message type: ${type}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    parentPort.postMessage({ type: 'error', id, message });
  }
});
