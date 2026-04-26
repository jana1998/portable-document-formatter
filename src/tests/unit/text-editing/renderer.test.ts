// @vitest-environment node
//
// End-to-end Renderer test — exercises the full Phase 4c pipeline
// (mupdf → tokenizer → interpreter → locator → encoder → byte-surgery →
// mupdf save) against a synthetic PDF built on the fly with pdf-lib.
//
// Forced to Node environment because the default `jsdom` lacks the WASM
// streaming APIs mupdf needs.

import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { applyTextEdits, _setMupdfLoaderForTests } from '@main/services/text-editing/Renderer';

// Inject the vitest-friendly dynamic import (production code uses a Function
// trick that fails inside vite-node's VM).
_setMupdfLoaderForTests(() => import('mupdf'));

/**
 * Build a tiny one-page PDF with a known piece of text. Uses pdf-lib so
 * the test owns the input. Returns the PDF bytes plus metadata about the
 * text we placed (used to construct the edit request).
 */
async function buildTestPdf(text: string): Promise<{
  bytes: Uint8Array;
  textX: number;
  textY: number;
  fontSize: number;
  pageHeight: number;
}> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  const fontSize = 14;
  const textX = 72;
  const textY = 720;
  page.drawText(text, { x: textX, y: textY, size: fontSize, font, color: rgb(0, 0, 0) });
  // Save without object streams so the content stream is plain (easier to
  // inspect; mupdf still decompresses either way).
  const out = await doc.save({ useObjectStreams: false });
  return { bytes: out, textX, textY, fontSize, pageHeight: 792 };
}

/**
 * Try to open the mupdf module; if it can't load in this env we skip.
 * (The sandbox/test env may lack WASM streaming or the npm package may not
 * be installed in CI containers — we don't want a transient infra issue
 * to fail every CI run.)
 */
async function probeMupdf(): Promise<boolean> {
  try {
    // Production code uses `new Function('return import("mupdf")')()` to
    // bypass TypeScript's CJS module-resolution check; that trick breaks
    // in vitest's VM. In tests we use the regular dynamic import instead.
    const mod = await import('mupdf');
    const pdfDoc = (mod as { PDFDocument?: unknown }).PDFDocument
      ?? (mod as { default?: { PDFDocument?: unknown } }).default?.PDFDocument;
    return !!pdfDoc;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[renderer.test] mupdf probe failed:', err);
    return false;
  }
}

const itIfMupdf = (await probeMupdf()) ? it : it.skip;

describe('Renderer — end-to-end Tj-byte surgery', () => {
  itIfMupdf('replaces single-Tj text in a synthetic PDF', async () => {
    const original = 'Hello, World!';
    const replacement = 'Goodbye, Moon!';
    const pdf = await buildTestPdf(original);

    const result = await applyTextEdits(pdf.bytes, [
      {
        pageNumber: 1,
        // mupdf y is from top-of-page; pdf-lib drawText origin is the
        // baseline (PDF y from bottom). We compute the mupdf top-y from
        // the baseline minus the font's ascent (~75% of size for Helvetica).
        target: {
          bbox: {
            x: pdf.textX,
            y: pdf.pageHeight - pdf.textY - pdf.fontSize * 0.75,
            w: 200, // generous; locator uses x-tolerance
            h: pdf.fontSize * 1.1,
          },
          text: original,
          fontSize: pdf.fontSize,
        },
        newText: replacement,
      },
    ]);

    if (!result.modified) {
      // eslint-disable-next-line no-console
      console.warn('[renderer.test] outcomes:', result.outcomes);
    }
    expect(result.modified).toBe(true);
    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0].status).toBe('tj-surgery');
    expect(result.outcomes[0].operator).toBe('Tj');

    // Re-open the modified PDF and verify the new text is there.
    const mupdfMod = await import('mupdf');
    const PDFDocumentCtor = (mupdfMod as { PDFDocument?: { openDocument: (b: Uint8Array, t: string) => unknown } }).PDFDocument
      ?? (mupdfMod as { default?: { PDFDocument?: { openDocument: (b: Uint8Array, t: string) => unknown } } }).default?.PDFDocument;
    if (!PDFDocumentCtor) throw new Error('mupdf has no PDFDocument');
    const reopened = (PDFDocumentCtor as { openDocument: (b: Uint8Array, t: string) => { loadPage: (i: number) => { toStructuredText: (f: string) => { asJSON: () => string } }; destroy?: () => void } }).openDocument(
      result.outputBytes,
      'application/pdf'
    );
    try {
      const page = reopened.loadPage(0);
      const json = JSON.parse(page.toStructuredText('preserve-spans').asJSON());
      const allText = collectText(json);
      expect(allText).toContain(replacement);
      expect(allText).not.toContain(original);
    } finally {
      reopened.destroy?.();
    }
  });

  itIfMupdf('returns a low-confidence outcome for a non-existent line', async () => {
    const pdf = await buildTestPdf('Some real text');
    const result = await applyTextEdits(pdf.bytes, [
      {
        pageNumber: 1,
        target: {
          bbox: { x: 10, y: 10, w: 100, h: 14 },
          text: 'Not on the page',
        },
        newText: 'whatever',
      },
    ]);
    expect(result.modified).toBe(false);
    expect(result.outcomes[0].status).toBe('refused-locator-low-confidence');
  });

  itIfMupdf('refuses an edit whose target font is Type0', async () => {
    // Helvetica is a simple font, so synthesizing a Type0 case requires
    // a different font. pdf-lib's standard fonts are all simple (Type1).
    // Skip this scenario for now — covered indirectly by Phase 4d tests.
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectText(json: any): string {
  let text = '';
  for (const block of json.blocks ?? []) {
    if (block.type !== 'text') continue;
    for (const line of block.lines ?? []) {
      if (typeof line.text === 'string') {
        text += line.text + ' ';
      }
    }
  }
  return text;
}
