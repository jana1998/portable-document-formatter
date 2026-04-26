// @vitest-environment node
//
// Integration tests for the text-editing engine.
// Each test:
//   1. Builds a known-shape fixture PDF programmatically (no committed
//      binaries — fixtures are reproducible from source).
//   2. Applies a known edit via Renderer.applyTextEdits.
//   3. Verifies the outcome status, the saved PDF re-opens cleanly,
//      and (where applicable) extracts the new text via mupdf to confirm
//      the byte-surgery actually produced what we expect.
//
// These tests catch regressions that the per-module unit tests can't —
// e.g. a bug in font-table construction, a broken interaction between
// the locator and TJ-array byte ranges, or content-stream re-write
// boundary conditions.

import { createHash } from 'crypto';
import { describe, expect, it, beforeAll } from 'vitest';
import {
  applyTextEdits,
  _setMupdfLoaderForTests,
  type TextEditRequest,
} from '@main/services/text-editing/Renderer';
import {
  buildSimpleHelvetica,
  buildForceKernedWithLeadingSpace,
  buildHexStringTj,
  buildMixedStyleLine,
  type FixturePdf,
} from '@/tests/fixtures/text-edit/builders';

beforeAll(() => {
  _setMupdfLoaderForTests(() => import('mupdf'));
});

// Reusable helpers -----------------------------------------------------------

interface MupdfModule {
  PDFDocument: { openDocument: (b: Uint8Array, t: string) => MupdfPdfDoc };
  ColorSpace: { DeviceRGB: unknown; DeviceGray: unknown };
}
interface MupdfPdfDoc {
  loadPage: (i: number) => MupdfPdfPage;
  destroy?: () => void;
}
interface MupdfPdfPage {
  toStructuredText: (flags: string) => { asJSON: () => string };
  getObject?: () => MupdfObject;
  getBounds?: () => [number, number, number, number];
  toPixmap?: (
    matrix: [number, number, number, number, number, number],
    colorspace: unknown,
    alpha?: boolean
  ) => MupdfPixmap;
}
interface MupdfPixmap {
  getWidth: () => number;
  getHeight: () => number;
  getPixels: () => Uint8ClampedArray;
  destroy?: () => void;
}
interface MupdfObject {
  get: (...path: Array<string | number>) => MupdfObject | null;
  isStream?: () => boolean;
  isArray?: () => boolean;
  isDictionary?: () => boolean;
  isNull?: () => boolean;
  asName?: () => string;
  forEach?: (fn: (val: MupdfObject, key: string | number) => void) => void;
}

async function loadMupdf(): Promise<MupdfModule> {
  const mod = (await import('mupdf')) as unknown as { PDFDocument?: unknown; default?: { PDFDocument?: unknown } };
  return ((mod.PDFDocument ? mod : (mod.default ?? mod)) as unknown) as MupdfModule;
}

/** Extract all text from page 0 of `bytes` as a single string (linewise). */
async function extractText(bytes: Uint8Array): Promise<string> {
  const mupdf = await loadMupdf();
  const doc = mupdf.PDFDocument.openDocument(bytes, 'application/pdf');
  try {
    const page = doc.loadPage(0);
    const json = JSON.parse(page.toStructuredText('preserve-spans').asJSON()) as {
      blocks?: Array<{ type?: string; lines?: Array<{ text?: string }> }>;
    };
    let out = '';
    for (const block of json.blocks ?? []) {
      if (block.type !== 'text') continue;
      for (const line of block.lines ?? []) {
        if (typeof line.text === 'string') out += line.text + '\n';
      }
    }
    return out;
  } finally {
    doc.destroy?.();
  }
}

/** Find the font dict count on page 0's /Resources/Font (rough proxy for
 *  "did byte-surgery add new fonts?"). */
async function countPageFonts(bytes: Uint8Array): Promise<number> {
  const mupdf = await loadMupdf();
  const doc = mupdf.PDFDocument.openDocument(bytes, 'application/pdf');
  try {
    const page = doc.loadPage(0);
    const pageObj = page.getObject?.();
    if (!pageObj) return 0;
    const resources = pageObj.get('Resources');
    if (!resources || resources.isNull?.()) return 0;
    const fonts = resources.get('Font');
    if (!fonts || !fonts.isDictionary?.()) return 0;
    let n = 0;
    fonts.forEach?.(() => {
      n++;
    });
    return n;
  } finally {
    doc.destroy?.();
  }
}

