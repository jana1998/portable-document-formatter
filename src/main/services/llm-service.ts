// Main-process LLM service.
// Hybrid backend dispatcher:
//   - local     → @huggingface/transformers + SmolLM2-360M-Instruct (Q4 ONNX)
//                 runs in src/main/workers/llm-local-worker.ts utilityProcess.
//   - anthropic → @anthropic-ai/sdk streaming
//   - openai    → openai responses.stream
// All three stream tokens to the renderer via
// webContents.send('llm:chunk', { requestId, chunk }).
//
// API keys live in OS keychain via Electron's built-in safeStorage; the
// encrypted blob is written to app.getPath('userData')/llm-secrets.json.
// The renderer never sees raw keys.

import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { app, safeStorage, utilityProcess, type UtilityProcess, type WebContents } from 'electron';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export type LLMBackend = 'local' | 'anthropic' | 'openai';

export interface LLMGenerateOptions {
  backend?: LLMBackend;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  system?: string;
}

export interface LLMGenerateChunk {
  requestId: string;
  chunk: string;
}

interface StoredSecrets {
  anthropic?: string;
  openai?: string;
}

// Verified against the installed SDKs' model literal unions so key-save + test
// succeed out of the box. Users can override per-request via options.model.
const DEFAULT_MODELS: Record<LLMBackend, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4.1-mini',
  // Small Q4 ONNX instruct model that runs reasonably on CPU.
  // ~360MB, auto-downloaded to userData/models/llm on first use.
  local: 'HuggingFaceTB/SmolLM2-360M-Instruct',
};

function secretsPath(): string {
  return path.join(app.getPath('userData'), 'llm-secrets.json');
}

async function readSecrets(): Promise<StoredSecrets> {
  try {
    const raw = await fs.readFile(secretsPath(), 'utf-8');
    const parsed = JSON.parse(raw) as { anthropic?: string; openai?: string };
    const out: StoredSecrets = {};
    if (parsed.anthropic && safeStorage.isEncryptionAvailable()) {
      try {
        out.anthropic = safeStorage.decryptString(Buffer.from(parsed.anthropic, 'base64'));
      } catch {
        // corrupt entry, ignore
      }
    }
    if (parsed.openai && safeStorage.isEncryptionAvailable()) {
      try {
        out.openai = safeStorage.decryptString(Buffer.from(parsed.openai, 'base64'));
      } catch {
        // corrupt entry, ignore
      }
    }
    return out;
  } catch {
    return {};
  }
}

async function writeSecrets(raw: StoredSecrets): Promise<void> {
  const payload: Record<string, string> = {};
  if (raw.anthropic) {
    payload.anthropic = safeStorage.encryptString(raw.anthropic).toString('base64');
  }
  if (raw.openai) {
    payload.openai = safeStorage.encryptString(raw.openai).toString('base64');
  }
  await fs.writeFile(secretsPath(), JSON.stringify(payload, null, 2), { mode: 0o600 });
}

// Local worker: reused across generations, lazy-initialized on first use.
type LocalMsg =
  | { type: 'ready'; id: string }
  | { type: 'chunk'; id: string; text: string }
  | { type: 'done'; id: string }
  | { type: 'cancelled'; id: string }
  | { type: 'error'; id: string; message: string };

interface LocalStream {
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
}

class LocalLLM {
  private proc: UtilityProcess | null = null;
  private ready: Promise<void> | null = null;
  private listeners = new Map<string, LocalStream>();
  private readonly workerPath = path.join(
    __dirname,
    '..',
    'workers',
    'llm-local-worker.js'
  );

  private cacheDir(): string {
    return path.join(app.getPath('userData'), 'models', 'llm');
  }

