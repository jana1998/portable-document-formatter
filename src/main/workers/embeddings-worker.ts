export {};

// Embeddings utilityProcess worker.
// Lazy-loads the ESM-only @huggingface/transformers, runs all-MiniLM-L6-v2,
// returns 384-dim mean-pooled normalized vectors.
//
// Protocol (on process.parentPort):
//   { type: 'init',  id, cacheDir }                         → { type: 'ready',  id }
//   { type: 'embed', id, texts: string[] }                  → { type: 'result', id, vectors: number[][] }

/* eslint-disable @typescript-eslint/no-explicit-any */

type Extractor = (
  input: string | string[],
  opts?: { pooling?: 'mean' | 'cls' | 'none'; normalize?: boolean }
) => Promise<{ data: Float32Array; dims: number[] }>;

let extractor: Extractor | null = null;
let initPromise: Promise<Extractor> | null = null;

async function dynamicImport<T = unknown>(specifier: string): Promise<T> {
  return (await (new Function('s', 'return import(s)')(specifier))) as T;
}

async function ensureExtractor(cacheDir?: string): Promise<Extractor> {
  if (extractor) return extractor;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const tf = await dynamicImport<{
      pipeline: (task: string, model: string, opts?: any) => Promise<Extractor>;
      env: { cacheDir?: string; allowRemoteModels?: boolean };
    }>('@huggingface/transformers');

    if (cacheDir) {
      tf.env.cacheDir = cacheDir;
    }
    tf.env.allowRemoteModels = true;

    const pipe = await tf.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    extractor = pipe;
    return pipe;
  })();

  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const ex = await ensureExtractor();
  const results: number[][] = [];
  // transformers.js batches internally when given an array, but memory-safer
  // to loop for long page texts.
  for (const t of texts) {
    const trimmed = (t || '').slice(0, 8000); // MiniLM truncates at 256 tokens anyway
    const out = await ex(trimmed, { pooling: 'mean', normalize: true });
    results.push(Array.from(out.data));
  }
  return results;
}

const parentPort: any = (process as any).parentPort;
if (!parentPort) {
  // eslint-disable-next-line no-console
  console.error('[embeddings-worker] no parentPort — must be launched via utilityProcess.fork');
  process.exit(1);
}

parentPort.on('message', async (evt: { data: any }) => {
  const msg = evt?.data;
  if (!msg || typeof msg !== 'object') return;
  const { type, id } = msg;

  try {
    if (type === 'init') {
      await ensureExtractor(msg.cacheDir);
      parentPort.postMessage({ type: 'ready', id });
      return;
    }
    if (type === 'embed') {
      const vectors = await embedBatch(Array.isArray(msg.texts) ? msg.texts : []);
      parentPort.postMessage({ type: 'result', id, vectors });
      return;
    }
    parentPort.postMessage({ type: 'error', id, message: `unknown message type: ${type}` });
  } catch (err) {
    parentPort.postMessage({
      type: 'error',
      id,
      message: err instanceof Error ? err.message : String(err),
    });
  }
});
