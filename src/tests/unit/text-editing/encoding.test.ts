// Encoding tests — GlyphList, StandardEncodings, EncodingResolver,
// SimpleFontEncoder, Subset detection.

import { describe, expect, it } from 'vitest';
import {
  glyphNameToUnicode,
  unicodeToGlyphName,
} from '@main/services/text-editing/encoding/GlyphList';
import {
  getStandardEncoding,
  isStandardEncodingName,
} from '@main/services/text-editing/encoding/StandardEncodings';
import { resolveEncoding } from '@main/services/text-editing/encoding/EncodingResolver';
import {
  encodeSimpleFontText,
  inspectSubsetCoverage,
} from '@main/services/text-editing/encoding/SimpleFontEncoder';

describe('GlyphList', () => {
  it('maps common glyph names to Unicode', () => {
    expect(glyphNameToUnicode('A')).toBe(0x41);
    expect(glyphNameToUnicode('a')).toBe(0x61);
    expect(glyphNameToUnicode('space')).toBe(0x20);
    expect(glyphNameToUnicode('eacute')).toBe(0x00e9);
    expect(glyphNameToUnicode('emdash')).toBe(0x2014);
    expect(glyphNameToUnicode('Euro')).toBe(0x20ac);
  });

  it('returns null for unknown glyph names', () => {
    expect(glyphNameToUnicode('totallyMadeUp')).toBeNull();
    expect(glyphNameToUnicode('')).toBeNull();
  });

  it('decodes Adobe "uniXXXX" naming convention', () => {
    expect(glyphNameToUnicode('uni00E9')).toBe(0x00e9);
    expect(glyphNameToUnicode('uni20AC')).toBe(0x20ac);
  });

  it('decodes Adobe "uXXXXXX" naming convention', () => {
    expect(glyphNameToUnicode('u00E9')).toBe(0x00e9);
    expect(glyphNameToUnicode('u1F600')).toBe(0x1f600); // grinning face emoji
  });

  it('reverses common codepoints to glyph names', () => {
    expect(unicodeToGlyphName(0x41)).toBe('A');
    expect(unicodeToGlyphName(0x00e9)).toBe('eacute');
    expect(unicodeToGlyphName(0x2014)).toBe('emdash');
  });

  it('returns null for unmapped codepoints', () => {
    expect(unicodeToGlyphName(0x4e00)).toBeNull(); // CJK ideograph 一
  });
});

describe('StandardEncodings', () => {
  it('identifies the four standard encoding names', () => {
    expect(isStandardEncodingName('WinAnsiEncoding')).toBe(true);
    expect(isStandardEncodingName('MacRomanEncoding')).toBe(true);
    expect(isStandardEncodingName('MacExpertEncoding')).toBe(true);
    expect(isStandardEncodingName('StandardEncoding')).toBe(true);
    expect(isStandardEncodingName('NonsenseEncoding')).toBe(false);
  });

  it('WinAnsi maps ASCII printable correctly', () => {
    const enc = getStandardEncoding('WinAnsiEncoding');
    expect(enc[0x41]).toBe('A');
    expect(enc[0x20]).toBe('space');
    expect(enc[0x7e]).toBe('asciitilde');
  });

  it('WinAnsi maps the 0x80..0x9F block (CP1252 extensions)', () => {
    const enc = getStandardEncoding('WinAnsiEncoding');
    expect(enc[0x80]).toBe('Euro');
    expect(enc[0x91]).toBe('quoteleft');
    expect(enc[0x96]).toBe('endash');
    expect(enc[0x97]).toBe('emdash');
  });

  it('WinAnsi maps Latin-1 supplement (0xA0..0xFF)', () => {
    const enc = getStandardEncoding('WinAnsiEncoding');
    expect(enc[0xe9]).toBe('eacute');
    expect(enc[0xc9]).toBe('Eacute');
    expect(enc[0xdf]).toBe('germandbls');
  });

  it('MacRoman differs from WinAnsi in the upper range', () => {
    const win = getStandardEncoding('WinAnsiEncoding');
    const mac = getStandardEncoding('MacRomanEncoding');
    // Same in ASCII
    expect(win[0x41]).toBe(mac[0x41]);
    // Different in upper range — 0x8E in WinAnsi is Zcaron, in MacRoman is eacute
    expect(win[0x8e]).toBe('Zcaron');
    expect(mac[0x8e]).toBe('eacute');
  });

  it('StandardEncoding has only the ASCII base + a few overrides', () => {
    const enc = getStandardEncoding('StandardEncoding');
    expect(enc[0x41]).toBe('A');
    // Standard's 0xA1 is exclamdown (matches), 0xE1 is AE (different from Win)
    expect(enc[0xe1]).toBe('AE');
    // Most of 0x80..0x9F is undefined in StandardEncoding
    expect(enc[0x80]).toBeUndefined();
    expect(enc[0x90]).toBeUndefined();
  });
});