  private async ensureWorker(modelId?: string): Promise<void> {
    if (this.ready) return this.ready;

    this.ready = new Promise<void>((resolveReady, rejectReady) => {
      try {
        this.proc = utilityProcess.fork(this.workerPath, [], { stdio: 'pipe' });
      } catch (err) {
        rejectReady(err as Error);
        return;
      }

      this.proc.on('message', (raw: unknown) => {
        const msg = raw as LocalMsg;
        if (!msg || typeof msg !== 'object' || !('type' in msg)) return;

        if (msg.type === 'ready') {
          if (msg.id === '__init__') resolveReady();
          return;
        }

        const listener = this.listeners.get(msg.id);
        if (!listener) return;

        if (msg.type === 'chunk') listener.onChunk(msg.text);
        else if (msg.type === 'done' || msg.type === 'cancelled') {
          listener.onDone();
          this.listeners.delete(msg.id);
        } else if (msg.type === 'error') {
          listener.onError(msg.message);
          this.listeners.delete(msg.id);
        }
      });

      this.proc.on('exit', (code) => {
        for (const l of this.listeners.values())
          l.onError(`llm-local-worker exited (code ${code})`);
        this.listeners.clear();
        this.proc = null;
        this.ready = null;
      });

      this.proc.stdout?.on('data', (buf: Buffer) =>
        process.stdout.write(`[llm-local-worker] ${buf}`)
      );
      this.proc.stderr?.on('data', (buf: Buffer) =>
        process.stderr.write(`[llm-local-worker] ${buf}`)
      );

      this.proc.postMessage({
        type: 'init',
        id: '__init__',
        cacheDir: this.cacheDir(),
        modelId,
      });
    });

    return this.ready;
  }

  async generate(
    id: string,
    prompt: string,
    opts: { system?: string; maxTokens?: number; temperature?: number; model?: string },
    stream: LocalStream
  ): Promise<void> {
    await this.ensureWorker(opts.model);
    this.listeners.set(id, stream);
    this.proc!.postMessage({
      type: 'generate',
      id,
      prompt,
      system: opts.system,
      maxNewTokens: opts.maxTokens,
      temperature: opts.temperature,
      cacheDir: this.cacheDir(),
      modelId: opts.model,
    });
  }

  cancel(id: string): void {
    if (!this.proc) return;
    this.proc.postMessage({ type: 'cancel', id });
  }

  async shutdown(): Promise<void> {
    if (!this.proc) return;
    try {
      this.proc.kill();
    } catch {
      // ignore
    }
    this.proc = null;
    this.ready = null;
    for (const l of this.listeners.values()) l.onError('llm service shutdown');
    this.listeners.clear();
  }
}

export class LLMService {
  private currentRequestAbort: AbortController | null = null;
  private currentLocalId: string | null = null;
  private readonly local = new LocalLLM();

  async shutdown(): Promise<void> {
    await this.local.shutdown();
  }

  async hasApiKey(backend: 'anthropic' | 'openai'): Promise<boolean> {
    const secrets = await readSecrets();
    return Boolean(secrets[backend]);
  }

