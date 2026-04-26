// Public API for the text-editing engine. Phase 4a: read-only locator.
//
// `locateTextEdit` is the single entry point for the renderer. It opens the
// PDF, reads the target page's content stream, runs the tokenizer +
// interpreter + locator, and returns a serializable description of which
// content-stream operator(s) produced the user's clicked line.
//
// Encoding limitation (Phase 4a only): the FontResolver here is Latin1, so
// any text using a non-Latin1 encoding (CID Identity-H, MacRoman with
// Differences, etc.) will fail to match in the locator. That's expected —
// real encoding lives in Phase 4c. Until then, the IPC reports lower
// confidence on those lines and the editor falls back to the legacy path.

import * as fs from 'fs/promises';
import { tokenize } from './interpreter/Tokenizer';
import { interpret } from './interpreter/Interpreter';
import { locateRun, type TargetLine } from './locator/Locator';
import type { FontResolver, RgbColor } from './interpreter/types';

/**
 * Serializable description of a located run for IPC. Drops Uint8Array fields
 * (which can't cross IPC cleanly) — those are recovered server-side when an
 * actual edit fires.
 */
export interface LocatedRunPayload {
  text: string;
  operator: 'Tj' | 'TJ' | "'" | '"';
  opStart: number;
  opEnd: number;
  operandStart?: number;
  operandEnd?: number;
  isHex?: boolean;
  fontResourceName: string;
  fontSize: number;
  fillColor: RgbColor;
  strokeColor: RgbColor;
  inXObject: boolean;
  /** For TJ runs: the array elements with byte ranges (kerning preserved). */
  tjArray?: Array<
    | {
        kind: 'string';
        text: string;
        operandStart: number;
        operandEnd: number;
        isHex: boolean;
      }
    | { kind: 'kern'; value: number }
  >;
}

export interface LocateTextEditResult {
  runs: LocatedRunPayload[];
  confidence: number;
  reason?: string;
  /** Total content-stream byte size — useful for sanity-checking byte ranges. */
  contentStreamSize: number;
  /** Page width and height in PDF user units — for renderer-side coord math. */
  pageWidth: number;
  pageHeight: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _mupdf: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMupdf(): Promise<any> {
  if (_mupdf === null) {
    // ESM-only package; load via dynamic import from CJS.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const mod = (await new Function('return import("mupdf")')()) as { default?: unknown };
    _mupdf = (mod.default ?? mod) as ReturnType<typeof getMupdf>;
  }
  return _mupdf;
}

/**
 * Locate the content-stream operator(s) that produced a given target line.
 *
 * Pass the target line straight from `getPageStructuredText` so the bbox
 * and text the locator sees are exactly what mupdf reported to the UI.
 */
export async function locateTextEdit(
  filePath: string,
  pageNumber: number,
  target: { bbox: { x: number; y: number; w: number; h: number }; text: string; fontSize?: number }
): Promise<LocateTextEditResult> {
  const mupdf = await getMupdf();
  const pdfBytes = await fs.readFile(filePath);
  const doc = mupdf.PDFDocument.openDocument(pdfBytes, 'application/pdf');

  try {
    const page = doc.loadPage(pageNumber - 1);
    const bounds = page.getBounds() as [number, number, number, number];
    const pageWidth = bounds[2] - bounds[0];
    const pageHeight = bounds[3] - bounds[1];

    const contentBytes = readPageContentStream(page);
    if (contentBytes === null || contentBytes.length === 0) {
      return {
        runs: [],
        confidence: 0,
        reason: 'page has no content stream',
        contentStreamSize: 0,
        pageWidth,
        pageHeight,
      };
    }

    const { tokens } = tokenize(contentBytes);
    const resolver: FontResolver = { decodeText: (_n, b) => latin1(b) };
    const { events } = interpret(tokens, resolver);

    const targetLine: TargetLine = {
      bbox: target.bbox,
      text: target.text,
      pageHeight,
      fontSize: target.fontSize,
    };
    const located = locateRun(events, targetLine);

    return {
      runs: located.runs.map((r) => ({
        text: r.text,
        operator: r.operator,
        opStart: r.opStart,
        opEnd: r.opEnd,
        operandStart: r.operandStart,
        operandEnd: r.operandEnd,
        isHex: r.isHex,
        fontResourceName: r.fontResourceName,
        fontSize: r.fontSize,
        fillColor: r.fillColor,
        strokeColor: r.strokeColor,
        inXObject: r.inXObject,
        tjArray: r.tjArray?.map((it) =>
          it.kind === 'string'
            ? {
                kind: 'string' as const,
                text: it.text,
                operandStart: it.operandStart,
                operandEnd: it.operandEnd,
                isHex: it.isHex,
              }
            : { kind: 'kern' as const, value: it.value }
        ),
      })),
      confidence: located.confidence,
      reason: located.reason,
      contentStreamSize: contentBytes.length,
      pageWidth,
      pageHeight,
    };
  } finally {
    try {
      doc.destroy?.();
    } catch {
      // mupdf cleanup is best-effort.
    }
  }
}

/**
 * Read and concatenate a page's /Contents stream(s). PDF allows /Contents
 * to be either a single stream or an array of streams; mupdf returns
 * decoded (filter-applied) bytes via `readStream()`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readMupdfStreamBytes(streamObj: any): Uint8Array {
  // mupdf's `readStream()` returns its own `Buffer` class (not a Node
  // Buffer). Use `asUint8Array()` to get the actual bytes.
  const buf = streamObj.readStream();
  if (buf && typeof buf.asUint8Array === 'function') return buf.asUint8Array();
  if (buf instanceof Uint8Array) return buf;
  const len: number = (buf?.length as number) ?? 0;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = (buf[i] ?? 0) as number;
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readPageContentStream(page: any): Uint8Array | null {
  const pageDict = page.getObject();
  const contents = pageDict.get('Contents');
  if (!contents || contents.isNull?.()) return null;

  if (contents.isStream?.()) {
    return readMupdfStreamBytes(contents);
  }

  if (contents.isArray?.()) {
    const parts: Uint8Array[] = [];
    contents.forEach((val: unknown) => {
      const v = val as { isStream?: () => boolean };
      if (v?.isStream?.()) parts.push(readMupdfStreamBytes(v));
    });
    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0];

    let total = 0;
    for (const p of parts) total += p.length;
    total += parts.length - 1; // separator bytes
    const out = new Uint8Array(total);
    let off = 0;
    for (let i = 0; i < parts.length; i++) {
      out.set(parts[i], off);
      off += parts[i].length;
      if (i < parts.length - 1) {
        out[off] = 0x20;
        off += 1;
      }
    }
    return out;
  }

  return null;
}

function latin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}
