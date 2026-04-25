import * as fs from 'fs/promises';
import * as path from 'path';
import { timingSafeEqual } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import { app } from 'electron';
import type { PDFService } from './pdf-service';
import type { FileService } from './file-service';
import { companionConfigStore } from './companion-config';

export interface CompanionRouteDeps {
  pdfService: PDFService;
  fileService: FileService;
}

const MAX_BODY = 16 * 1024 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_FAILS = 5;
const RATE_LOCKOUT_MS = 30_000;

interface RateEntry { fails: number[]; lockedUntil: number }
const rateMap = new Map<string, RateEntry>();

function clientIp(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? 'unknown';
}

function isLockedOut(ip: string): boolean {
  const entry = rateMap.get(ip);
  if (!entry) return false;
  if (entry.lockedUntil > Date.now()) return true;
  return false;
}

function recordAuthFail(ip: string): void {
  const now = Date.now();
  const entry = rateMap.get(ip) ?? { fails: [], lockedUntil: 0 };
  entry.fails = entry.fails.filter((t) => now - t < RATE_WINDOW_MS);
  entry.fails.push(now);
  if (entry.fails.length >= RATE_MAX_FAILS) entry.lockedUntil = now + RATE_LOCKOUT_MS;
  rateMap.set(ip, entry);
}

function tokensMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'utf-8'), Buffer.from(b, 'utf-8'));
  } catch {
    return false;
  }
}

function extractToken(req: IncomingMessage, url: URL): string | null {
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const t = url.searchParams.get('t');
  return t && t.length > 0 ? t : null;
}

function send(res: ServerResponse, status: number, body: string | Buffer, headers: Record<string, string> = {}): void {
  const finalHeaders: Record<string, string> = {
    'Cache-Control': 'no-store',
    ...headers,
  };
  if (!finalHeaders['Content-Type']) finalHeaders['Content-Type'] = 'text/plain; charset=utf-8';
  res.writeHead(status, finalHeaders);
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  send(res, status, JSON.stringify(payload), { 'Content-Type': 'application/json; charset=utf-8' });
}

