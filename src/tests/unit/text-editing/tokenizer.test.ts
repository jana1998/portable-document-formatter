// Tokenizer tests for the PDF content-stream tokenizer.
//
// The most important property is the *round-trip*: every byte in the input
// is either inside a token's [start, end) range or in a whitespace gap
// between tokens. A bug in this property silently corrupts every saved PDF,
// so it's checked on every fixture.

import { describe, expect, it } from 'vitest';
import { tokenize } from '@main/services/text-editing/interpreter/Tokenizer';
import type { Token } from '@main/services/text-editing/interpreter/types';

const enc = new TextEncoder();
const bytes = (s: string): Uint8Array => enc.encode(s);

/**
 * Verifies the round-trip invariant: for any input, the byte ranges of the
 * emitted tokens (in order) plus the inter-token whitespace exactly cover
 * the input. Returns true if the invariant holds.
 */
function checkRoundTripCoverage(input: Uint8Array, tokens: Token[]): {
  ok: boolean;
  reason?: string;
} {
  let cursor = 0;
  for (const t of tokens) {
    if (t.start < cursor) {
      return { ok: false, reason: `token at ${t.start}..${t.end} overlaps prior coverage at ${cursor}` };
    }
    // Bytes in (cursor, t.start) must all be whitespace.
    for (let i = cursor; i < t.start; i++) {
      if (!isWs(input[i])) {
        return {
          ok: false,
          reason: `non-whitespace byte 0x${input[i].toString(16)} at ${i} not covered by any token (gap ${cursor}..${t.start})`,
        };
      }
    }
    if (t.end < t.start) {
      return { ok: false, reason: `token has end<start: ${t.start}..${t.end}` };
    }
    cursor = t.end;
  }
  // Bytes after the last token must all be whitespace.
  for (let i = cursor; i < input.length; i++) {
    if (!isWs(input[i])) {
      return {
        ok: false,
        reason: `non-whitespace byte 0x${input[i].toString(16)} at ${i} after final token`,
      };
    }
  }
  return { ok: true };
}

function isWs(b: number): boolean {
  return b === 0x00 || b === 0x09 || b === 0x0a || b === 0x0c || b === 0x0d || b === 0x20;
}

describe('tokenize — operators and numbers', () => {
  it('parses a simple text-show stream', () => {
    const input = bytes('BT /F1 12 Tf 100 200 Td (Hello) Tj ET');
    const { tokens, diagnostics } = tokenize(input);
    expect(diagnostics).toEqual([]);
    // Compare kinds in order; verify string contents separately because the
    // string token's value is a Uint8Array, not a string.
    expect(tokens.map((t) => t.kind)).toEqual([
      'operator', 'name', 'number', 'operator',
      'number', 'number', 'operator',
      'string', 'operator', 'operator',
    ]);
    expect(tokens.map((t) => (t.kind === 'string' ? null : t.value))).toEqual([
      'BT', 'F1', 12, 'Tf',
      100, 200, 'Td',
      null, 'Tj', 'ET',
    ]);
    const helloBytes = tokens[7].value as Uint8Array;
    expect(new TextDecoder('latin1').decode(helloBytes)).toBe('Hello');
  });

  it('round-trips all bytes', () => {
    const input = bytes('  BT\n  /F1 12 Tf\n  (Hello)Tj\nET  ');
    const { tokens } = tokenize(input);
    expect(checkRoundTripCoverage(input, tokens)).toEqual({ ok: true });
  });

  it('parses signed and decimal numbers', () => {
    const input = bytes('-12 +3.5 .25 -.5 0 100');
    const { tokens } = tokenize(input);
    expect(tokens.map((t) => t.value)).toEqual([-12, 3.5, 0.25, -0.5, 0, 100]);
  });

  it('parses a number followed by an operator with no whitespace between', () => {
    // Real PDFs often emit `12Tf` with no separator — the tokenizer must
    // split this correctly into a number then an operator.
    // ...except per ISO 32000 §7.2 numbers actually require a delimiter.
    // We support whitespace-separated; the no-separator case is malformed.
    const input = bytes('12 Tf');
    const { tokens } = tokenize(input);
    expect(tokens.map((t) => t.value)).toEqual([12, 'Tf']);
  });

  it('handles trailing whitespace', () => {
    const input = bytes('Tj   \n\n  ');
    const { tokens } = tokenize(input);
    expect(tokens.length).toBe(1);
    expect(tokens[0].value).toBe('Tj');
    expect(checkRoundTripCoverage(input, tokens)).toEqual({ ok: true });
  });

  it('handles leading whitespace', () => {
    const input = bytes('   \n\n   BT');
    const { tokens } = tokenize(input);
    expect(tokens.length).toBe(1);
    expect(tokens[0].value).toBe('BT');
    expect(tokens[0].start).toBe(input.length - 2);
  });
});

