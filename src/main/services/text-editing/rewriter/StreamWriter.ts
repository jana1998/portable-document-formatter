// Serialize byte sequences as PDF strings.
//
// PDF strings come in two forms (ISO 32000-2 §7.3.4):
//   - Literal: `(text)` — bytes are written almost as-is, with escapes for
//     `(`, `)`, `\`, and non-printable bytes.
//   - Hex: `<DEADBEEF>` — two hex digits per byte.
//
// We pick whichever form yields shorter output. For typical Western text
// the literal form is shorter; for CID/Identity-H output (mostly
// non-printable) the hex form wins.
//
// Round-trip property guarantee:
//   tokenize(serializeAsLiteral(b)).tokens[0].value  ===  b   (modulo spec)
//   tokenize(serializeAsHex(b)).tokens[0].value      ===  b
// Verified by tests in stream-writer.test.ts.

/** Serialize bytes as a literal PDF string `(...)`. */
export function serializeAsLiteral(bytes: Uint8Array): string {
  // Single-pass: build into an array of code points then join, faster than
  // string concatenation for ~1KB strings.
  const out: string[] = ['('];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x28 /* ( */ || b === 0x29 /* ) */ || b === 0x5c /* \ */) {
      out.push('\\', String.fromCharCode(b));
    } else if (b === 0x0a) {
      out.push('\\n');
    } else if (b === 0x0d) {
      out.push('\\r');
    } else if (b === 0x09) {
      out.push('\\t');
    } else if (b === 0x08) {
      out.push('\\b');
    } else if (b === 0x0c) {
      out.push('\\f');
    } else if (b >= 0x20 && b <= 0x7e) {
      out.push(String.fromCharCode(b));
    } else {
      // \ddd octal escape — always 3 digits to avoid ambiguity with the
      // following byte (e.g. "\7" vs "\701" vs "\70" + "1").
      out.push('\\', b.toString(8).padStart(3, '0'));
    }
  }
  out.push(')');
  return out.join('');
}

/** Serialize bytes as a hex PDF string `<...>`. */
export function serializeAsHex(bytes: Uint8Array): string {
  const out: string[] = ['<'];
  for (let i = 0; i < bytes.length; i++) {
    out.push(bytes[i].toString(16).padStart(2, '0').toUpperCase());
  }
  out.push('>');
  return out.join('');
}

export interface SerializedString {
  text: string;
  isHex: boolean;
}

/**
 * Serialize bytes using whichever form produces shorter output.
 * Falls back to the literal form on ties (it preserves printable text
 * legibly when reading the saved PDF in a text editor).
 */
export function serializeString(bytes: Uint8Array): SerializedString {
  const literal = serializeAsLiteral(bytes);
  const hexLen = bytes.length * 2 + 2;
  if (literal.length <= hexLen) {
    return { text: literal, isHex: false };
  }
  return { text: serializeAsHex(bytes), isHex: true };
}

/**
 * Variant: keep using whichever form the *original* string used. When we
 * splice a Tj operand, preserving the original form avoids gratuitous
 * diffs in the saved PDF (e.g. a hex-string PDF stays hex-string after
 * editing).
 */
export function serializeStringPreservingForm(
  bytes: Uint8Array,
  preferHex: boolean
): SerializedString {
  if (preferHex) return { text: serializeAsHex(bytes), isHex: true };
  return { text: serializeAsLiteral(bytes), isHex: false };
}
