// TjByteSurgery tests. The contract is: only the operand bytes change;
// every other byte in the source content stream is preserved exactly.

import { describe, expect, it } from 'vitest';
import {
  applyOperandReplacements,
  type TjOperandReplacement,
} from '@main/services/text-editing/rewriter/TjByteSurgery';
import { tokenize } from '@main/services/text-editing/interpreter/Tokenizer';
import { interpret } from '@main/services/text-editing/interpreter/Interpreter';
import type { FontResolver } from '@main/services/text-editing/interpreter/types';

const enc = new TextEncoder();
const dec = new TextDecoder();

const latin1Resolver: FontResolver = {
  decodeText(_n, b) {
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return s;
  },
};

function findOperandRange(source: string, target: string): { start: number; end: number } {
  const idx = source.indexOf(target);
  if (idx < 0) throw new Error(`target ${target} not found in source`);
  return { start: idx, end: idx + target.length };
}

describe('applyOperandReplacements — basic Tj swaps', () => {
  it('replaces a single operand and preserves surrounding bytes', () => {
    const source = 'BT /F1 12 Tf (Hello) Tj ET';
    const range = findOperandRange(source, '(Hello)');
    const out = applyOperandReplacements(enc.encode(source), [
      {
        operandStart: range.start,
        operandEnd: range.end,
        preserveHex: false,
        newBytes: enc.encode('World!'),
      },
    ]);
    expect(dec.decode(out)).toBe('BT /F1 12 Tf (World!) Tj ET');
  });

  it('replaces multiple non-overlapping operands in source order', () => {
    const source = 'BT (foo) Tj 0 -14 Td (bar) Tj ET';
    const fooRange = findOperandRange(source, '(foo)');
    const barRange = findOperandRange(source, '(bar)');
    const out = applyOperandReplacements(enc.encode(source), [
      // Out-of-order on input — function sorts internally.
      {
        operandStart: barRange.start,
        operandEnd: barRange.end,
        preserveHex: false,
        newBytes: enc.encode('BAR'),
      },
      {
        operandStart: fooRange.start,
        operandEnd: fooRange.end,
        preserveHex: false,
        newBytes: enc.encode('FOO'),
      },
    ]);
    expect(dec.decode(out)).toBe('BT (FOO) Tj 0 -14 Td (BAR) Tj ET');
  });

  it('preserves hex form when preserveHex is true', () => {
    const source = 'BT <48656C6C6F> Tj ET';
    const range = findOperandRange(source, '<48656C6C6F>');
    const out = applyOperandReplacements(enc.encode(source), [
      {
        operandStart: range.start,
        operandEnd: range.end,
        preserveHex: true,
        newBytes: enc.encode('World'),
      },
    ]);
    expect(dec.decode(out)).toBe('BT <576F726C64> Tj ET');
  });

  it('switches to literal form when preserveHex is false', () => {
    const source = 'BT <48656C6C6F> Tj ET';
    const range = findOperandRange(source, '<48656C6C6F>');
    const out = applyOperandReplacements(enc.encode(source), [
      {
        operandStart: range.start,
        operandEnd: range.end,
        preserveHex: false,
        newBytes: enc.encode('World'),
      },
    ]);
    expect(dec.decode(out)).toBe('BT (World) Tj ET');
  });

  it('handles longer replacement (output grows)', () => {
    const source = 'BT (a) Tj ET';
    const range = findOperandRange(source, '(a)');
    const out = applyOperandReplacements(enc.encode(source), [
      {
        operandStart: range.start,
        operandEnd: range.end,
        preserveHex: false,
        newBytes: enc.encode('Hello, World!'),
      },
    ]);
    expect(dec.decode(out)).toBe('BT (Hello, World!) Tj ET');
  });

  it('handles shorter replacement (output shrinks)', () => {
    const source = 'BT (Hello, World!) Tj ET';
    const range = findOperandRange(source, '(Hello, World!)');
    const out = applyOperandReplacements(enc.encode(source), [
      {
        operandStart: range.start,
        operandEnd: range.end,
        preserveHex: false,
        newBytes: enc.encode('Hi'),
      },
    ]);
    expect(dec.decode(out)).toBe('BT (Hi) Tj ET');
  });

  it('returns a defensive copy when no replacements are given', () => {
    const source = enc.encode('BT (Hi) Tj ET');
    const out = applyOperandReplacements(source, []);
    expect(out).not.toBe(source);
    expect(Array.from(out)).toEqual(Array.from(source));
  });
});