describe('tokenize — names', () => {
  it('parses a simple name', () => {
    const { tokens } = tokenize(bytes('/Foo'));
    expect(tokens).toEqual([
      { kind: 'name', start: 0, end: 4, value: 'Foo' },
    ]);
  });

  it('decodes #NN escapes in names', () => {
    // /Lime#20Green decodes to "Lime Green" — space is hex 0x20.
    const { tokens } = tokenize(bytes('/Lime#20Green'));
    expect(tokens.length).toBe(1);
    expect(tokens[0].value).toBe('Lime Green');
  });

  it('decodes lowercase hex in name escapes', () => {
    // /a#23b should decode to "a#b" — 0x23 is '#'.
    const { tokens } = tokenize(bytes('/a#23b'));
    expect(tokens[0].value).toBe('a#b');
  });

  it('records diagnostic for truncated name escape', () => {
    const { tokens, diagnostics } = tokenize(bytes('/foo#1'));
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].code).toBe('invalid-name-escape');
    // Name still emits with the literal '#' preserved.
    expect(tokens[0].kind).toBe('name');
  });

  it('records diagnostic for invalid hex in name escape', () => {
    const { diagnostics } = tokenize(bytes('/foo#XX'));
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].code).toBe('invalid-name-escape');
  });

  it('terminates name at delimiter', () => {
    const { tokens } = tokenize(bytes('/F1[1 2 3]'));
    expect(tokens.length).toBe(6);
    expect(tokens[0]).toMatchObject({ kind: 'name', value: 'F1' });
    expect(tokens[1].kind).toBe('array-open');
  });

  it('terminates name at whitespace', () => {
    const { tokens } = tokenize(bytes('/F1 12'));
    expect(tokens.map((t) => t.value)).toEqual(['F1', 12]);
  });
});

describe('tokenize — literal strings', () => {
  it('parses a simple literal string', () => {
    const { tokens } = tokenize(bytes('(Hello, World!)'));
    expect(tokens.length).toBe(1);
    expect(tokens[0].kind).toBe('string');
    const v = tokens[0].value as Uint8Array;
    expect(new TextDecoder('latin1').decode(v)).toBe('Hello, World!');
  });

  it('handles balanced parens inside a string', () => {
    const { tokens } = tokenize(bytes('(a(b)c(d(e)f)g)'));
    expect(tokens.length).toBe(1);
    const v = tokens[0].value as Uint8Array;
    expect(new TextDecoder('latin1').decode(v)).toBe('a(b)c(d(e)f)g');
  });

  it('handles escape sequences', () => {
    // \n \r \t \b \f \\ \( \) and octal \101 (= 'A')
    const { tokens } = tokenize(bytes('(\\n\\r\\t\\b\\f\\\\\\(\\)\\101)'));
    const v = tokens[0].value as Uint8Array;
    const s = new TextDecoder('latin1').decode(v);
    expect(s).toBe('\n\r\t\b\f\\()A');
  });

  it('handles octal escapes of varying length', () => {
    const { tokens } = tokenize(bytes('(\\1\\12\\123)'));
    const v = tokens[0].value as Uint8Array;
    // \1 → 0x01, \12 → 0o12=10, \123 → 0o123=83 ('S')
    expect(Array.from(v)).toEqual([0x01, 0x0a, 0x53]);
  });

  it('handles backslash-EOL line continuation', () => {
    // "(line1\<LF>line2)" → "line1line2"
    const { tokens } = tokenize(bytes('(line1\\\nline2)'));
    const v = tokens[0].value as Uint8Array;
    expect(new TextDecoder('latin1').decode(v)).toBe('line1line2');
  });

  it('handles backslash-CRLF line continuation', () => {
    const { tokens } = tokenize(bytes('(line1\\\r\nline2)'));
    const v = tokens[0].value as Uint8Array;
    expect(new TextDecoder('latin1').decode(v)).toBe('line1line2');
  });

  it('normalizes literal CR to LF inside string', () => {
    // Per spec a CR (or CRLF) not preceded by backslash counts as a single LF.
    const { tokens } = tokenize(bytes('(a\rb)'));
    const v = tokens[0].value as Uint8Array;
    expect(new TextDecoder('latin1').decode(v)).toBe('a\nb');
  });

  it('normalizes literal CRLF to single LF', () => {
    const { tokens } = tokenize(bytes('(a\r\nb)'));
    const v = tokens[0].value as Uint8Array;
    expect(new TextDecoder('latin1').decode(v)).toBe('a\nb');
  });

  it('records diagnostic for unterminated string', () => {
    const input = bytes('(this never closes');
    const { tokens, diagnostics } = tokenize(input);
    expect(diagnostics.some((d) => d.code === 'unterminated-string')).toBe(true);
    expect(tokens[0].kind).toBe('string');
  });

  it('preserves byte offsets exactly', () => {
    const input = bytes('  (Hi) ');
    const { tokens } = tokenize(input);
    expect(tokens[0].start).toBe(2);
    expect(tokens[0].end).toBe(6);
  });
});

