// Locator tests — verify the mapping from a mupdf "line" to TextRun(s) in
// the content stream.

import { describe, expect, it } from 'vitest';
import { tokenize } from '@main/services/text-editing/interpreter/Tokenizer';
import { interpret } from '@main/services/text-editing/interpreter/Interpreter';
import { locateRun } from '@main/services/text-editing/locator/Locator';
import type {
  FontResolver,
  InterpreterEvent,
} from '@main/services/text-editing/interpreter/types';

const enc = new TextEncoder();
const bytes = (s: string): Uint8Array => enc.encode(s);

const latin1Resolver: FontResolver = {
  decodeText(_n, b) {
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return s;
  },
};

function pipeline(source: string): InterpreterEvent[] {
  const { tokens } = tokenize(bytes(source));
  return interpret(tokens, latin1Resolver).events;
}

const PAGE_HEIGHT = 792; // US letter

/**
 * Helper to compute the mupdf-coord bbox for text at a given PDF origin.
 * mupdf reports y from the top of the page; we approximate the bbox top
 * at a position that the locator can match against the run's baseline.
 */
function mupdfBboxForOrigin(originX: number, originY: number, fontSize: number, width = 100) {
  // PDF y is from bottom; mupdf y is from top. The bbox top (mupdf) is
  // pageHeight - originY - fontSize*ascent. For Helvetica-like fonts
  // ascent ≈ 0.75 * fontSize; we use that as the offset.
  const ascentOffset = fontSize * 0.75;
  return {
    x: originX,
    y: PAGE_HEIGHT - originY - ascentOffset,
    w: width,
    h: fontSize * 1.1, // bbox height includes ascender + descender
  };
}

describe('locator — single run', () => {
  it('exact match returns confidence 1.0', () => {
    const events = pipeline('BT /F1 12 Tf 100 700 Td (Hello, World!) Tj ET');
    const result = locateRun(events, {
      bbox: mupdfBboxForOrigin(100, 700, 12, 80),
      text: 'Hello, World!',
      pageHeight: PAGE_HEIGHT,
      fontSize: 12,
    });
    expect(result.confidence).toBeCloseTo(1.0);
    expect(result.runs.length).toBe(1);
    expect(result.runs[0].text).toBe('Hello, World!');
  });

  it('exact match with extra whitespace normalizes', () => {
    const events = pipeline('BT /F1 12 Tf 100 700 Td (Hello   World) Tj ET');
    const result = locateRun(events, {
      bbox: mupdfBboxForOrigin(100, 700, 12, 80),
      text: 'Hello World',
      pageHeight: PAGE_HEIGHT,
      fontSize: 12,
    });
    expect(result.confidence).toBeCloseTo(1.0);
    expect(result.runs.length).toBe(1);
  });

  it('returns confidence 0 when text is not found', () => {
    const events = pipeline('BT /F1 12 Tf 100 700 Td (Hello) Tj ET');
    const result = locateRun(events, {
      bbox: mupdfBboxForOrigin(100, 700, 12),
      text: 'Goodbye',
      pageHeight: PAGE_HEIGHT,
      fontSize: 12,
    });
    expect(result.confidence).toBe(0);
    expect(result.runs.length).toBe(0);
  });
});

