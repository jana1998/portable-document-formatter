// CMap parser tests — covers the bfchar / bfrange forms PDFs actually emit
// in /ToUnicode streams, including edge cases like ligature mappings,
// surrogate pairs, and per-CID array form of bfrange.

import { describe, expect, it } from 'vitest';
import { parseCMap } from '@main/services/text-editing/encoding/CMapParser';

describe('parseCMap — bfchar', () => {
  it('parses simple CID → BMP codepoint pairs', () => {
    const src = `
/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
2 beginbfchar
<0042> <0042>
<0073> <0073>
endbfchar
endcmap
end
end
`;
    const r = parseCMap(src);
    expect(r.bytesPerCode).toBe(2);
    expect(r.cidToUnicode.get(0x42)).toBe('B');
    expect(r.cidToUnicode.get(0x73)).toBe('s');
    expect(r.cidToUnicode.size).toBe(2);
  });

  it('decodes ligature glyphs that map to multi-codepoint Unicode', () => {
    // CID 0x0125 → "fi" ligature (U+0066 U+0069)
    const src = `
1 beginbfchar
<0125> <00660069>
endbfchar
endcmap
`;
    const r = parseCMap(src);
    expect(r.cidToUnicode.get(0x0125)).toBe('fi');
  });

  it('decodes surrogate-pair codepoints (> U+FFFF)', () => {
    // CID 0x0001 → U+1F600 (grinning face) encoded as surrogate pair D83D DE00
    const src = `
1 beginbfchar
<0001> <D83DDE00>
endbfchar
endcmap
`;
    const r = parseCMap(src);
    expect(r.cidToUnicode.get(0x0001)).toBe('😀');
  });

  it('handles whitespace inside hex strings', () => {
    const src = `
1 beginbfchar
< 00 42 > < 00 42 >
endbfchar
endcmap
`;
    const r = parseCMap(src);
    expect(r.cidToUnicode.get(0x42)).toBe('B');
  });
});

describe('parseCMap — bfrange (sequential)', () => {
  it('expands a sequential range', () => {
    // ASCII digits 0..9
    const src = `
1 beginbfrange
<0030> <0039> <0030>
endbfrange
endcmap
`;
    const r = parseCMap(src);
    expect(r.cidToUnicode.get(0x30)).toBe('0');
    expect(r.cidToUnicode.get(0x35)).toBe('5');
    expect(r.cidToUnicode.get(0x39)).toBe('9');
    expect(r.cidToUnicode.size).toBe(10);
  });

  it('only increments the last codepoint of a multi-codepoint base', () => {
    // CIDs 0x10..0x12 → "fi", "fj", "fk" (last char advances)
    const src = `
1 beginbfrange
<0010> <0012> <00660069>
endbfrange
endcmap
`;
    const r = parseCMap(src);
    expect(r.cidToUnicode.get(0x10)).toBe('fi');
    expect(r.cidToUnicode.get(0x11)).toBe('fj');
    expect(r.cidToUnicode.get(0x12)).toBe('fk');
  });
});

describe('parseCMap — bfrange (array form)', () => {
  it('maps each CID in range to the corresponding array element', () => {
    // CIDs 0x125..0x127 → fi/ff/fl
    const src = `
1 beginbfrange
<0125> <0127> [<00660069> <00660066> <0066006C>]
endbfrange
endcmap
`;
    const r = parseCMap(src);
    expect(r.cidToUnicode.get(0x125)).toBe('fi');
    expect(r.cidToUnicode.get(0x126)).toBe('ff');
    expect(r.cidToUnicode.get(0x127)).toBe('fl');
  });

  it('stops at the end of the array even if range is longer', () => {
    const src = `
1 beginbfrange
<0010> <0012> [<0041> <0042>]
endbfrange
endcmap
`;
    const r = parseCMap(src);
    expect(r.cidToUnicode.get(0x10)).toBe('A');
    expect(r.cidToUnicode.get(0x11)).toBe('B');
    expect(r.cidToUnicode.has(0x12)).toBe(false);
  });
});

describe('parseCMap — multiple sections', () => {
  it('combines bfchar + bfrange in one CMap', () => {
    const src = `
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
1 beginbfchar
<0001> <2014>
endbfchar
1 beginbfrange
<0030> <0039> <0030>
endbfrange
endcmap
`;
    const r = parseCMap(src);
    expect(r.cidToUnicode.size).toBe(11);
    expect(r.cidToUnicode.get(0x01)).toBe('—'); // em-dash
    expect(r.cidToUnicode.get(0x35)).toBe('5');
  });

  it('infers bytesPerCode from codespacerange', () => {
    const src = `
1 begincodespacerange
<00> <FF>
endcodespacerange
endcmap
`;
    const r = parseCMap(src);
    expect(r.bytesPerCode).toBe(1);
  });

  it('defaults to 2-byte CIDs when no codespacerange is present', () => {
    const src = `
1 beginbfchar
<0042> <0042>
endbfchar
endcmap
`;
    const r = parseCMap(src);
    expect(r.bytesPerCode).toBe(2);
  });
});

describe('parseCMap — robustness', () => {
  it('skips PostScript-style comments', () => {
    const src = `
% This is a comment
1 beginbfchar
<0042> <0042>  % inline comment
endbfchar
endcmap
`;
    const r = parseCMap(src);
    expect(r.cidToUnicode.get(0x42)).toBe('B');
  });

  it('skips PostScript string literals in headers', () => {
    const src = `
/CIDSystemInfo
<< /Registry (Adobe)
   /Ordering (UCS)
   /Supplement 0
>> def
1 beginbfchar
<0042> <0042>
endbfchar
endcmap
`;
    const r = parseCMap(src);
    expect(r.cidToUnicode.get(0x42)).toBe('B');
  });

  it('returns empty mappings for empty input', () => {
    const r = parseCMap('');
    expect(r.cidToUnicode.size).toBe(0);
  });

  it('handles a Uint8Array input directly', () => {
    const src = '1 beginbfchar\n<0042> <0042>\nendbfchar\nendcmap';
    const bytes = new TextEncoder().encode(src);
    const r = parseCMap(bytes);
    expect(r.cidToUnicode.get(0x42)).toBe('B');
  });
});