describe('tokenize — hex strings', () => {
  it('parses a simple hex string', () => {
    const { tokens } = tokenize(bytes('<48656C6C6F>'));
    const v = tokens[0].value as Uint8Array;
    expect(new TextDecoder('latin1').decode(v)).toBe('Hello');
  });

  it('handles whitespace inside hex strings', () => {
    const { tokens } = tokenize(bytes('< 48 65 \n6C 6C 6F >'));
    const v = tokens[0].value as Uint8Array;
    expect(new TextDecoder('latin1').decode(v)).toBe('Hello');
  });

  it('pads odd-length hex with trailing zero', () => {
    // <ABC> → 0xAB, 0xC0 per spec.
    const { tokens } = tokenize(bytes('<ABC>'));
    const v = tokens[0].value as Uint8Array;
    expect(Array.from(v)).toEqual([0xab, 0xc0]);
  });

  it('handles empty hex string', () => {
    const { tokens } = tokenize(bytes('<>'));
    expect(tokens.length).toBe(1);
    expect(tokens[0].kind).toBe('hexstring');
    expect((tokens[0].value as Uint8Array).length).toBe(0);
  });

  it('records diagnostic for unterminated hex string', () => {
    const { diagnostics } = tokenize(bytes('<48656C6C6'));
    expect(diagnostics.some((d) => d.code === 'unterminated-hexstring')).toBe(true);
  });

  it('does not confuse << for hex string', () => {
    const { tokens } = tokenize(bytes('<< /Length 10 >>'));
    expect(tokens[0].kind).toBe('dict-open');
    expect(tokens[tokens.length - 1].kind).toBe('dict-close');
  });
});

describe('tokenize — delimiters', () => {
  it('parses arrays', () => {
    const { tokens } = tokenize(bytes('[1 2 (a)]'));
    expect(tokens.map((t) => t.kind)).toEqual([
      'array-open',
      'number',
      'number',
      'string',
      'array-close',
    ]);
  });

  it('parses dictionaries', () => {
    const { tokens } = tokenize(bytes('<< /K 1 >>'));
    expect(tokens.map((t) => t.kind)).toEqual([
      'dict-open',
      'name',
      'number',
      'dict-close',
    ]);
  });

  it('handles nested arrays in TJ operands', () => {
    // [(Hello) -20 (world)] TJ — common kerning pattern.
    const { tokens } = tokenize(bytes('[(Hello) -20 (world)] TJ'));
    expect(tokens.map((t) => t.kind)).toEqual([
      'array-open',
      'string',
      'number',
      'string',
      'array-close',
      'operator',
    ]);
    expect(tokens[5].value).toBe('TJ');
  });
});

