// Type0Encoder tests — encode Unicode → 2-byte CIDs and decode back.

import { describe, expect, it } from 'vitest';
import {
  encodeType0Text,
  decodeType0Text,
} from '@main/services/text-editing/encoding/Type0Encoder';
import type { ResolvedEncoding } from '@main/services/text-editing/encoding/EncodingResolver';

/** Build a fake Type0 ResolvedEncoding by directly seeding the maps. */
function makeType0(
  cidToUnicode: Array<[number, string]>,
  baseFont = 'XXXXXX+TestFont'
): ResolvedEncoding {
  const cu = new Map<number, string>(cidToUnicode);
  const uc = new Map<string, number>();
  for (const [cid, uni] of cidToUnicode) {
    if ([...uni].length === 1 && !uc.has(uni)) uc.set(uni, cid);
  }
  return {
    kind: 'identity-h',
    baseFont,
    isSubset: /^[A-Z]{6}\+/.test(baseFont),
    bytesPerCode: 2,
    codeToUnicode: cu,
    unicodeToCode: uc,
    encodable: cu.size > 0,
    warnings: [],
  };
}

describe('encodeType0Text', () => {
  it('encodes ASCII as 2-byte CIDs (big-endian)', () => {
    // CID 0x0042 = 'B', 0x0073 = 's'
    const enc = makeType0([
      [0x0042, 'B'],
      [0x0073, 's'],
    ]);
    const r = encodeType0Text('Bs', enc);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(Array.from(r.bytes)).toEqual([0x00, 0x42, 0x00, 0x73]);
  });

  it('encodes a multi-character string as a sequence of CIDs', () => {
    const enc = makeType0([
      [0x0048, 'H'],
      [0x0065, 'e'],
      [0x006c, 'l'],
      [0x006f, 'o'],
    ]);
    const r = encodeType0Text('Hello', enc);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(Array.from(r.bytes)).toEqual([
      0x00, 0x48, // H
      0x00, 0x65, // e
      0x00, 0x6c, // l
      0x00, 0x6c, // l
      0x00, 0x6f, // o
    ]);
  });

  it('encodes BMP non-ASCII characters', () => {
    // CID 0x4e2d = '中' (Chinese character)
    const enc = makeType0([[0x4e2d, '中']]);
    const r = encodeType0Text('中', enc);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(Array.from(r.bytes)).toEqual([0x4e, 0x2d]);
  });

  it('reports missing characters', () => {
    const enc = makeType0([
      [0x0048, 'H'],
      [0x0065, 'e'],
    ]);
    const r = encodeType0Text('Help', enc);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.missing).toEqual(['l', 'p']);
  });

  it('does not double-report repeated missing characters', () => {
    const enc = makeType0([[0x0048, 'H']]);
    const r = encodeType0Text('Hxxxxxx', enc);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.missing).toEqual(['x']);
  });

  it('refuses to encode for 1-byte encodings', () => {
    const fake1byte: ResolvedEncoding = {
      ...makeType0([[0x41, 'A']]),
      bytesPerCode: 1,
    };
    const r = encodeType0Text('A', fake1byte);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.reason).toContain('2');
  });

  it('refuses to encode when not encodable', () => {
    const empty = makeType0([]);
    const r = encodeType0Text('A', empty);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.reason).toContain('not encodable');
  });

  it('skips ligature targets in the reverse map (encodes individual chars)', () => {
    // CID 0x0125 → "fi" (ligature) — won't be in unicodeToCode reverse.
    // CID 0x0066 → "f", CID 0x0069 → "i" are individual codes.
    const enc = makeType0([
      [0x0066, 'f'],
      [0x0069, 'i'],
      [0x0125, 'fi'], // ligature
    ]);
    // User typing "fi" gets encoded as separate f + i bytes.
    const r = encodeType0Text('fi', enc);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(Array.from(r.bytes)).toEqual([0x00, 0x66, 0x00, 0x69]);
  });
});

describe('decodeType0Text', () => {
  it('decodes a 2-byte CID stream', () => {
    const enc = makeType0([
      [0x0042, 'B'],
      [0x0073, 's'],
    ]);
    const text = decodeType0Text(new Uint8Array([0x00, 0x42, 0x00, 0x73]), enc);
    expect(text).toBe('Bs');
  });

  it('decodes ligature CIDs to multi-codepoint Unicode', () => {
    const enc = makeType0([
      [0x0066, 'f'],
      [0x0125, 'fi'],
    ]);
    // Source bytes encode CID 0x0066 then CID 0x0125
    const text = decodeType0Text(
      new Uint8Array([0x00, 0x66, 0x01, 0x25]),
      enc
    );
    expect(text).toBe('ffi');
  });

  it('emits replacement char for unmapped CIDs', () => {
    const enc = makeType0([[0x0042, 'B']]);
    const text = decodeType0Text(
      new Uint8Array([0x00, 0x42, 0x99, 0x99]),
      enc
    );
    expect(text).toBe('B�');
  });

  it('drops a trailing odd byte rather than throwing', () => {
    const enc = makeType0([[0x0042, 'B']]);
    const text = decodeType0Text(new Uint8Array([0x00, 0x42, 0x12]), enc);
    expect(text).toBe('B');
  });

  it('falls back to latin1 for non-2-byte encodings', () => {
    const fake1byte: ResolvedEncoding = {
      ...makeType0([[0x41, 'A']]),
      bytesPerCode: 1,
    };
    const text = decodeType0Text(new Uint8Array([0x48, 0x69]), fake1byte);
    expect(text).toBe('Hi');
  });
});

describe('round-trip — encode then decode', () => {
  it('encode("Hello") then decode produces "Hello"', () => {
    const enc = makeType0([
      [0x0048, 'H'],
      [0x0065, 'e'],
      [0x006c, 'l'],
      [0x006f, 'o'],
    ]);
    const r = encodeType0Text('Hello', enc);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(decodeType0Text(r.bytes, enc)).toBe('Hello');
  });

  it('round-trips Chinese / BMP characters', () => {
    const enc = makeType0([
      [0x4e2d, '中'],
      [0x6587, '文'],
    ]);
    const r = encodeType0Text('中文', enc);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(decodeType0Text(r.bytes, enc)).toBe('中文');
  });
});
