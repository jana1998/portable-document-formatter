// Main-process embeddings service.
// Spawns a separate utilityProcess from OCR so large batches don't starve OCR.

import * as fs from 'fs/promises';
import * as path from 'path';
import { utilityProcess, type UtilityProcess, app } from 'electron';
import { randomUUID } from 'crypto';

export interface PageEmbedding {
  pageNumber: number;
  vector: number[];
}

export interface PageTextInput {
  pageNumber: number;
  text: string;
}

type WorkerResponse =
  | { type: 'ready'; id: string }
  | { type: 'result'; id: string; vectors: number[][] }
  | { type: 'error'; id: string; message: string };

interface Pending {
  resolve: (vectors: number[][]) => void;
  reject: (err: Error) => void;
}

export class EmbeddingsService {
  private proc: UtilityProcess | null = null;
  private ready: Promise<void> | null = null;
  private pending = new Map<string, Pending>();
  private readonly workerPath = path.join(__dirname, '..', 'workers', 'embeddings-worker.js');
  private cacheDir(): string {
    return path.join(app.getPath('userData'), 'models', 'embeddings');
  }

  private async ensureWorker(): Promise<void> {
    if (this.ready) return this.ready;

    this.ready = new Promise<void>((resolveReady, rejectReady) => {
      try {
        this.proc = utilityProcess.fork(this.workerPath, [], { stdio: 'pipe' });
      } catch (err) {
        rejectReady(err as Error);
        return;
      }

      this.proc.on('message', (raw: unknown) => {
        const msg = raw as WorkerResponse;
        if (!msg || typeof msg !== 'object' || !('type' in msg)) return;

        if (msg.type === 'ready') {
          if (msg.id === '__init__') resolveReady();
          return;
        }

        const pending = this.pending.get(msg.id);
        if (!pending) return;

        if (msg.type === 'result') pending.resolve(msg.vectors);
        else if (msg.type === 'error') pending.reject(new Error(msg.message));
        this.pending.delete(msg.id);
      });

      this.proc.on('exit', (code) => {
        const err = new Error(`embeddings-worker exited (code ${code})`);
        for (const p of this.pending.values()) p.reject(err);
        this.pending.clear();
        this.proc = null;
        this.ready = null;
      });

      this.proc.stdout?.on('data', (buf: Buffer) =>
        process.stdout.write(`[embeddings-worker] ${buf}`)
      );
      this.proc.stderr?.on('data', (buf: Buffer) =>
        process.stderr.write(`[embeddings-worker] ${buf}`)
      );

      this.proc.postMessage({
        type: 'init',
        id: '__init__',
        cacheDir: this.cacheDir(),
      });
    });

    return this.ready;
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    await this.ensureWorker();
    return new Promise<number[][]>((resolve, reject) => {
      const id = randomUUID();
      this.pending.set(id, { resolve, reject });
      this.proc!.postMessage({ type: 'embed', id, texts });
    });
  }

  async embedDocument(
    pages: PageTextInput[],
    _onProgress?: (done: number, total: number) => void
  ): Promise<PageEmbedding[]> {
    const nonEmpty = pages.filter((p) => (p.text ?? '').trim().length > 0);
    if (nonEmpty.length === 0) return [];

    // Batch to keep memory bounded; MiniLM is cheap, 16 is a reasonable chunk.
    const BATCH = 16;
    const out: PageEmbedding[] = [];

    for (let i = 0; i < nonEmpty.length; i += BATCH) {
      const slice = nonEmpty.slice(i, i + BATCH);
      const vectors = await this.embedTexts(slice.map((p) => p.text));
      slice.forEach((p, idx) => {
        const v = vectors[idx];
        if (Array.isArray(v) && v.length > 0) out.push({ pageNumber: p.pageNumber, vector: v });
      });
    }
    return out;
  }

  async saveSidecar(pdfPath: string, embeddings: PageEmbedding[]): Promise<string> {
    const sidecarPath = sidecarPathFor(pdfPath);
    const payload = {
      version: 1,
      model: 'Xenova/all-MiniLM-L6-v2',
      dims: embeddings[0]?.vector.length ?? 384,
      generatedAt: new Date().toISOString(),
      embeddings,
    };
    await fs.writeFile(sidecarPath, JSON.stringify(payload), 'utf-8');
    return sidecarPath;
  }

  async loadSidecar(pdfPath: string): Promise<PageEmbedding[] | null> {
    try {
      const raw = await fs.readFile(sidecarPathFor(pdfPath), 'utf-8');
      const parsed = JSON.parse(raw) as { embeddings?: PageEmbedding[] };
      return Array.isArray(parsed.embeddings) ? parsed.embeddings : null;
    } catch {
      return null;
    }
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
    for (const p of this.pending.values()) p.reject(new Error('embeddings service shutdown'));
    this.pending.clear();
  }
}

export function sidecarPathFor(pdfPath: string): string {
  return pdfPath.replace(/\.pdf$/i, '') + '.embeddings.json';
}