describe('resolveEncoding — simple fonts', () => {
  it('TrueType + WinAnsiEncoding produces a populated table', () => {
    const r = resolveEncoding({
      baseFont: 'Helvetica',
      subtype: 'TrueType',
      encoding: 'WinAnsiEncoding',
    });
    expect(r.kind).toBe('simple-winansi');
    expect(r.bytesPerCode).toBe(1);
    expect(r.encodable).toBe(true);
    expect(r.codeToUnicode.get(0x41)).toBe('A');
    expect(r.codeToUnicode.get(0xe9)).toBe('é');
    expect(r.unicodeToCode.get('é')).toBe(0xe9);
    expect(r.isSubset).toBe(false);
  });

  it('detects subsetted /BaseFont (XXXXXX+ prefix)', () => {
    const r = resolveEncoding({
      baseFont: 'ABCDEF+Helvetica',
      subtype: 'TrueType',
      encoding: 'WinAnsiEncoding',
    });
    expect(r.isSubset).toBe(true);
    // codeToUnicode is still populated — caller decides whether the typed
    // chars actually fit the subset (we don't know what the subset contains
    // without the embedded font program).
    expect(r.codeToUnicode.size).toBeGreaterThan(0);
  });

  it('Type1 with no /Encoding falls back to StandardEncoding', () => {
    const r = resolveEncoding({
      baseFont: 'Helvetica',
      subtype: 'Type1',
    });
    expect(r.kind).toBe('simple-standard');
    expect(r.codeToUnicode.get(0x41)).toBe('A');
  });

  it('TrueType with no /Encoding falls back to WinAnsiEncoding', () => {
    const r = resolveEncoding({
      baseFont: 'Arial',
      subtype: 'TrueType',
    });
    expect(r.kind).toBe('simple-winansi');
    expect(r.codeToUnicode.get(0xe9)).toBe('é');
  });

  it('applies /Differences overrides on top of the base encoding', () => {
    // Override byte 0x80 to be "Adieresis" (Ä) instead of WinAnsi's "Euro"
    const r = resolveEncoding({
      baseFont: 'Helvetica',
      subtype: 'TrueType',
      encoding: {
        baseEncoding: 'WinAnsiEncoding',
        differences: [
          { kind: 'code', value: 0x80 },
          { kind: 'name', value: 'Adieresis' },
        ],
      },
    });
    expect(r.codeToUnicode.get(0x80)).toBe('Ä');
    // Other WinAnsi entries remain untouched
    expect(r.codeToUnicode.get(0xe9)).toBe('é');
  });

  it('/Differences without a base encoding only populates declared bytes', () => {
    const r = resolveEncoding({
      baseFont: 'CustomFont',
      subtype: 'Type3',
      encoding: {
        differences: [
          { kind: 'code', value: 65 },
          { kind: 'name', value: 'A' },
          { kind: 'name', value: 'B' },
          { kind: 'code', value: 100 },
          { kind: 'name', value: 'C' },
        ],
      },
    });
    expect(r.kind).toBe('simple-custom');
    expect(r.codeToUnicode.get(65)).toBe('A');
    expect(r.codeToUnicode.get(66)).toBe('B'); // auto-incremented
    expect(r.codeToUnicode.get(100)).toBe('C'); // after reset to 100
    expect(r.codeToUnicode.get(64)).toBeUndefined(); // not declared
  });

  it('reports glyphs missing from the AGL as not encoded', () => {
    const r = resolveEncoding({
      baseFont: 'CustomFont',
      subtype: 'Type1',
      encoding: {
        differences: [
          { kind: 'code', value: 200 },
          { kind: 'name', value: 'aMadeUpGlyphName' }, // unknown to AGL
        ],
      },
    });
    expect(r.codeToUnicode.has(200)).toBe(false);
  });
});

