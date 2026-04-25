// Main-process LLM service.
//
// Scaffold layout: an `LLMProvider` interface + a default `StubProvider` that
// streams a canned response so the UI plumbing can be exercised end-to-end.
// To wire up a real model, implement `LLMProvider` (Anthropic, OpenAI, Ollama,
// llama.cpp, mlx, …) and assign it via `llmService.setProvider(...)` from
// main.ts during app boot.
//
// The renderer talks to this service through three IPC events:
//   webContents.send('llm:chunk', { requestId, chunk })
//   webContents.send('llm:done',  { requestId })
//   webContents.send('llm:error', { requestId, message })

import { randomUUID } from 'crypto';
import type { WebContents } from 'electron';

export interface LLMGenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  system?: string;
}

interface ProviderCallbacks {
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

export interface LLMProvider {
  generate(
    prompt: string,
    options: LLMGenerateOptions,
    cb: ProviderCallbacks,
    signal: AbortSignal
  ): Promise<void>;
}

// Streams a canned message word-by-word so the chat UI shows working stream +
// cancel + done events without any external dependencies. Replace before ship.
class StubProvider implements LLMProvider {
  async generate(
    prompt: string,
    _options: LLMGenerateOptions,
    cb: ProviderCallbacks,
    signal: AbortSignal
  ): Promise<void> {
    const reply = [
      'AI provider is not configured yet — this is the scaffold reply.',
      '',
      `You asked: "${prompt.slice(0, 200)}${prompt.length > 200 ? '…' : ''}"`,
      '',
      'To wire up a real model, implement the `LLMProvider` interface in',
      'src/main/services/llm-service.ts and call `llmService.setProvider(...)`',
      'during app boot in src/main/main.ts.',
    ].join('\n');

    const tokens = reply.match(/\S+\s*|\s+/g) ?? [reply];
    for (const t of tokens) {
      if (signal.aborted) return;
      cb.onChunk(t);
      await new Promise<void>((r) => setTimeout(r, 12));
    }
    cb.onDone();
  }
}

export class LLMService {
  private provider: LLMProvider = new StubProvider();
  private currentAbort: AbortController | null = null;

  setProvider(provider: LLMProvider): void {
    this.provider = provider;
  }

  cancelCurrent(): void {
    this.currentAbort?.abort();
    this.currentAbort = null;
  }

  async shutdown(): Promise<void> {
    this.cancelCurrent();
  }

  async generate(
    webContents: WebContents,
    prompt: string,
    options: LLMGenerateOptions = {}
  ): Promise<{ requestId: string }> {
    const requestId = randomUUID();
    const abort = new AbortController();
    // Cancel any in-flight generation so a new request always wins.
    this.currentAbort?.abort();
    this.currentAbort = abort;

    void this.provider
      .generate(
        prompt,
        options,
        {
          onChunk: (text) => {
            if (abort.signal.aborted) return;
            webContents.send('llm:chunk', { requestId, chunk: text });
          },
          onDone: () => webContents.send('llm:done', { requestId }),
          onError: (message) => webContents.send('llm:error', { requestId, message }),
        },
        abort.signal
      )
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        webContents.send('llm:error', { requestId, message });
      })
      .finally(() => {
        if (this.currentAbort === abort) this.currentAbort = null;
      });

    return { requestId };
  }
}