describe('applyOperandReplacements — TJ array element swaps', () => {
  it('replaces individual string elements while preserving kerning', () => {
    // [(Hello) -100 (World)] TJ — replace just the first string.
    const source = 'BT [(Hello) -100 (World)] TJ ET';
    const range = findOperandRange(source, '(Hello)');
    const out = applyOperandReplacements(enc.encode(source), [
      {
        operandStart: range.start,
        operandEnd: range.end,
        preserveHex: false,
        newBytes: enc.encode('Howdy'),
      },
    ]);
    expect(dec.decode(out)).toBe('BT [(Howdy) -100 (World)] TJ ET');
  });

  it('replaces multiple TJ items at once', () => {
    const source = 'BT [(foo) -50 (bar) 100 (baz)] TJ ET';
    const fooR = findOperandRange(source, '(foo)');
    const barR = findOperandRange(source, '(bar)');
    const bazR = findOperandRange(source, '(baz)');
    const out = applyOperandReplacements(enc.encode(source), [
      { operandStart: fooR.start, operandEnd: fooR.end, preserveHex: false, newBytes: enc.encode('FOO') },
      { operandStart: barR.start, operandEnd: barR.end, preserveHex: false, newBytes: enc.encode('BAR') },
      { operandStart: bazR.start, operandEnd: bazR.end, preserveHex: false, newBytes: enc.encode('BAZ') },
    ]);
    expect(dec.decode(out)).toBe('BT [(FOO) -50 (BAR) 100 (BAZ)] TJ ET');
  });
});

describe('applyOperandReplacements — round-trip via interpreter', () => {
  it('post-edit content stream re-tokenizes and re-interprets cleanly', () => {
    const source = 'BT /F1 12 Tf (Hello, World!) Tj 0 -14 Td (Second line) Tj ET';
    const r1 = findOperandRange(source, '(Hello, World!)');
    const r2 = findOperandRange(source, '(Second line)');
    const out = applyOperandReplacements(enc.encode(source), [
      { operandStart: r1.start, operandEnd: r1.end, preserveHex: false, newBytes: enc.encode('Goodbye, World!') },
      { operandStart: r2.start, operandEnd: r2.end, preserveHex: false, newBytes: enc.encode('Third line') },
    ]);

    const { tokens, diagnostics } = tokenize(out);
    expect(diagnostics).toEqual([]);
    const { events } = interpret(tokens, latin1Resolver);
    const runs = events
      .filter((e) => e.kind === 'text-run')
      .map((e) => (e as { kind: 'text-run'; run: { text: string } }).run.text);
    expect(runs).toEqual(['Goodbye, World!', 'Third line']);
  });

  it('hex-form output re-decodes to the original bytes', () => {
    const source = 'BT <48> Tj ET';
    const range = findOperandRange(source, '<48>');
    const newBytes = new Uint8Array([0x00, 0xff, 0x80]); // mostly non-printable
    const out = applyOperandReplacements(enc.encode(source), [
      { operandStart: range.start, operandEnd: range.end, preserveHex: true, newBytes },
    ]);
    const { tokens } = tokenize(out);
    const stringTok = tokens.find((t) => t.kind === 'hexstring' || t.kind === 'string');
    expect(stringTok).toBeDefined();
    expect(Array.from(stringTok!.value as Uint8Array)).toEqual([0x00, 0xff, 0x80]);
  });
});

describe('applyOperandReplacements — error handling', () => {
  it('throws on overlapping replacements', () => {
    const source = 'BT (Hello) Tj ET';
    const replacements: TjOperandReplacement[] = [
      { operandStart: 3, operandEnd: 8, preserveHex: false, newBytes: enc.encode('A') },
      { operandStart: 5, operandEnd: 10, preserveHex: false, newBytes: enc.encode('B') },
    ];
    expect(() => applyOperandReplacements(enc.encode(source), replacements)).toThrow(/overlap/);
  });

  it('throws on out-of-bounds replacements', () => {
    const source = enc.encode('short');
    expect(() =>
      applyOperandReplacements(source, [
        { operandStart: 0, operandEnd: 100, preserveHex: false, newBytes: enc.encode('x') },
      ])
    ).toThrow(/out of bounds/);
  });

  it('throws on inverted ranges', () => {
    const source = enc.encode('hello');
    expect(() =>
      applyOperandReplacements(source, [
        { operandStart: 4, operandEnd: 2, preserveHex: false, newBytes: enc.encode('x') },
      ])
    ).toThrow(/end<start/);
  });
});
