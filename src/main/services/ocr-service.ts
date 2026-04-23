// Main-process OCR service.
//
// Spawns an isolated utilityProcess (src/main/workers/ocr-worker.ts) to run
// PaddleOCR via onnxruntime-node. The renderer rasterizes the page and ships
// the PNG bytes here; this service writes them to a temp file and asks the
// worker to detect text. Text-layer short-circuit happens in the renderer
// (pdfjs-dist already lives there).

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { utilityProcess, type UtilityProcess } from 'electron';
import { randomUUID } from 'crypto';

export interface OCRLine {
  text: string;
  mean: number;
  box?: number[][];
}

export interface OCRWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OCRResult {
  pageNumber: number;
  text: string;
  confidence: number;
  words: OCRWord[];
}

type WorkerResponse =
  | { type: 'ready'; id: string }
  | { type: 'result'; id: string; lines: OCRLine[] }
  | { type: 'error'; id: string; message: string };

interface Pending {
  resolve: (lines: OCRLine[]) => void;
  reject: (err: Error) => void;
  signal?: AbortSignal;
  aborted?: boolean;
}

function resolveWorkerEntry(): string {
  // Compiled from src/main/workers/ocr-worker.ts → dist/main/workers/ocr-worker.js
  return path.join(__dirname, '..', 'workers', 'ocr-worker.js');
}

// @gutenye/ocr-models resolves its own model paths via import.meta.url in both
// dev and packaged builds (asarUnpack keeps the package files intact). Returning
// undefined lets it pick the right path itself. Override here only if we vendor
// our own detector/recognizer pair under resources/ocr/.

export class OCRService {
  private proc: UtilityProcess | null = null;
  private ready: Promise<void> | null = null;
  private pending = new Map<string, Pending>();
  private readonly workerPath = resolveWorkerEntry();

  private async ensureWorker(): Promise<void> {
    if (this.ready) return this.ready;

    this.ready = new Promise<void>((resolveReady, rejectReady) => {
      try {
        this.proc = utilityProcess.fork(this.workerPath, [], {
          stdio: 'pipe',
        });
      } catch (err) {
        rejectReady(err as Error);
        return;
      }

      this.proc.on('message', (raw: unknown) => {
        const msg = raw as WorkerResponse;
        if (!msg || typeof msg !== 'object' || !('type' in msg)) return;
        const pending = this.pending.get(msg.id);

        if (msg.type === 'ready') {
          if (msg.id === '__init__') resolveReady();
          return;
        }

        if (!pending) return;

        if (pending.aborted) {
          this.pending.delete(msg.id);
          return;
        }

        if (msg.type === 'result') {
          pending.resolve(msg.lines);
        } else if (msg.type === 'error') {
          pending.reject(new Error(msg.message));
        }
        this.pending.delete(msg.id);
      });

      this.proc.on('exit', (code) => {
        const err = new Error(`ocr-worker exited (code ${code})`);
        for (const p of this.pending.values()) p.reject(err);
        this.pending.clear();
        this.proc = null;
        this.ready = null;
      });

      // stdio=pipe so worker console logs are visible in dev
      this.proc.stdout?.on('data', (buf: Buffer) => process.stdout.write(`[ocr-worker] ${buf}`));
      this.proc.stderr?.on('data', (buf: Buffer) => process.stderr.write(`[ocr-worker] ${buf}`));

      this.proc.postMessage({ type: 'init', id: '__init__' });
    });

    return this.ready;
  }

  async recognizeImage(
    imageBytes: Buffer | Uint8Array,
    options: { signal?: AbortSignal } = {}
  ): Promise<OCRLine[]> {
    await this.ensureWorker();

    const tmpPath = path.join(os.tmpdir(), `ocr-${randomUUID()}.png`);
    await fs.writeFile(tmpPath, imageBytes);

    try {
      return await new Promise<OCRLine[]>((resolve, reject) => {
        const id = randomUUID();
        const pending: Pending = { resolve, reject, signal: options.signal };
        this.pending.set(id, pending);

        if (options.signal) {
          if (options.signal.aborted) {
            pending.aborted = true;
            this.pending.delete(id);
            reject(new Error('aborted'));
            return;
          }
          options.signal.addEventListener(
            'abort',
            () => {
              pending.aborted = true;
              this.pending.delete(id);
              reject(new Error('aborted'));
            },
            { once: true }
          );
        }

        this.proc!.postMessage({ type: 'recognize', id, imagePath: tmpPath });
      });
    } finally {
      fs.unlink(tmpPath).catch(() => undefined);
    }
  }

  async recognizePageImage(
    pageNumber: number,
    imageBytes: Buffer | Uint8Array,
    options: { signal?: AbortSignal } = {}
  ): Promise<OCRResult> {
    const lines = await this.recognizeImage(imageBytes, options);
    return linesToOCRResult(pageNumber, lines);
  }

  async saveSidecar(pdfPath: string, results: OCRResult[]): Promise<string> {
    const sidecarPath = sidecarPathFor(pdfPath);
    const payload = {
      version: 1,
      generatedAt: new Date().toISOString(),
      engine: 'paddle-ocr-v4',
      results,
    };
    await fs.writeFile(sidecarPath, JSON.stringify(payload, null, 2), 'utf-8');
    return sidecarPath;
  }

  async loadSidecar(pdfPath: string): Promise<OCRResult[] | null> {
    const sidecarPath = sidecarPathFor(pdfPath);
    try {
      const raw = await fs.readFile(sidecarPath, 'utf-8');
      const parsed = JSON.parse(raw) as { results?: OCRResult[] };
      return Array.isArray(parsed.results) ? parsed.results : null;
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
    for (const p of this.pending.values()) p.reject(new Error('ocr service shutdown'));
    this.pending.clear();
  }
}

export function sidecarPathFor(pdfPath: string): string {
  return pdfPath.replace(/\.pdf$/i, '') + '.ocr.json';
}

export function linesToOCRResult(pageNumber: number, lines: OCRLine[]): OCRResult {
  const words: OCRWord[] = lines.map((l) => {
    const box = l.box;
    let x0 = 0;
    let y0 = 0;
    let x1 = 0;
    let y1 = 0;
    if (box && box.length >= 4) {
      const xs = box.map((p) => p[0]);
      const ys = box.map((p) => p[1]);
      x0 = Math.min(...xs);
      y0 = Math.min(...ys);
      x1 = Math.max(...xs);
      y1 = Math.max(...ys);
    }
    return {
      text: l.text,
      confidence: l.mean,
      bbox: { x0, y0, x1, y1 },
    };
  });

  const text = lines.map((l) => l.text).join('\n');
  const confidence =
    lines.length > 0 ? lines.reduce((sum, l) => sum + (l.mean ?? 0), 0) / lines.length : 0;

  return { pageNumber, text, confidence, words };
}
