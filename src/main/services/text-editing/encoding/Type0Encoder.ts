// Encode arbitrary Unicode text into 2-byte CIDs for a Type0 (Identity-H/V)
// PDF font.
//
// Each user-typed character maps to one CID via `encoding.unicodeToCode`.
// CIDs are emitted big-endian as 2-byte sequences — the format Type0 fonts
// expect inside Tj/TJ string operands. The output is a single Uint8Array
// of length `text.length * 2` (when nothing is missing).
//
// Like the simple-font encoder, we *don't* try to ligature-encode user
// input: typing "fi" produces CIDs for 'f' and 'i' separately rather than
// guessing a "fi" ligature CID. The font almost always has both shapes
// individually; the ligature glyph is an optimization done by the typesetter.
//
// Subsetted Type0 fonts: the encoding's `unicodeToCode` map is built from
// the embedded /ToUnicode CMap, which mirrors the subset's actual coverage.
// So if the subset doesn't include a typed character, it won't be in the
// reverse map, and we report it as missing.

import type { ResolvedEncoding } from './EncodingResolver';
import type { EncodeResult } from './SimpleFontEncoder';

/**
 * Encode `text` as 2-byte big-endian CIDs using `encoding.unicodeToCode`.
 * Returns the encoded bytes on success or the list of unmappable chars on
 * failure.
 */
export function encodeType0Text(text: string, encoding: ResolvedEncoding): EncodeResult {
  if (encoding.bytesPerCode !== 2) {
    return {
      ok: false,
      missing: [],
      reason: `encoding is ${encoding.kind} (${encoding.bytesPerCode} bytes/code) — Type0 encoder requires 2`,
    };
  }
  if (!encoding.encodable || encoding.unicodeToCode.size === 0) {
    return {
      ok: false,
      missing: [],
      reason: `encoding ${encoding.kind} is not encodable (no /ToUnicode reverse map)`,
    };
  }

  const out: number[] = [];
  const missing: string[] = [];
  for (const ch of text) {
    const cid = encoding.unicodeToCode.get(ch);
    if (cid === undefined) {
      if (!missing.includes(ch)) missing.push(ch);
      continue;
    }
    if (cid < 0 || cid > 0xffff) {
      // CID out of 2-byte range — defensive; shouldn't happen with a
      // well-formed /ToUnicode but skip rather than encoding a wraparound.
      if (!missing.includes(ch)) missing.push(ch);
      continue;
    }
    out.push((cid >> 8) & 0xff);
    out.push(cid & 0xff);
  }

  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      reason: `cannot encode ${missing.length} character(s) for ${encoding.baseFont}: ${missing.map((c) => JSON.stringify(c)).join(', ')}`,
    };
  }

  return { ok: true, bytes: Uint8Array.from(out) };
}

/**
 * Decode 2-byte CIDs back to a Unicode string using
 * `encoding.codeToUnicode`. Used by the interpreter so it can text-match
 * the locator's target against runs in the content stream.
 *
 * Bytes are read in big-endian pairs. Trailing odd byte (malformed
 * input) is dropped; the decoder doesn't throw.
 */
export function decodeType0Text(bytes: Uint8Array, encoding: ResolvedEncoding): string {
  if (encoding.bytesPerCode !== 2) {
    return decodeFallbackLatin1(bytes);
  }
  let s = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = (bytes[i] << 8) | bytes[i + 1];
    const uni = encoding.codeToUnicode.get(code);
    s += uni ?? '�'; // U+FFFD REPLACEMENT CHARACTER for unmapped CIDs
  }
  return s;
}

function decodeFallbackLatin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}
