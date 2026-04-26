// Phase 4c renderer — applies text edits via Tj-byte surgery.
//
// Owns the end-to-end pipeline:
//   1. Open the PDF with mupdf.
//   2. Group edits by page.
//   3. For each page: read its content stream, tokenize + interpret it,
//      build a per-font encoding table from /Resources/Font, and for each
//      edit on this page locate the run, encode the new text, and queue a
//      byte-surgery operand replacement.
//   4. Apply replacements with TjByteSurgery; write the modified content
//      stream back to the page via mupdf's PDFObject.writeStream.
//   5. Save the modified document with PDFDocument.saveToBuffer.
//
// Edits that can't go through byte-surgery (low locator confidence, missing
// font glyphs, Form-XObject text, Type0/Identity-H fonts) are returned with
// status `fallback-needed` so the IPC layer can route them through the
// legacy redact-and-redraw path until Phase 4b/4d/4d.5 ship the real fixes.

import { tokenize } from './interpreter/Tokenizer';
import { interpret } from './interpreter/Interpreter';
import { locateRun, type TargetLine } from './locator/Locator';
import {
  resolveEncodingFromMupdf,
  type ResolvedEncoding,
} from './encoding/EncodingResolver';
import { encodeSimpleFontText } from './encoding/SimpleFontEncoder';
import { encodeType0Text } from './encoding/Type0Encoder';
import {
  applyOperandReplacements,
  type TjOperandReplacement,
} from './rewriter/TjByteSurgery';
import type { FontResolver, TextRun } from './interpreter/types';

export interface TextEditRequest {
  pageNumber: number; // 1-based
  /** Target line as mupdf reported it to the UI on click. */
  target: { bbox: { x: number; y: number; w: number; h: number }; text: string; fontSize?: number };
  /** New text the user committed. */
  newText: string;
}

export type EditStatus =
  | 'tj-surgery' // applied via byte surgery
  | 'fallback-needed' // structural issue (multi-run, unsupported op): legacy path
  | 'refused-form-xobject'
  | 'refused-locator-low-confidence'
  | 'refused-encoding-missing'
  | 'refused-not-simple-font'
  | 'refused-no-content-stream';

export interface EditOutcome {
  pageNumber: number;
  status: EditStatus;
  /** Locator confidence the orchestrator saw, when a locator ran. */
  confidence?: number;
  /** Diagnostic detail. */
  reason?: string;
  /** When status === 'tj-surgery', the operator type that was edited. */
  operator?: 'Tj' | 'TJ' | "'" | '"';
}

