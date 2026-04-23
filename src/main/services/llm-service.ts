// Main-process LLM service.
// Hybrid backend dispatcher: local (node-llama-cpp, scaffold only for v1) +
// cloud (Anthropic, OpenAI). Streams tokens to the renderer via
// webContents.send('llm:chunk', { requestId, chunk }).
//
// API keys live in OS keychain via Electron's built-in safeStorage; the
// encrypted blob is written to app.getPath('userData')/llm-secrets.json.
// The renderer never sees raw keys.

import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { app, safeStorage, type WebContents } from 'electron';
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
  local: 'qwen-2.5-1.5b-instruct-q4_k_m',
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

export class LLMService {
  private currentRequestAbort: AbortController | null = null;

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
      // Local LLM (node-llama-cpp) is scaffolded for v1.1. For now the hybrid
      // service dispatches to a clear 'not-ready' error so the Chat UI can
      // prompt the user to switch to a cloud backend or wait for the local
      // build.
      webContents.send('llm:error', {
        requestId,
        message:
          'Local LLM (Qwen 2.5 1.5B) is downloading in v1.1. Set a Claude or OpenAI key in Settings for now.',
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