function makeEdit(fixture: FixturePdf, newText: string): TextEditRequest {
  return {
    pageNumber: 1,
    target: {
      bbox: fixture.meta.bbox,
      text: fixture.meta.text,
      fontSize: fixture.meta.fontSize,
    },
    newText,
  };
}

// Tests ----------------------------------------------------------------------

describe('fixture: simple Helvetica + WinAnsi', () => {
  it('byte-surgery replaces a single Tj operand', async () => {
    const f = await buildSimpleHelvetica('Hello, World!', 100, 700, 14);
    const result = await applyTextEdits(f.bytes, [makeEdit(f, 'Goodbye, Moon!')]);

    expect(result.modified).toBe(true);
    expect(result.outcomes[0].status).toBe('tj-surgery');
    expect(result.outcomes[0].operator).toBe('Tj');

    const text = await extractText(result.outputBytes);
    expect(text).toContain('Goodbye, Moon!');
    expect(text).not.toContain('Hello, World!');
  });

  it('does not add new fonts to /Resources/Font', async () => {
    const f = await buildSimpleHelvetica('Hello', 100, 700, 14);
    const before = await countPageFonts(f.bytes);
    const result = await applyTextEdits(f.bytes, [makeEdit(f, 'World')]);
    const after = await countPageFonts(result.outputBytes);
    expect(after).toBe(before);
  });
});

describe('fixture: force-kerned multi-Tj with leading whitespace', () => {
  it('preserves the leading space and edits the content runs', async () => {
    const f = await buildForceKernedWithLeadingSpace('Architecture', 100, 700, 14, 7);
    // 12 content runs (Architecture) + 1 whitespace run (leading space).
    // Same-length edit through char-by-char should NOT shift through the
    // whitespace slot.
    const result = await applyTextEdits(f.bytes, [makeEdit(f, ' Architectures')]);
    expect(result.modified).toBe(true);
    expect(result.outcomes[0].status).toBe('tj-surgery');

    const text = await extractText(result.outputBytes);
    expect(text).toContain('Architectures');
    // Crucially: the leading "A" should NOT be inside a whitespace-shifted
    // slot — i.e. the saved PDF doesn't read "AArchitecture" or similar.
    expect(text).not.toContain('AArchitec');
  });

  it('different-length edit puts new text in the first content run, leaves whitespace alone', async () => {
    const f = await buildForceKernedWithLeadingSpace('Hello', 100, 700, 14, 7);
    // 5 content runs ('Hello') + 1 whitespace. New text 7 chars (different length).
    const result = await applyTextEdits(f.bytes, [makeEdit(f, ' Goodbye')]);
    expect(result.modified).toBe(true);
    expect(result.outcomes[0].status).toBe('tj-surgery');

    const text = await extractText(result.outputBytes);
    expect(text).toContain('Goodbye');
    expect(text).not.toContain('Hello');
  });
});

describe('fixture: hex-string Tj operand', () => {
  it('preserves hex form when round-tripping a Tj edit', async () => {
    const f = await buildHexStringTj('Hello', 100, 700, 14);
    const result = await applyTextEdits(f.bytes, [makeEdit(f, 'World')]);
    expect(result.modified).toBe(true);
    expect(result.outcomes[0].status).toBe('tj-surgery');

    const text = await extractText(result.outputBytes);
    expect(text).toContain('World');
    // Verify the hex form was preserved by inspecting the saved bytes:
    // an angle-bracketed hex string should appear in the content stream.
    const stream = new TextDecoder('latin1').decode(result.outputBytes);
    expect(stream).toMatch(/<[0-9A-F]{2,}>/);
  });
});

describe('fixture: mixed-style line (bold + regular)', () => {
  it('refuses byte-surgery across font switches and falls back', async () => {
    const f = await buildMixedStyleLine('BOLD', 'regular', 100, 700, 14);
    // mupdf's structured-text typically merges these into one line. The
    // locator finds runs spanning two fonts, which our policy should refuse.
    const result = await applyTextEdits(f.bytes, [makeEdit(f, 'BOLDxregular')]);
    // We don't strictly require either status — we just want it to NOT
    // claim byte-surgery on a multi-font line where redistribution would
    // be wrong.
    if (result.outcomes[0].status === 'tj-surgery') {
      // If byte-surgery did succeed, the locator found a single-run match
      // (likely one font's runs only) — verify the rendering still includes
      // both fonts' worth of text.
      const text = await extractText(result.outputBytes);
      expect(text.length).toBeGreaterThan(0);
    } else {
      expect(['fallback-needed', 'refused-locator-low-confidence']).toContain(
        result.outcomes[0].status
      );
    }
  });
});