describe('locator — concatenated runs', () => {
  it('combines two consecutive runs that together match', () => {
    // A justified line emitted as two separate TJ ops.
    const events = pipeline(
      [
        'BT /F1 12 Tf 100 700 Td',
        '(Hello ) Tj',
        '(World) Tj',
        'ET',
      ].join('\n')
    );
    const result = locateRun(events, {
      bbox: mupdfBboxForOrigin(100, 700, 12, 100),
      text: 'Hello World',
      pageHeight: PAGE_HEIGHT,
      fontSize: 12,
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.runs.length).toBe(2);
    expect(result.runs[0].text).toBe('Hello ');
    expect(result.runs[1].text).toBe('World');
  });

  it('matches a TJ array as a single run', () => {
    const events = pipeline(
      'BT /F1 12 Tf 100 700 Td [(Hello) -100 (World)] TJ ET'
    );
    const result = locateRun(events, {
      bbox: mupdfBboxForOrigin(100, 700, 12, 100),
      text: 'HelloWorld',
      pageHeight: PAGE_HEIGHT,
      fontSize: 12,
    });
    expect(result.confidence).toBeCloseTo(1.0);
    expect(result.runs.length).toBe(1);
    expect(result.runs[0].operator).toBe('TJ');
    expect(result.runs[0].tjArray?.length).toBe(3);
  });
});

describe('locator — position disambiguation', () => {
  it('picks the run at the matching y-position when text appears twice', () => {
    const events = pipeline(
      [
        'BT /F1 12 Tf',
        '50 700 Td (Foo) Tj', // first occurrence at y=700
        '0 -50 Td (Foo) Tj', // second occurrence at y=650
        'ET',
      ].join('\n')
    );

    // Target the upper occurrence
    const upper = locateRun(events, {
      bbox: mupdfBboxForOrigin(50, 700, 12),
      text: 'Foo',
      pageHeight: PAGE_HEIGHT,
      fontSize: 12,
    });
    expect(upper.confidence).toBeCloseTo(1.0);
    expect(upper.runs.length).toBe(1);
    expect(upper.runs[0].textMatrix[5]).toBe(700);

    // Target the lower occurrence
    const lower = locateRun(events, {
      bbox: mupdfBboxForOrigin(50, 650, 12),
      text: 'Foo',
      pageHeight: PAGE_HEIGHT,
      fontSize: 12,
    });
    expect(lower.confidence).toBeCloseTo(1.0);
    expect(lower.runs[0].textMatrix[5]).toBe(650);
  });
});

describe('locator — fuzzy match', () => {
  it('matches text with a small Levenshtein distance with high confidence', () => {
    const events = pipeline(
      'BT /F1 12 Tf 100 700 Td (Hello World) Tj ET'
    );
    // Off-by-one comma — these tiny edit-distance matches are nearly
    // always the correct run with an encoding edge case (trailing space,
    // soft hyphen, replacement char) — should still qualify for byte-surgery.
    const result = locateRun(events, {
      bbox: mupdfBboxForOrigin(100, 700, 12, 100),
      text: 'Hello, World',
      pageHeight: PAGE_HEIGHT,
      fontSize: 12,
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.runs.length).toBe(1);
    expect(result.reason).toContain('fuzzy match');
  });

  it('drops confidence sharply when Levenshtein distance is large', () => {
    const events = pipeline(
      'BT /F1 12 Tf 100 700 Td (abcdefghij) Tj ET'
    );
    // Distance 2 in 10 chars = 20% — below the 0.9 threshold.
    const result = locateRun(events, {
      bbox: mupdfBboxForOrigin(100, 700, 12, 100),
      text: 'abcdefghxy',
      pageHeight: PAGE_HEIGHT,
      fontSize: 12,
    });
    expect(result.runs.length).toBe(1);
    expect(result.confidence).toBeLessThan(0.9);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('rejects matches with a large Levenshtein distance', () => {
    const events = pipeline(
      'BT /F1 12 Tf 100 700 Td (Hello World) Tj ET'
    );
    const result = locateRun(events, {
      bbox: mupdfBboxForOrigin(100, 700, 12, 100),
      text: 'Goodbye Universe',
      pageHeight: PAGE_HEIGHT,
      fontSize: 12,
    });
    expect(result.confidence).toBe(0);
    expect(result.runs.length).toBe(0);
  });
});

describe('locator — XObject refusal', () => {
  it('ignores text-runs marked as inXObject', () => {
    const buf = bytes('BT /F1 12 Tf 100 700 Td (XObject content) Tj ET');
    const { tokens } = tokenize(buf);
    const { events } = interpret(tokens, latin1Resolver, { inXObject: true });
    const result = locateRun(events, {
      bbox: mupdfBboxForOrigin(100, 700, 12, 100),
      text: 'XObject content',
      pageHeight: PAGE_HEIGHT,
      fontSize: 12,
    });
    // The only available run is in an XObject; locator refuses.
    expect(result.confidence).toBe(0);
    expect(result.reason).toBe('no text-runs in stream');
  });
});

describe('locator — confidence floor for byte-surgery', () => {
  it('1.0 confidence when text + position both match exactly', () => {
    const events = pipeline('BT /F1 12 Tf 100 700 Td (precise) Tj ET');
    const result = locateRun(events, {
      bbox: mupdfBboxForOrigin(100, 700, 12, 50),
      text: 'precise',
      pageHeight: PAGE_HEIGHT,
      fontSize: 12,
    });
    expect(result.confidence).toBe(1.0);
  });

  it('lower confidence when position is unknown but text matches uniquely', () => {
    // Construct a target line whose bbox doesn't overlap any run
    const events = pipeline('BT /F1 12 Tf 100 700 Td (away) Tj ET');
    const result = locateRun(events, {
      bbox: { x: 0, y: 0, w: 10, h: 10 }, // far-off bbox
      text: 'away',
      pageHeight: PAGE_HEIGHT,
      fontSize: 12,
    });
    // No bbox-filtered candidates → text-only fallback with lower ceiling
    expect(result.runs.length).toBe(1);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThan(0.9);
  });
});