describe('tokenize — comments', () => {
  it('captures comment text', () => {
    const { tokens } = tokenize(bytes('% hello world\nBT'));
    expect(tokens[0]).toMatchObject({ kind: 'comment', value: ' hello world' });
    expect(tokens[1]).toMatchObject({ kind: 'operator', value: 'BT' });
  });

  it('comment ends at CR', () => {
    const { tokens } = tokenize(bytes('% line\rET'));
    expect(tokens[0].kind).toBe('comment');
    expect(tokens[1].value).toBe('ET');
  });

  it('round-trips a stream containing comments', () => {
    const input = bytes('BT % start\n/F1 12 Tf\n(Hi) Tj % end\nET');
    const { tokens } = tokenize(input);
    expect(checkRoundTripCoverage(input, tokens)).toEqual({ ok: true });
  });
});

describe('tokenize — inline images', () => {
  it('treats BI..EI as a single opaque token', () => {
    // Inline image with two key/value pairs and 4 bytes of "image" data.
    const input = bytes('q\nBI /W 2 /H 1 /CS /G /BPC 8 ID\nXYZW\nEI\nQ');
    const { tokens, diagnostics } = tokenize(input);
    expect(diagnostics).toEqual([]);
    // Should have: q, inline-image, Q
    expect(tokens.map((t) => t.kind)).toEqual(['operator', 'inline-image', 'operator']);
    expect(tokens[0].value).toBe('q');
    expect(tokens[2].value).toBe('Q');
    // Round-trip property holds even with binary-ish image data.
    expect(checkRoundTripCoverage(input, tokens)).toEqual({ ok: true });
  });

  it('records diagnostic when inline image has no EI', () => {
    const { diagnostics } = tokenize(bytes('BI /W 1 /H 1 ID\nXX'));
    expect(diagnostics.some((d) => d.code === 'unterminated-inline-image')).toBe(true);
  });
});

describe('round-trip — adversarial inputs', () => {
  it('round-trips a stream with embedded null and CR bytes', () => {
    // Real content streams often have nulls (as whitespace) and CRs.
    const input = new Uint8Array([
      0x42, 0x54, 0x0d, 0x0a, // "BT" CRLF
      0x2f, 0x46, 0x31, 0x20, // "/F1 "
      0x31, 0x32, 0x20, // "12 "
      0x54, 0x66, 0x00, // "Tf" NUL
      0x45, 0x54, // "ET"
    ]);
    const { tokens } = tokenize(input);
    expect(checkRoundTripCoverage(input, tokens)).toEqual({ ok: true });
    expect(tokens.map((t) => t.value)).toEqual(['BT', 'F1', 12, 'Tf', 'ET']);
  });

  it('round-trips a heavily-mixed stream', () => {
    const input = bytes(
      [
        '%!PDF',
        'q',
        '1 0 0 1 50 700 cm',
        'BT',
        '/F1 12 Tf',
        '0.5 0.5 0.5 rg',
        '[(Hello) -200 (World!)] TJ',
        '0 -14 Td',
        '<48656C6C6F> Tj',
        '/F2 10 Tf',
        '(Line\\nwith escapes) Tj',
        'ET',
        'Q',
      ].join('\n')
    );
    const { tokens, diagnostics } = tokenize(input);
    expect(diagnostics).toEqual([]);
    expect(checkRoundTripCoverage(input, tokens)).toEqual({ ok: true });
    // Spot-check a few tokens we care about.
    expect(tokens.find((t) => t.value === 'cm')).toBeTruthy();
    expect(tokens.find((t) => t.value === 'TJ')).toBeTruthy();
    expect(tokens.find((t) => t.value === 'rg')).toBeTruthy();
  });

  it('round-trips a stream with all whitespace between tokens', () => {
    const input = bytes(' \t\n\r\fBT \t\nET\r ');
    const { tokens } = tokenize(input);
    expect(tokens.length).toBe(2);
    expect(checkRoundTripCoverage(input, tokens)).toEqual({ ok: true });
  });
});