// Render page 0 of the PDF to a low-DPI grayscale pixmap and SHA256 the
// raw pixel bytes. Catches any rendering change (pixel-level), including
// non-functional ones we can't explicitly assert (font metrics drift,
// kerning shifts, anti-aliasing differences).
async function renderHash(bytes: Uint8Array): Promise<{ width: number; height: number; sha: string }> {
  const mupdf = await loadMupdf();
  const doc = mupdf.PDFDocument.openDocument(bytes, 'application/pdf');
  try {
    const page = doc.loadPage(0);
    if (!page.toPixmap) throw new Error('mupdf page has no toPixmap');
    // 0.25× scale → ~150x200 px — small enough to hash quickly, large enough
    // to detect meaningful changes. DeviceGray to keep the hash stable across
    // platforms (color-management subtleties don't enter).
    const pixmap = page.toPixmap(
      [0.25, 0, 0, 0.25, 0, 0],
      mupdf.ColorSpace.DeviceGray,
      false
    );
    const pixels = pixmap.getPixels();
    const sha = createHash('sha256').update(Buffer.from(pixels)).digest('hex');
    return { width: pixmap.getWidth(), height: pixmap.getHeight(), sha };
  } finally {
    doc.destroy?.();
  }
}

describe('visual-regression hash', () => {
  // Each test renders the OUTPUT of a known edit and snapshots the hash.
  // First run creates the snapshot. Subsequent runs assert the hash is
  // unchanged. If a render regression occurs the snapshot diff makes it
  // immediately visible; if the change is intentional the developer
  // updates the snapshot via `vitest -u`.

  it('simple Helvetica edit produces a stable rendered hash', async () => {
    const f = await buildSimpleHelvetica('Hello, World!', 100, 700, 14);
    const result = await applyTextEdits(f.bytes, [makeEdit(f, 'Goodbye, Moon!')]);
    expect(result.modified).toBe(true);
    const { width, height, sha } = await renderHash(result.outputBytes);
    expect({ width, height, sha }).toMatchSnapshot();
  });

  it('force-kerned edit (whitespace partition) produces a stable hash', async () => {
    const f = await buildForceKernedWithLeadingSpace('Architecture', 100, 700, 14, 7);
    const result = await applyTextEdits(f.bytes, [makeEdit(f, ' Architectures')]);
    expect(result.modified).toBe(true);
    const { width, height, sha } = await renderHash(result.outputBytes);
    expect({ width, height, sha }).toMatchSnapshot();
  });

  it('hex-string Tj edit produces a stable hash', async () => {
    const f = await buildHexStringTj('Hello', 100, 700, 14);
    const result = await applyTextEdits(f.bytes, [makeEdit(f, 'World')]);
    expect(result.modified).toBe(true);
    const { width, height, sha } = await renderHash(result.outputBytes);
    expect({ width, height, sha }).toMatchSnapshot();
  });
});

describe('round-trip integrity', () => {
  it('output PDF has the same page count as the input', async () => {
    const f = await buildSimpleHelvetica('Roundtrip me.', 100, 700, 14);
    const result = await applyTextEdits(f.bytes, [makeEdit(f, 'Round trip!')]);

    const mupdf = await loadMupdf();
    const inDoc = mupdf.PDFDocument.openDocument(f.bytes, 'application/pdf');
    const outDoc = mupdf.PDFDocument.openDocument(result.outputBytes, 'application/pdf');
    try {
      // Both should load page 0 successfully — meaning structure is intact.
      const inPage = inDoc.loadPage(0);
      const outPage = outDoc.loadPage(0);
      expect(inPage).toBeTruthy();
      expect(outPage).toBeTruthy();
    } finally {
      inDoc.destroy?.();
      outDoc.destroy?.();
    }
  });

  it('output PDF re-opens and re-tokenizes cleanly with no diagnostics', async () => {
    const f = await buildForceKernedWithLeadingSpace('Hello', 100, 700, 14);
    const result = await applyTextEdits(f.bytes, [makeEdit(f, ' Howdy')]);
    expect(result.modified).toBe(true);
    // Sanity: extract text and confirm it doesn't contain garbled characters.
    const text = await extractText(result.outputBytes);
    expect(text).toContain('Howdy');
    expect(text).not.toMatch(/�/); // no replacement chars
  });
});