describe('resolveEncoding — Type0 fonts (Phase 4d marker)', () => {
  it('detects Identity-H', () => {
    const r = resolveEncoding({
      baseFont: 'XXXXXX+SimSun',
      subtype: 'Type0',
      encoding: 'Identity-H',
    });
    expect(r.kind).toBe('identity-h');
    expect(r.bytesPerCode).toBe(2);
    expect(r.encodable).toBe(false);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('detects Identity-V', () => {
    const r = resolveEncoding({
      baseFont: 'XXXXXX+SomeFont',
      subtype: 'Type0',
      encoding: 'Identity-V',
    });
    expect(r.kind).toBe('identity-v');
  });

  it('classifies a custom CMap', () => {
    const r = resolveEncoding({
      baseFont: 'Foo',
      subtype: 'Type0',
      encoding: 'GB-EUC-H',
    });
    expect(r.kind).toBe('cmap');
    expect(r.encodable).toBe(false);
  });
});

describe('encodeSimpleFontText', () => {
  const winansi = resolveEncoding({
    baseFont: 'Helvetica',
    subtype: 'TrueType',
    encoding: 'WinAnsiEncoding',
  });

  it('encodes plain ASCII to one byte per character', () => {
    const r = encodeSimpleFontText('Hello', winansi);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(Array.from(r.bytes)).toEqual([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
  });

  it('encodes Latin-1 supplement characters via WinAnsi', () => {
    const r = encodeSimpleFontText('café', winansi);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(Array.from(r.bytes)).toEqual([0x63, 0x61, 0x66, 0xe9]);
  });

  it('encodes WinAnsi extensions (Euro, em-dash, smart quotes)', () => {
    // Use \u escapes so the literal isn't ambiguous with the editor's
    // straight-quote rendering.
    const r = encodeSimpleFontText('€—“a”', winansi);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    // Euro=0x80, emdash=0x97, quotedblleft=0x93, a=0x61, quotedblright=0x94
    expect(Array.from(r.bytes)).toEqual([0x80, 0x97, 0x93, 0x61, 0x94]);
  });

  it('reports missing characters that aren\'t in WinAnsi', () => {
    const r = encodeSimpleFontText('日本語', winansi);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.missing).toEqual(['日', '本', '語']);
    expect(r.reason).toContain('cannot encode');
  });

  it('refuses to encode for non-1-byte encodings', () => {
    const identity = resolveEncoding({
      baseFont: 'XXXXXX+Sun',
      subtype: 'Type0',
      encoding: 'Identity-H',
    });
    const r = encodeSimpleFontText('text', identity);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.reason).toContain('1');
  });
});

describe('inspectSubsetCoverage', () => {
  const subsetWinansi = resolveEncoding({
    baseFont: 'ABCDEF+Helvetica',
    subtype: 'TrueType',
    encoding: 'WinAnsiEncoding',
  });

  it('detects subset prefix and strips for real-font lookup', () => {
    const r = inspectSubsetCoverage('Hello', subsetWinansi);
    expect(r.isSubset).toBe(true);
    expect(r.realFontName).toBe('Helvetica');
    expect(r.missing).toEqual([]);
  });

  it('flags characters not in the encoding', () => {
    const r = inspectSubsetCoverage('Hello 日本', subsetWinansi);
    expect(r.missing).toEqual(['日', '本']);
  });

  it('returns clean report for non-subset fonts', () => {
    const fullWinansi = resolveEncoding({
      baseFont: 'Helvetica',
      subtype: 'TrueType',
      encoding: 'WinAnsiEncoding',
    });
    const r = inspectSubsetCoverage('Hello', fullWinansi);
    expect(r.isSubset).toBe(false);
    expect(r.realFontName).toBe('Helvetica');
  });
});

describe('Encoding integration — byte → glyph name → Unicode', () => {
  it('WinAnsi: byte 0x65 → "e" → U+0065', () => {
    const enc = getStandardEncoding('WinAnsiEncoding');
    const glyph = enc[0x65];
    expect(glyph).toBe('e');
    expect(glyphNameToUnicode(glyph!)).toBe(0x65);
  });

  it('WinAnsi: byte 0xE9 → "eacute" → U+00E9', () => {
    const enc = getStandardEncoding('WinAnsiEncoding');
    const glyph = enc[0xe9];
    expect(glyph).toBe('eacute');
    expect(glyphNameToUnicode(glyph!)).toBe(0x00e9);
  });

  it('WinAnsi: byte 0x80 → "Euro" → U+20AC', () => {
    const enc = getStandardEncoding('WinAnsiEncoding');
    const glyph = enc[0x80];
    expect(glyph).toBe('Euro');
    expect(glyphNameToUnicode(glyph!)).toBe(0x20ac);
  });
});
