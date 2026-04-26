// Encode arbitrary Unicode into 1-byte codes for a simple PDF font.
//
// For fonts using WinAnsi/MacRoman/StandardEncoding (with optional
// /Differences overrides), every character we type maps to at most one
// byte. If a typed character isn't in the resolver's `unicodeToCode` table,
// the encoder reports it as missing and the policy layer decides whether
// to refuse the edit or fall back to redact-and-reemit.
//
// For subsetted fonts this check is necessarily *optimistic*: the encoding
// dict tells us which bytes are *declared* but not which glyphs are
// actually embedded in the font program. In practice the embedder includes
// every glyph the document references, so the declared bytes are real.
// Phase 4d.5 (subset expansion) tightens this when we start consulting the
// font program directly.

import type { ResolvedEncoding } from './EncodingResolver';

export interface EncodeOk {
  ok: true;
  bytes: Uint8Array;
}

export interface EncodeFail {
  ok: false;
  /** Unicode characters from `text` that have no byte mapping. */
  missing: string[];
  /** A reason short enough for a user-facing tooltip. */
  reason: string;
}

export type EncodeResult = EncodeOk | EncodeFail;

/**
 * Encode `text` as 1-byte-per-char output using `encoding.unicodeToCode`.
 * Returns the encoded bytes on success or the list of unmappable chars on
 * failure.
 *
 * Multi-codepoint characters (emoji, combining marks, etc.) are walked one
 * codepoint at a time via `for..of`. A combining-mark codepoint that has
 * no 1-byte mapping is reported as missing — there's no graceful way to
 * encode it in a Latin-1 simple font.
 */
export function encodeSimpleFontText(text: string, encoding: ResolvedEncoding): EncodeResult {
  if (encoding.bytesPerCode !== 1) {
    return {
      ok: false,
      missing: [],
      reason: `encoding is ${encoding.kind} (${encoding.bytesPerCode} bytes/code) — simple-font encoder requires 1`,
    };
  }
  if (!encoding.encodable) {
    return {
      ok: false,
      missing: [],
      reason: `encoding ${encoding.kind} is not encodable (no byte → unicode table)`,
    };
  }

  const out: number[] = [];
  const missing: string[] = [];
  // for..of iterates by Unicode codepoint, not 16-bit code unit.
  for (const ch of text) {
    const byte = encoding.unicodeToCode.get(ch);
    if (byte === undefined) {
      // Avoid noisy duplicates in the `missing` list.
      if (!missing.includes(ch)) missing.push(ch);
    } else {
      out.push(byte);
    }
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

// =============================================================================
// Subset-font detection and reporting.
// =============================================================================

const SUBSET_PREFIX_RE = /^[A-Z]{6}\+/;

export interface SubsetReport {
  /** True if /BaseFont starts with the 6-uppercase + "+" subset prefix. */
  isSubset: boolean;
  /** /BaseFont with the subset prefix stripped, useful for system-font lookup. */
  realFontName: string;
  /** Characters in `text` we can't encode given the resolver's table. */
  missing: string[];
}

/**
 * Inspect whether the resolved encoding can express every character of
 * `text`. For subsetted fonts this is the policy gate: if `missing` is
 * non-empty, byte-surgery cannot proceed (the subset font program almost
 * certainly lacks those glyphs even if the encoding declares them).
 */
export function inspectSubsetCoverage(
  text: string,
  encoding: ResolvedEncoding
): SubsetReport {
  const isSubset = SUBSET_PREFIX_RE.test(encoding.baseFont);
  const realFontName = isSubset ? encoding.baseFont.replace(SUBSET_PREFIX_RE, '') : encoding.baseFont;

  if (!encoding.encodable || encoding.bytesPerCode !== 1) {
    return { isSubset, realFontName, missing: [] };
  }

  const missing: string[] = [];
  for (const ch of text) {
    if (!encoding.unicodeToCode.has(ch) && !missing.includes(ch)) {
      missing.push(ch);
    }
  }
  return { isSubset, realFontName, missing };
}
