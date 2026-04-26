// StreamWriter tests. The most important property is the round-trip:
// tokenizing the writer's output must yield the original bytes.

import { describe, expect, it } from 'vitest';
import {
  serializeAsHex,
  serializeAsLiteral,
  serializeString,
  serializeStringPreservingForm,
} from '@main/services/text-editing/rewriter/StreamWriter';
import { tokenize } from '@main/services/text-editing/interpreter/Tokenizer';

const enc = new TextEncoder();
const bytesOf = (s: string): Uint8Array => enc.encode(s);

function tokenizeStringValue(text: string): Uint8Array {
  const { tokens, diagnostics } = tokenize(bytesOf(text));
  expect(diagnostics).toEqual([]);
  expect(tokens.length).toBe(1);
  expect(tokens[0].kind === 'string' || tokens[0].kind === 'hexstring').toBe(true);
  return tokens[0].value as Uint8Array;
}

describe('serializeAsLiteral', () => {
  it('emits printable ASCII verbatim', () => {
    expect(serializeAsLiteral(bytesOf('Hello'))).toBe('(Hello)');
  });

  it('escapes parens and backslash', () => {
    expect(serializeAsLiteral(bytesOf('a(b)c\\d'))).toBe('(a\\(b\\)c\\\\d)');
  });

  it('uses named escapes for whitespace control chars', () => {
    const input = new Uint8Array([0x0a, 0x0d, 0x09, 0x08, 0x0c]);
    expect(serializeAsLiteral(input)).toBe('(\\n\\r\\t\\b\\f)');
  });

  it('uses 3-digit octal for non-printable bytes', () => {
    // 0x01 → \001, 0x7F → \177, 0xE9 → \351
    const input = new Uint8Array([0x01, 0x7f, 0xe9]);
    expect(serializeAsLiteral(input)).toBe('(\\001\\177\\351)');
  });

  it('round-trips through the tokenizer', () => {
    const inputs = [
      bytesOf('Hello, World!'),
      bytesOf('café'),
      new Uint8Array([0x00, 0x01, 0x7f, 0xff]),
      bytesOf('a(b)c\\d'),
      bytesOf(''),
      new Uint8Array([0x0a, 0x0d, 0x09]),
    ];
    for (const input of inputs) {
      const literal = serializeAsLiteral(input);
      const decoded = tokenizeStringValue(literal);
      expect(Array.from(decoded)).toEqual(Array.from(input));
    }
  });
});

describe('serializeAsHex', () => {
  it('emits two hex digits per byte', () => {
    expect(serializeAsHex(bytesOf('Hello'))).toBe('<48656C6C6F>');
  });

  it('uses uppercase', () => {
    expect(serializeAsHex(new Uint8Array([0xab, 0xcd]))).toBe('<ABCD>');
  });

  it('emits empty hex for empty input', () => {
    expect(serializeAsHex(new Uint8Array(0))).toBe('<>');
  });

  it('round-trips through the tokenizer', () => {
    const inputs = [
      bytesOf('Hello'),
      new Uint8Array([0x00, 0xff, 0x80, 0x7f]),
      bytesOf('café'),
      new Uint8Array(0),
    ];
    for (const input of inputs) {
      const hex = serializeAsHex(input);
      const decoded = tokenizeStringValue(hex);
      expect(Array.from(decoded)).toEqual(Array.from(input));
    }
  });
});

describe('serializeString — auto-pick', () => {
  it('chooses literal for plain ASCII text', () => {
    const r = serializeString(bytesOf('Hello, World!'));
    expect(r.isHex).toBe(false);
    expect(r.text).toBe('(Hello, World!)');
  });

  it('chooses hex when literal would have many octal escapes', () => {
    // 8 bytes, all non-printable → literal is "(\\AAA\\BBB...)" = 2 + 8*4 = 34
    // hex is "<...>" = 2 + 8*2 = 18 → hex wins
    const input = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xfe, 0xfd, 0xfc, 0xfb]);
    const r = serializeString(input);
    expect(r.isHex).toBe(true);
  });

  it('prefers literal on tie (more readable)', () => {
    // Single printable char: literal "(A)" = 3, hex "<41>" = 4 — literal wins
    const r = serializeString(new Uint8Array([0x41]));
    expect(r.isHex).toBe(false);
  });

  it('round-trips both branches', () => {
    const inputs = [
      bytesOf('Hello'),
      new Uint8Array([0x00, 0xff, 0x80, 0x7f, 0x01]),
      bytesOf(''),
      bytesOf('café (unicode)'),
    ];
    for (const input of inputs) {
      const r = serializeString(input);
      const decoded = tokenizeStringValue(r.text);
      expect(Array.from(decoded)).toEqual(Array.from(input));
    }
  });
});

describe('serializeStringPreservingForm', () => {
  it('forces literal when preferHex is false', () => {
    const r = serializeStringPreservingForm(bytesOf('Hello'), false);
    expect(r.isHex).toBe(false);
    expect(r.text).toBe('(Hello)');
  });

  it('forces hex when preferHex is true', () => {
    const r = serializeStringPreservingForm(bytesOf('Hello'), true);
    expect(r.isHex).toBe(true);
    expect(r.text).toBe('<48656C6C6F>');
  });
});