function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.destroy();
        reject(new Error('Body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson<T = unknown>(req: IncomingMessage): Promise<T> {
  const buf = await readBody(req);
  return JSON.parse(buf.toString('utf-8')) as T;
}

function rendererDir(): string {
  // Compiled main lives at <app>/dist/main; renderer at <app>/dist/renderer
  return path.join(app.getAppPath(), 'dist', 'renderer');
}

const STATIC_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

async function serveStatic(res: ServerResponse, urlPath: string): Promise<void> {
  const root = rendererDir();
  const realRoot = await fs.realpath(root).catch(() => null);
  if (!realRoot) {
    send(res, 503, 'Renderer bundle not found. Run "npm run build:renderer" first.');
    return;
  }
  const candidate = path.resolve(root, '.' + urlPath);
  let realCandidate: string;
  try {
    realCandidate = await fs.realpath(candidate);
  } catch {
    send(res, 404, 'Not found');
    return;
  }
  if (!(realCandidate === realRoot || realCandidate.startsWith(realRoot + path.sep))) {
    send(res, 403, 'Forbidden');
    return;
  }
  try {
    const data = await fs.readFile(realCandidate);
    const ext = path.extname(realCandidate).toLowerCase();
    const mime = STATIC_MIME[ext] ?? 'application/octet-stream';
    send(res, 200, data, { 'Content-Type': mime });
  } catch {
    send(res, 404, 'Not found');
  }
}

async function resolveSafeRead(rel: string, root: string): Promise<string> {
  const candidate = path.resolve(root, rel);
  const realRoot = await fs.realpath(root);
  const realCandidate = await fs.realpath(candidate);
  if (!(realCandidate === realRoot || realCandidate.startsWith(realRoot + path.sep))) {
    throw new Error('Path outside library');
  }
  return realCandidate;
}

async function resolveSafeWrite(rel: string, root: string): Promise<string> {
  const candidate = path.resolve(root, rel);
  const dir = path.dirname(candidate);
  const realRoot = await fs.realpath(root);
  const realDir = await fs.realpath(dir);
  if (!(realDir === realRoot || realDir.startsWith(realRoot + path.sep))) {
    throw new Error('Path outside library');
  }
  return path.join(realDir, path.basename(candidate));
}

function sidecarPathFor(pdfPath: string): string {
  return pdfPath.replace(/\.pdf$/i, '.annotations.json');
}

export function createRequestHandler(deps: CompanionRouteDeps) {
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const config = await companionConfigStore.load();
      const url = new URL(req.url ?? '/', 'http://placeholder');
      const ip = clientIp(req);

      // Static surface — no bearer auth (only HTML + JS bundle, no secrets).
      // The HTML page itself is gated by ?t= so an unauthenticated reader
      // can't pair their device.
      if (req.method === 'GET' && url.pathname === '/') {
        if (isLockedOut(ip)) { send(res, 429, 'Too many attempts'); return; }
        const token = url.searchParams.get('t');
        if (!token || !tokensMatch(token, config.token)) {
          recordAuthFail(ip);
          send(res, 401, 'Invalid or missing token');
          return;
        }
        const indexPath = path.join(rendererDir(), 'index.html');
        try {
          const html = await fs.readFile(indexPath);
          send(res, 200, html, { 'Content-Type': STATIC_MIME['.html'] });
        } catch {
          send(res, 503, 'Renderer bundle not found. Run "npm run build:renderer" first.');
        }
        return;
      }

      if (req.method === 'GET' && (url.pathname.startsWith('/assets/') || url.pathname === '/icon.svg' || url.pathname === '/icon.png')) {
        await serveStatic(res, url.pathname);
        return;
      }

      // All /api/* require bearer token.
      if (!url.pathname.startsWith('/api/')) {
        send(res, 404, 'Not found');
        return;
      }

      if (isLockedOut(ip)) { sendError(res, 429, 'Too many attempts'); return; }
      const token = extractToken(req, url);
      if (!token || !tokensMatch(token, config.token)) {
        recordAuthFail(ip);
        sendError(res, 401, 'Unauthorized');
        return;
      }

      const libraryPath = config.libraryPath;
      const requireLibrary = (): string => {
        if (!libraryPath) throw new Error('Library folder not configured');
        return libraryPath;
      };

      // Routes
      if (req.method === 'GET' && url.pathname === '/api/companion/info') {
        sendJson(res, 200, {
          version: app.getVersion(),
          libraryRoot: libraryPath ? path.basename(libraryPath) : null,
          hasClipboard: false,
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/library/list') {
        const root = requireLibrary();
        const realRoot = await fs.realpath(root);
        const entries = await fs.readdir(realRoot, { withFileTypes: true });
        const files = await Promise.all(
          entries
            .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.pdf'))
            .map(async (e) => {
              const full = path.join(realRoot, e.name);
              const stat = await fs.stat(full);
              return { name: e.name, path: e.name, size: stat.size, mtime: stat.mtimeMs };
            })
        );
        files.sort((a, b) => b.mtime - a.mtime);
        sendJson(res, 200, { files });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/library/file') {
        const root = requireLibrary();
        const rel = url.searchParams.get('path');
        if (!rel) { sendError(res, 400, 'Missing path'); return; }
        const abs = await resolveSafeRead(rel, root);
        const data = await fs.readFile(abs);
        send(res, 200, data, { 'Content-Type': 'application/pdf' });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/library/save') {
        const root = requireLibrary();
        const body = await readJson<{ sourcePath?: string; modifications?: unknown; outputName?: string }>(req);
        if (!body.sourcePath || !body.outputName || !body.modifications) {
          sendError(res, 400, 'Missing sourcePath, outputName, or modifications');
          return;
        }
        const sourceAbs = await resolveSafeRead(body.sourcePath, root);
        const outputAbs = await resolveSafeWrite(body.outputName, root);
        // Reuse the existing service implementation
        await deps.pdfService.applyModificationsToPDF(
          sourceAbs,
          body.modifications as Parameters<PDFService['applyModificationsToPDF']>[1],
          outputAbs
        );
        const saved = await fs.readFile(outputAbs);
        send(res, 200, saved, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${path.basename(outputAbs)}"`,
          'Content-Length': String(saved.length),
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/pdf/info') {
        const root = requireLibrary();
        const rel = url.searchParams.get('path');
        if (!rel) { sendError(res, 400, 'Missing path'); return; }
        const abs = await resolveSafeRead(rel, root);
        const info = await deps.pdfService.getDocumentInfo(abs);
        sendJson(res, 200, info);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/pdf/page-text') {
        const root = requireLibrary();
        const rel = url.searchParams.get('path');
        const pageStr = url.searchParams.get('page');
        if (!rel || !pageStr) { sendError(res, 400, 'Missing path or page'); return; }
        const page = parseInt(pageStr, 10);
        if (!Number.isFinite(page) || page < 1) { sendError(res, 400, 'Invalid page'); return; }
        const abs = await resolveSafeRead(rel, root);
        const lines = await deps.pdfService.getPageStructuredText(abs, page);
        sendJson(res, 200, lines);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/annotations') {
        const root = requireLibrary();
        const rel = url.searchParams.get('path');
        if (!rel) { sendError(res, 400, 'Missing path'); return; }
        const abs = await resolveSafeRead(rel, root);
        const sidecar = sidecarPathFor(abs);
        try {
          const data = await fs.readFile(sidecar, 'utf-8');
          send(res, 200, data, { 'Content-Type': 'application/json; charset=utf-8' });
        } catch {
          sendJson(res, 200, null);
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/annotations') {
        const root = requireLibrary();
        const body = await readJson<{ path?: string; annotations?: unknown }>(req);
        if (!body.path || body.annotations === undefined) {
          sendError(res, 400, 'Missing path or annotations');
          return;
        }
        const abs = await resolveSafeRead(body.path, root);
        const sidecar = sidecarPathFor(abs);
        await fs.writeFile(sidecar, JSON.stringify(body.annotations, null, 2), 'utf-8');
        sendJson(res, 200, { sidecarPath: sidecar });
        return;
      }

      sendError(res, 404, 'Not found');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isPathErr = message.includes('outside library') || message.includes('Library folder');
      const isBodyErr = message.includes('Body too large');
      const status = isPathErr ? 403 : isBodyErr ? 413 : 500;
      try { sendError(res, status, message); } catch { /* ignore */ }
    }
  };
}