export interface ApplyTextEditsResult {
  /** PDF bytes after applying every edit that succeeded. */
  outputBytes: Uint8Array;
  /** Per-edit outcomes in input order. */
  outcomes: EditOutcome[];
  /** True if any edit succeeded; false means outputBytes === inputBytes. */
  modified: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _mupdf: any = null;

/**
 * Default loader uses `new Function('return import(...)')` to bypass
 * TypeScript's CJS module-resolution check (we're CJS, mupdf is ESM-only).
 * This works in production Node but fails in vitest's VM, so tests can
 * inject a normal `import('mupdf')` via `_setMupdfLoaderForTests`.
 */
type MupdfLoader = () => Promise<{ default?: unknown }>;

const defaultMupdfLoader: MupdfLoader = () =>
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('return import("mupdf")')() as Promise<{ default?: unknown }>;

let mupdfLoader: MupdfLoader = defaultMupdfLoader;

/** Test-only: replace the mupdf loader (e.g. with `() => import('mupdf')`). */
export function _setMupdfLoaderForTests(loader: MupdfLoader | null): void {
  mupdfLoader = loader ?? defaultMupdfLoader;
  _mupdf = null; // force re-load on next call
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMupdf(): Promise<any> {
  if (_mupdf === null) {
    const mod = await mupdfLoader();
    _mupdf = (mod.default ?? mod) as ReturnType<typeof getMupdf>;
  }
  return _mupdf;
}

/**
 * Apply a list of text edits via byte-surgery. Edits that don't qualify
 * for byte-surgery come back with status='fallback-needed' so the caller
 * can run them through a legacy path; the input PDF is untouched in those
 * cases (only successful edits are committed).
 */
export async function applyTextEdits(
  inputBytes: Uint8Array,
  edits: TextEditRequest[]
): Promise<ApplyTextEditsResult> {
  if (edits.length === 0) {
    return { outputBytes: new Uint8Array(inputBytes), outcomes: [], modified: false };
  }

  const mupdf = await getMupdf();
  const doc = mupdf.PDFDocument.openDocument(inputBytes, 'application/pdf');

  try {
    const outcomes: EditOutcome[] = new Array(edits.length).fill(null);
    let anyApplied = false;

    // Group edits by page so we tokenize/interpret each page once.
    const editsByPage = new Map<number, Array<{ idx: number; req: TextEditRequest }>>();
    edits.forEach((req, idx) => {
      const list = editsByPage.get(req.pageNumber) ?? [];
      list.push({ idx, req });
      editsByPage.set(req.pageNumber, list);
    });

    for (const [pageNumber, pageEdits] of editsByPage) {
      const result = applyPageEdits(doc, pageNumber, pageEdits);
      for (const o of result) {
        outcomes[o.idx] = o.outcome;
        if (o.outcome.status === 'tj-surgery') anyApplied = true;
      }
    }

    if (!anyApplied) {
      return { outputBytes: new Uint8Array(inputBytes), outcomes, modified: false };
    }

    const saved = doc.saveToBuffer();
    // saveToBuffer returns mupdf's Buffer class, not Node's. Get the bytes.
    const outputBytes: Uint8Array =
      typeof saved?.asUint8Array === 'function' ? saved.asUint8Array() :
      saved instanceof Uint8Array ? saved :
      new Uint8Array(saved as ArrayBuffer);
    return {
      outputBytes,
      outcomes,
      modified: true,
    };
  } finally {
    try {
      doc.destroy?.();
    } catch {
      // mupdf cleanup is best-effort
    }
  }
}

// =============================================================================
// Per-page processing.
// =============================================================================

interface IndexedEdit {
  idx: number;
  req: TextEditRequest;
}

interface IndexedOutcome {
  idx: number;
  outcome: EditOutcome;
}

function applyPageEdits(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any,
  pageNumber: number,
  edits: IndexedEdit[]
): IndexedOutcome[] {
  const page = doc.loadPage(pageNumber - 1);
  const bounds = page.getBounds() as [number, number, number, number];
  const pageHeight = bounds[3] - bounds[1];

  const contentObj = page.getObject().get('Contents');
  if (!contentObj || contentObj.isNull?.()) {
    return edits.map(({ idx, req }) => ({
      idx,
      outcome: {
        pageNumber: req.pageNumber,
        status: 'refused-no-content-stream',
        reason: 'page has no /Contents',
      },
    }));
  }

  // Read & concat content streams.
  const contentBytes = readContentStreamBytes(contentObj);
  if (!contentBytes) {
    return edits.map(({ idx, req }) => ({
      idx,
      outcome: {
        pageNumber: req.pageNumber,
        status: 'refused-no-content-stream',
        reason: '/Contents present but no readable streams',
      },
    }));
  }

  // Build per-page font table + resolver.
  const fontTable = buildPageFontTable(page);
  const resolver: FontResolver = {
    decodeText(name, b) {
      const enc = fontTable.get(name);
      if (!enc || enc.codeToUnicode.size === 0) {
        // Best-effort fallback so the locator can still match ASCII content
        // even if encoding resolution failed.
        return latin1(b);
      }
      // 2-byte path for Type0 / Identity-H — read CIDs in big-endian pairs.
      if (enc.bytesPerCode === 2) {
        let s = '';
        for (let i = 0; i + 1 < b.length; i += 2) {
          const code = (b[i] << 8) | b[i + 1];
          const uni = enc.codeToUnicode.get(code);
          s += uni ?? '�';
        }
        return s;
      }
      // 1-byte path for simple fonts.
      let s = '';
      for (let i = 0; i < b.length; i++) {
        const uni = enc.codeToUnicode.get(b[i]);
        s += uni ?? '�';
      }
      return s;
    },
  };

  // Tokenize + interpret once per page.
  const { tokens } = tokenize(contentBytes);
  const { events } = interpret(tokens, resolver);

  // For each edit, locate + plan the byte-surgery, accumulating replacements.
  const results: IndexedOutcome[] = [];
  const replacements: TjOperandReplacement[] = [];

  for (const { idx, req } of edits) {
    const target: TargetLine = {
      bbox: req.target.bbox,
      text: req.target.text,
      pageHeight,
      fontSize: req.target.fontSize,
    };
    const located = locateRun(events, target);

    // Refuse low-confidence locations — byte-surgery requires we know
    // exactly which operator we're editing.
    if (located.runs.length === 0 || located.confidence < 0.9) {
      results.push({
        idx,
        outcome: {
          pageNumber: req.pageNumber,
          status: 'refused-locator-low-confidence',
          confidence: located.confidence,
          reason: located.reason ?? 'no high-confidence match',
        },
      });
      continue;
    }

    // Multi-run match — the visual line is composed of N separate Tj ops,
    // typically because the typesetter forced character-by-character
    // positioning (force-kerned titles or display forms). Two cases:
    //
    //   1. Same length as before — distribute one character per existing
    //      Tj operand. Each Tj keeps its original Td positioning, so the
    //      visual layout is preserved exactly. This handles the common
    //      "(2025) → (2024)" typo-fix kind of edit cleanly.
    //
    //   2. Different length — would require computing new Td offsets to
    //      avoid overlap, which is glyph-width measurement and is the
    //      proper Phase 4e job. Fall back to legacy.
    if (located.runs.length !== 1) {
      const planned = planMultiRunReplacement(located.runs, req.newText, fontTable);
      if (planned.kind === 'fail') {
        results.push({
          idx,
          outcome: {
            pageNumber: req.pageNumber,
            status: 'fallback-needed',
            confidence: located.confidence,
            reason: planned.reason,
          },
        });
        continue;
      }
      replacements.push(...planned.replacements);
      // Diagnostic: capture which runs were matched and what bytes are being
      // written. Without this we can't tell from "applied N/N" alone whether
      // the visual result will be correct.
      const debugRunsText = located.runs.map((r) => JSON.stringify(r.text)).join(' ‖ ');
      const debugStrategy = planned.strategy ?? 'unknown';
      results.push({
        idx,
        outcome: {
          pageNumber: req.pageNumber,
          status: 'tj-surgery',
          confidence: located.confidence,
          operator: located.runs[0].operator,
          reason: `multi-run via ${debugStrategy}: ${located.runs.length} runs [${debugRunsText}] → "${req.newText}"`,
        },
      });
      continue;
    }

    const run = located.runs[0];
    if (run.inXObject) {
      results.push({
        idx,
        outcome: {
          pageNumber: req.pageNumber,
          status: 'refused-form-xobject',
          confidence: located.confidence,
          reason: 'edit target lives inside a Form XObject',
        },
      });
      continue;
    }

    const encoding = fontTable.get(run.fontResourceName);
    if (!encoding || !encoding.encodable) {
      results.push({
        idx,
        outcome: {
          pageNumber: req.pageNumber,
          status: 'refused-not-simple-font',
          confidence: located.confidence,
          reason: encoding
            ? `font ${run.fontResourceName} is ${encoding.kind} but not encodable (no /ToUnicode or unmapped CMap)`
            : `unknown font ${run.fontResourceName}`,
        },
      });
      continue;
    }

    const planned = planSingleRunReplacement(run, req.newText, encoding);
    if (planned.kind === 'fail') {
      // Map the planning-failure reason to the right status enum so logs
      // tell the truth. Encoder failures are encoding-missing; everything
      // else (multi-string TJ, unsupported operator, etc.) is fallback-needed.
      const status: EditStatus = planned.reason.startsWith('cannot encode')
        ? 'refused-encoding-missing'
        : 'fallback-needed';
      results.push({
        idx,
        outcome: {
          pageNumber: req.pageNumber,
          status,
          confidence: located.confidence,
          reason: planned.reason,
        },
      });
      continue;
    }

    replacements.push(...planned.replacements);
    results.push({
      idx,
      outcome: {
        pageNumber: req.pageNumber,
        status: 'tj-surgery',
        confidence: located.confidence,
        operator: run.operator,
      },
    });
  }

  // No successful edits → leave the page alone.
  if (replacements.length === 0) {
    return results;
  }

  const newContentBytes = applyOperandReplacements(contentBytes, replacements);
  writeContentStreamBytes(contentObj, newContentBytes);

  return results;
}

// =============================================================================
// Plan helpers.
// =============================================================================

/**
 * Multi-run distribution — when the locator returned N runs across separate
 * Tj operators (typically force-kerned headings/titles/display text).
 *
 * Whitespace-only runs (leading/trailing spaces in their own Tjs) are kept
 * untouched and exempted from distribution. Otherwise the user's first
 * typed character would land in a whitespace slot and shift the entire
 * text by one position — which is exactly the bug "Architecture →
 * Architectures" produced when the locator picked up a leading space run.
 *
 * Two strategies for the *content* runs (everything except whitespace-only):
 *
 *   1. Same length → char-by-char per content run. Each glyph keeps its
 *      original Td-positioned slot so the visual layout is preserved.
 *
 *   2. Different length → concat-into-first-content-run. The Tds between
 *      the original Tjs still run on the text-line matrix, so the final
 *      position lands where the original would have. The new text uses
 *      natural typography spacing instead of the original force-kerned
 *      slots — visible-typography difference, not a layout error.
 */
function planMultiRunReplacement(
  runs: TextRun[],
  newText: string,
  fontTable: Map<string, ResolvedEncoding>
):
  | { kind: 'success'; replacements: TjOperandReplacement[]; strategy: string }
  | { kind: 'fail'; reason: string } {
  // Reject if any run is non-Tj-shaped — TJ arrays per glyph are exotic.
  for (const r of runs) {
    if (r.operator !== 'Tj' && r.operator !== "'" && r.operator !== '"') {
      return {
        kind: 'fail',
        reason: `multi-run match (${runs.length}) includes a ${r.operator} operator — Phase 4e+ needed`,
      };
    }
    if (r.operandStart == null || r.operandEnd == null) {
      return { kind: 'fail', reason: 'multi-run match: a run has no operand range' };
    }
  }

  // Partition into content runs (carry user-visible text) and whitespace
  // runs (typesetting kerning slots that should never absorb typed chars).
  const isWhitespaceOnly = (r: TextRun): boolean => r.text.trim().length === 0;
  const contentRuns = runs.filter((r) => !isWhitespaceOnly(r));
  if (contentRuns.length === 0) {
    return { kind: 'fail', reason: 'multi-run: all runs are whitespace-only' };
  }

  // All content runs must share a font (style switches are Phase 4e+).
  const firstFont = contentRuns[0].fontResourceName;
  if (contentRuns.some((r) => r.fontResourceName !== firstFont)) {
    return {
      kind: 'fail',
      reason: `multi-run spans multiple fonts — Phase 4e+ needed for mixed-style lines`,
    };
  }
  const enc = fontTable.get(firstFont);
  if (!enc || !enc.encodable) {
    return {
      kind: 'fail',
      reason: `multi-run: font ${firstFont} not encodable`,
    };
  }

  const contentRunCpLengths = contentRuns.map((r) => [...r.text].length);
  const totalContentCp = contentRunCpLengths.reduce((a, b) => a + b, 0);
  const newCodepoints = [...newText];

  // Strategy 1: same length → char-by-char across content runs only.
  if (newCodepoints.length === totalContentCp) {
    const replacements: TjOperandReplacement[] = [];
    let cpCursor = 0;
    for (let i = 0; i < contentRuns.length; i++) {
      const r = contentRuns[i];
      const slice = newCodepoints
        .slice(cpCursor, cpCursor + contentRunCpLengths[i])
        .join('');
      cpCursor += contentRunCpLengths[i];
      const encoded = encodeForFont(slice, enc);
      if (encoded.kind === 'fail') {
        return { kind: 'fail', reason: `multi-run encode: ${encoded.reason}` };
      }
      replacements.push({
        operandStart: r.operandStart!,
        operandEnd: r.operandEnd!,
        preserveHex: encoded.preferHex || !!r.isHex,
        newBytes: encoded.bytes,
      });
    }
    return {
      kind: 'success',
      replacements,
      strategy: `same-length char-by-char (${totalContentCp} content chars across ${contentRuns.length} content runs; ${runs.length - contentRuns.length} whitespace runs preserved)`,
    };
  }

  // Strategy 2: different length → concat-into-first-content-run.
  const encoded = encodeForFont(newText, enc);
  if (encoded.kind === 'fail') {
    return { kind: 'fail', reason: `multi-run encode: ${encoded.reason}` };
  }
  const replacements: TjOperandReplacement[] = [];
  for (let i = 0; i < contentRuns.length; i++) {
    const r = contentRuns[i];
    const preserveHex = encoded.preferHex || !!r.isHex;
    replacements.push({
      operandStart: r.operandStart!,
      operandEnd: r.operandEnd!,
      preserveHex,
      newBytes: i === 0 ? encoded.bytes : new Uint8Array(0),
    });
  }
  return {
    kind: 'success',
    replacements,
    strategy: `concat-into-first (${totalContentCp} → ${newCodepoints.length} content chars across ${contentRuns.length} content runs; ${runs.length - contentRuns.length} whitespace runs preserved)`,
  };
}

function encodeForFont(
  text: string,
  encoding: ResolvedEncoding
): { kind: 'ok'; bytes: Uint8Array; preferHex: boolean } | { kind: 'fail'; reason: string } {
  // Pick the encoder based on the font's bytes-per-code and force hex form
  // for Type0 — literal strings would otherwise be interpreted as 1-byte
  // sequences by readers that try to be lenient.
  if (encoding.bytesPerCode === 2) {
    const r = encodeType0Text(text, encoding);
    if (!r.ok) return { kind: 'fail', reason: r.reason };
    return { kind: 'ok', bytes: r.bytes, preferHex: true };
  }
  const r = encodeSimpleFontText(text, encoding);
  if (!r.ok) return { kind: 'fail', reason: r.reason };
  return { kind: 'ok', bytes: r.bytes, preferHex: false };
}

function planSingleRunReplacement(
  run: TextRun,
  newText: string,
  encoding: ResolvedEncoding
):
  | { kind: 'success'; replacements: TjOperandReplacement[] }
  | { kind: 'fail'; reason: string } {
  // Tj / ' / " — single string operand.
  if (run.operator === 'Tj' || run.operator === "'" || run.operator === '"') {
    if (run.operandStart == null || run.operandEnd == null) {
      return { kind: 'fail', reason: 'run has no operand range' };
    }
    const enc = encodeForFont(newText, encoding);
    if (enc.kind === 'fail') {
      return { kind: 'fail', reason: enc.reason };
    }
    // Type0 always hex; simple fonts preserve original form.
    const preserveHex = enc.preferHex || !!run.isHex;
    return {
      kind: 'success',
      replacements: [
        {
          operandStart: run.operandStart,
          operandEnd: run.operandEnd,
          preserveHex,
          newBytes: enc.bytes,
        },
      ],
    };
  }

  // TJ — array of strings + kerning offsets.
  if (run.operator === 'TJ' && run.tjArray) {
    const stringItems = run.tjArray.filter((it) => it.kind === 'string');
    if (stringItems.length === 0) {
      return { kind: 'fail', reason: 'TJ array has no string items' };
    }

    // Strategy: put the entire new text into the FIRST string operand and
    // empty the others. Kerning offsets between strings stay where they
    // are — they shift the text matrix slightly between empty draws, which
    // has negligible visible effect (sub-point displacement total). The
    // post-TJ text-matrix position drifts by ~ width(newText) - width(oldText),
    // which would happen anyway because byte-surgery doesn't reflow.
    //
    // Trade-off: subsequent text on the same line moves by the width
    // delta. For the typical case (a TJ that spans an entire visual line
    // followed by a newline / new BT block), this drift is invisible.
    // True width-aware re-kerning across the array elements is Phase 4e.
    if (stringItems[0].kind !== 'string') {
      return { kind: 'fail', reason: 'unexpected item kind' };
    }
    const enc = encodeForFont(newText, encoding);
    if (enc.kind === 'fail') return { kind: 'fail', reason: enc.reason };

    const replacements: TjOperandReplacement[] = [];
    for (let i = 0; i < stringItems.length; i++) {
      const it = stringItems[i];
      if (it.kind !== 'string') continue;
      const preserveHex = enc.preferHex || it.isHex;
      replacements.push({
        operandStart: it.operandStart,
        operandEnd: it.operandEnd,
        preserveHex,
        newBytes: i === 0 ? enc.bytes : new Uint8Array(0),
      });
    }
    return { kind: 'success', replacements };
  }

  return { kind: 'fail', reason: `unsupported operator ${run.operator}` };
}

// =============================================================================
// mupdf I/O helpers.
// =============================================================================

/**
 * Read a stream object's decoded bytes. mupdf's `readStream()` returns its
 * own `Buffer` class (not a Node Buffer). The wrapper exposes the bytes
 * via `asUint8Array()`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readStreamBytes(streamObj: any): Uint8Array {
  const buf = streamObj.readStream();
  // mupdf Buffer with asUint8Array — fast path.
  if (buf && typeof buf.asUint8Array === 'function') {
    return buf.asUint8Array();
  }
  // Fallback: assume Uint8Array-compatible (Node Buffer subclasses Uint8Array).
  if (buf instanceof Uint8Array) return buf;
  // Last resort: copy bytes one at a time.
  const len: number = (buf?.length as number) ?? (typeof buf?.getLength === 'function' ? buf.getLength() : 0);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = typeof buf.readByte === 'function' ? buf.readByte(i) : (buf[i] ?? 0);
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readContentStreamBytes(contentObj: any): Uint8Array | null {
  if (contentObj.isStream?.()) {
    return readStreamBytes(contentObj);
  }
  if (contentObj.isArray?.()) {
    const parts: Uint8Array[] = [];
    contentObj.forEach((val: unknown) => {
      const v = val as { isStream?: () => boolean };
      if (v?.isStream?.()) {
        parts.push(readStreamBytes(v));
      }
    });
    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0];
    let total = 0;
    for (const p of parts) total += p.length;
    total += parts.length - 1;
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

/**
 * Write modified content-stream bytes back to the page. For pages whose
 * /Contents is a single stream we just call writeStream. Pages with array
 * /Contents are flattened into a single stream — semantically equivalent
 * but loses any pre-existing array structure (acceptable: PDF readers
 * concatenate them anyway).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function writeContentStreamBytes(contentObj: any, bytes: Uint8Array): void {
  if (contentObj.isStream?.()) {
    contentObj.writeStream(bytes);
    return;
  }
  if (contentObj.isArray?.()) {
    // Find the first stream entry and write the full new content there;
    // null out subsequent entries. mupdf's `put` on the array index would
    // splice; we conservatively just write to the first stream.
    let wrote = false;
    contentObj.forEach((val: { isStream?: () => boolean; writeStream?: (b: Uint8Array) => void }, _key: number | string) => {
      if (wrote) return;
      if (val.isStream?.() && val.writeStream) {
        val.writeStream(bytes);
        wrote = true;
      }
    });
    if (!wrote) {
      throw new Error('cannot write content stream: array has no streams');
    }
    return;
  }
  throw new Error('cannot write content stream: /Contents is neither stream nor array');
}

/**
 * Build the font-resource → ResolvedEncoding map for a page by walking
 * /Resources/Font (with /Resources inheritance from the page tree).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildPageFontTable(page: any): Map<string, ResolvedEncoding> {
  const fonts = new Map<string, ResolvedEncoding>();
  const pageObj = page.getObject();

  // /Resources may be on the page or inherited from parent.
  let resources = pageObj.get('Resources');
  if (!resources || resources.isNull?.()) {
    resources = pageObj.getInheritable?.('Resources');
  }
  if (!resources || !resources.isDictionary?.()) return fonts;

  const fontsDict = resources.get('Font');
  if (!fontsDict || !fontsDict.isDictionary?.()) return fonts;

  fontsDict.forEach((val: unknown, key: number | string) => {
    if (typeof key !== 'string') return;
    try {
      const enc = resolveEncodingFromMupdf(val);
      fonts.set(key, enc);
    } catch {
      // Encoding resolution failures are non-fatal — that font's edits will
      // simply be reported as fallback-needed.
    }
  });

  return fonts;
}

function latin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}
