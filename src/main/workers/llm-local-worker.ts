export {};

// Local LLM utilityProcess worker.
// Runs a small on-device instruct model via @huggingface/transformers
// (ONNX runtime + Q4 quant). Streams tokens back to the main process over
// the utilityProcess parentPort as they're generated.
//
// Default model: HuggingFaceTB/SmolLM2-360M-Instruct (~360MB Q4).
//
// Protocol (parentPort messages):
//   { type: 'init',     id, cacheDir?, modelId? }                       → { type: 'ready',    id }
//   { type: 'generate', id, prompt, system?, maxNewTokens?, temperature? }
//                                                                         → { type: 'chunk',    id, text }  (stream)
//                                                                         → { type: 'done',     id }
//   { type: 'cancel',   id }                                             → { type: 'cancelled', id }

/* eslint-disable @typescript-eslint/no-explicit-any */

const DEFAULT_MODEL = 'HuggingFaceTB/SmolLM2-360M-Instruct';

let tf: any = null;
let pipe: any = null;
let loadPromise: Promise<any> | null = null;
let currentAbort: { aborted: boolean } | null = null;

async function dynamicImport<T = unknown>(specifier: string): Promise<T> {
  return (await (new Function('s', 'return import(s)')(specifier))) as T;
}

async function ensurePipeline(cacheDir?: string, modelId?: string) {
  if (pipe) return pipe;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    tf = await dynamicImport<any>('@huggingface/transformers');
    if (cacheDir) tf.env.cacheDir = cacheDir;
    tf.env.allowRemoteModels = true;

    pipe = await tf.pipeline('text-generation', modelId ?? DEFAULT_MODEL, {
      dtype: 'q4',
    });
    return pipe;
  })();

  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

const parentPort: any = (process as any).parentPort;
if (!parentPort) {
  // eslint-disable-next-line no-console
  console.error('[llm-local-worker] no parentPort — must be launched via utilityProcess.fork');
  process.exit(1);
}

parentPort.on('message', async (evt: { data: any }) => {
  const msg = evt?.data;
  if (!msg || typeof msg !== 'object') return;
  const { type, id } = msg;

  try {
    if (type === 'init') {
      await ensurePipeline(msg.cacheDir, msg.modelId);
      parentPort.postMessage({ type: 'ready', id });
      return;
    }

    if (type === 'cancel') {
      if (currentAbort) currentAbort.aborted = true;
      parentPort.postMessage({ type: 'cancelled', id });
      return;
    }

    if (type === 'generate') {
      const generator = await ensurePipeline(msg.cacheDir, msg.modelId);

      const messages: Array<{ role: string; content: string }> = [];
      if (typeof msg.system === 'string' && msg.system.trim()) {
        messages.push({ role: 'system', content: msg.system });
      }
      messages.push({ role: 'user', content: String(msg.prompt ?? '') });

      const abort = { aborted: false };
      currentAbort = abort;

      const streamer = new tf.TextStreamer(generator.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (chunk: string) => {
          if (abort.aborted || !chunk) return;
          parentPort.postMessage({ type: 'chunk', id, text: chunk });
        },
      });

      await generator(messages, {
        max_new_tokens: Math.min(Math.max(Number(msg.maxNewTokens) || 512, 16), 2048),
        temperature: typeof msg.temperature === 'number' ? msg.temperature : 0.3,
        do_sample: typeof msg.temperature === 'number' ? msg.temperature > 0 : false,
        streamer,
      });

      currentAbort = null;
      if (!abort.aborted) parentPort.postMessage({ type: 'done', id });
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