  async setApiKey(backend: 'anthropic' | 'openai', key: string | null): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure storage is not available on this platform');
    }
    const secrets = await readSecrets();
    if (key && key.trim().length > 0) {
      secrets[backend] = key.trim();
    } else {
      delete secrets[backend];
    }
    await writeSecrets(secrets);
  }

  async testBackend(backend: 'anthropic' | 'openai'): Promise<{ ok: boolean; error?: string }> {
    try {
      const client = await this.makeClient(backend);
      if (backend === 'anthropic') {
        const c = client as Anthropic;
        await c.messages.create({
          model: DEFAULT_MODELS.anthropic,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        });
      } else {
        const c = client as OpenAI;
        await c.responses.create({
          model: DEFAULT_MODELS.openai,
          input: 'ping',
          max_output_tokens: 1,
        });
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async makeClient(backend: 'anthropic' | 'openai'): Promise<Anthropic | OpenAI> {
    const secrets = await readSecrets();
    const key = secrets[backend];
    if (!key) throw new Error(`No API key configured for ${backend}`);
    if (backend === 'anthropic') return new Anthropic({ apiKey: key });
    return new OpenAI({ apiKey: key });
  }

  cancelCurrent(): void {
    this.currentRequestAbort?.abort();
    this.currentRequestAbort = null;
    if (this.currentLocalId) {
      this.local.cancel(this.currentLocalId);
      this.currentLocalId = null;
    }
  }

  async generate(
    webContents: WebContents,
    prompt: string,
    options: LLMGenerateOptions = {}
  ): Promise<{ requestId: string }> {
    const backend = options.backend ?? 'anthropic';
    const model = options.model ?? DEFAULT_MODELS[backend];
    const requestId = randomUUID();

    // Previous in-flight is cancelled automatically; callers can also call cancel().
    this.currentRequestAbort?.abort();
    const abort = new AbortController();
    this.currentRequestAbort = abort;

    // Fire-and-forget. Stream chunks via IPC events.
    void this.streamGeneration(webContents, requestId, prompt, { ...options, backend, model }, abort.signal)
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        webContents.send('llm:error', { requestId, message });
      })
      .finally(() => {
        if (this.currentRequestAbort === abort) this.currentRequestAbort = null;
      });

    return { requestId };
  }

  private async streamGeneration(
    webContents: WebContents,
    requestId: string,
    prompt: string,
    options: LLMGenerateOptions,
    signal: AbortSignal
  ): Promise<void> {
    const { backend, model, system, temperature, maxTokens } = options;

    if (backend === 'local') {
      // On-device inference via @huggingface/transformers in a utilityProcess.
      // First generation triggers a ~360MB model download to userData/models/llm.
      this.currentLocalId = requestId;
      await new Promise<void>((resolve) => {
        this.local
          .generate(
            requestId,
            prompt,
            {
              system,
              maxTokens: maxTokens ?? 512,
              temperature,
              model,
            },
            {
              onChunk: (text) => {
                if (signal.aborted) return;
                webContents.send('llm:chunk', { requestId, chunk: text });
              },
              onDone: () => {
                webContents.send('llm:done', { requestId });
                if (this.currentLocalId === requestId) this.currentLocalId = null;
                resolve();
              },
              onError: (message) => {
                webContents.send('llm:error', { requestId, message });
                if (this.currentLocalId === requestId) this.currentLocalId = null;
                resolve();
              },
            }
          )
          .catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            webContents.send('llm:error', { requestId, message });
            if (this.currentLocalId === requestId) this.currentLocalId = null;
            resolve();
          });

        signal.addEventListener('abort', () => {
          this.local.cancel(requestId);
        });
      });
      return;
    }

    if (backend === 'anthropic') {
      const client = (await this.makeClient('anthropic')) as Anthropic;
      // Only set temperature when the caller asked for one — some models reject it.
      const createParams: Anthropic.MessageCreateParamsStreaming = {
        model: model ?? DEFAULT_MODELS.anthropic,
        max_tokens: maxTokens ?? 1024,
        system,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      };
      if (typeof temperature === 'number') createParams.temperature = temperature;
      const stream = client.messages.stream(createParams, { signal });

      for await (const evt of stream) {
        if (signal.aborted) break;
        if (
          evt.type === 'content_block_delta' &&
          evt.delta.type === 'text_delta' &&
          evt.delta.text
        ) {
          webContents.send('llm:chunk', { requestId, chunk: evt.delta.text });
        }
      }
      webContents.send('llm:done', { requestId });
      return;
    }

    if (backend === 'openai') {
      const client = (await this.makeClient('openai')) as OpenAI;
      const createParams: OpenAI.Responses.ResponseCreateParamsStreaming = {
        model: model ?? DEFAULT_MODELS.openai,
        input: system
          ? [{ role: 'system', content: system }, { role: 'user', content: prompt }]
          : prompt,
        stream: true,
        max_output_tokens: maxTokens ?? 1024,
      };
      if (typeof temperature === 'number') createParams.temperature = temperature;
      const stream = await client.responses.create(createParams, { signal });

      for await (const evt of stream) {
        if (signal.aborted) break;
        if (evt.type === 'response.output_text.delta' && evt.delta) {
          webContents.send('llm:chunk', { requestId, chunk: evt.delta });
        }
      }
      webContents.send('llm:done', { requestId });
      return;
    }

    webContents.send('llm:error', { requestId, message: `unknown backend: ${backend}` });
  }
}

export const DEFAULT_LLM_MODELS = DEFAULT_MODELS;
