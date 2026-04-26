// Resolve a font's encoding into byte↔Unicode lookup tables.
//
// The pure `resolveEncoding` function takes plain data that's been already
// extracted from the PDF font dict, so it's easy to unit-test. The
// `resolveEncodingFromMupdf` adapter does the I/O of pulling that data
// out of a mupdf PDFObject and forwards to the pure function.
//
// Phase 4c handles simple fonts (1-byte codes via WinAnsi/MacRoman/
// StandardEncoding, optionally with /Differences overrides). Type0 fonts
// (Identity-H/Identity-V/CMap) are detected and tagged so the policy layer
// can route them to the Phase 4d code path; we don't try to populate
// codeToUnicode for them yet.

import {
  glyphNameToUnicode,
  unicodeToGlyphName,
} from './GlyphList';
import {
  getStandardEncoding,
  isStandardEncodingName,
  type StandardEncodingName,
} from './StandardEncodings';
import { parseCMap } from './CMapParser';

export type EncodingKind =
  | 'simple-winansi'
  | 'simple-macroman'
  | 'simple-standard'
  | 'simple-macexpert'
  | 'simple-custom' // /Differences-only or no /Encoding at all
  | 'identity-h' // Type0 + /Identity-H
  | 'identity-v' // Type0 + /Identity-V
  | 'cmap' // Type0 with a custom CMap stream — Phase 4d
  | 'unknown';

/** Subset of /Differences semantics expressed as a flat list of entries. */
export type DifferencesEntry =
  | { kind: 'code'; value: number } // a number resets the byte position
  | { kind: 'name'; value: string }; // glyph name applied at the running position

/** What we need from a font dict to resolve its encoding. */
export interface FontDictData {
  /** PostScript /BaseFont, e.g. "Helvetica", "XXXXXX+TimesNewRoman". */
  baseFont: string;
  /** /Subtype: 'Type1' | 'TrueType' | 'MMType1' | 'Type3' | 'Type0' | other. */
  subtype: string;
  /** /Encoding — either a standard-encoding name, or a parsed encoding dict. */
  encoding?: string | EncodingDictData;
  /**
   * For Type0 fonts: the descendant font's /CIDSystemInfo and the /Encoding
   * (typically /Identity-H or /Identity-V). v1 doesn't process CIDToGIDMap;
   * we only need to *recognize* Type0 here so the policy layer routes them.
   */
}

export interface EncodingDictData {
  /** /BaseEncoding name; if absent, falls back to font built-in default. */
  baseEncoding?: string;
  /** Parsed /Differences array. */
  differences: DifferencesEntry[];
}

export interface ResolvedEncoding {
  kind: EncodingKind;
  baseFont: string;
  /** True when /BaseFont begins with the 6-uppercase subset prefix. */
  isSubset: boolean;
  /** Number of bytes per character code: 1 for simple, 2 for Type0/Identity. */
  bytesPerCode: 1 | 2;
  /**
   * Code (byte for simple, CID for Type0) → decoded Unicode string. The
   * string may contain MORE than one codepoint when the code maps to a
   * ligature (e.g. CID 0x125 → "fi"). Empty for kinds we can't enumerate.
   */
  codeToUnicode: Map<number, string>;
  /**
   * Single-character Unicode string → code. Codes whose decoded form is
   * multi-character (ligatures) are NOT in this reverse map — when the
   * user types "fi" we encode 'f' and 'i' separately rather than guessing
   * a ligature CID. Empty for non-encodable kinds.
   */
  unicodeToCode: Map<string, number>;
  /** Whether this encoding can encode/decode arbitrary text. */
  encodable: boolean;
  /** Diagnostic info. */
  warnings: string[];
}

const SUBSET_PREFIX_RE = /^[A-Z]{6}\+/;

/**
 * Resolve the font's encoding into byte↔Unicode tables.
 *
 * For simple fonts:
 *   1. Pick the base table (named encoding) — WinAnsi/MacRoman/Standard.
 *   2. If no name given, fall back per /Subtype:
 *      - TrueType  → WinAnsiEncoding
 *      - Type1     → StandardEncoding
 *   3. Apply /Differences overrides on top.
 *   4. Resolve glyph names → Unicode via the AGL.
 *
 * For Type0 fonts: tag the kind and stop.
 */
export function resolveEncoding(font: FontDictData): ResolvedEncoding {
  const isSubset = SUBSET_PREFIX_RE.test(font.baseFont);
  const warnings: string[] = [];

  // Type0: defer to Phase 4d.
  if (font.subtype === 'Type0') {
    const encName = typeof font.encoding === 'string' ? font.encoding : null;
    let kind: EncodingKind = 'unknown';
    if (encName === 'Identity-H') kind = 'identity-h';
    else if (encName === 'Identity-V') kind = 'identity-v';
    else if (encName) kind = 'cmap';
    return {
      kind,
      baseFont: font.baseFont,
      isSubset,
      bytesPerCode: 2,
      codeToUnicode: new Map<number, string>(),
      unicodeToCode: new Map<string, number>(),
      encodable: false,
      warnings: [
        `Type0 font (${kind}) — needs /ToUnicode stream to resolve (populated by resolveEncodingFromMupdf)`,
      ],
    };
  }

  // Simple-font path — pick base encoding.
  let baseName: StandardEncodingName | null = null;

  if (typeof font.encoding === 'string' && isStandardEncodingName(font.encoding)) {
    baseName = font.encoding;
  } else if (
    font.encoding &&
    typeof font.encoding === 'object' &&
    font.encoding.baseEncoding &&
    isStandardEncodingName(font.encoding.baseEncoding)
  ) {
    baseName = font.encoding.baseEncoding;
  } else {
    // No explicit encoding — pick the per-subtype default.
    switch (font.subtype) {
      case 'TrueType':
        baseName = 'WinAnsiEncoding';
        break;
      case 'Type1':
      case 'MMType1':
        baseName = 'StandardEncoding';
        break;
      case 'Type3':
        // Type3 fonts have an internal encoding; we can't introspect it
        // here. Mark as custom and let /Differences (if any) populate.
        baseName = null;
        break;
      default:
        baseName = null;
    }
  }

  // Build byte → glyph-name from the base table.
  const byteToGlyph: Record<number, string> = baseName
    ? { ...getStandardEncoding(baseName) }
    : {};

  // Apply /Differences overrides.
  if (font.encoding && typeof font.encoding === 'object') {
    let pos = 0;
    for (const entry of font.encoding.differences) {
      if (entry.kind === 'code') {
        pos = entry.value;
      } else {
        byteToGlyph[pos] = entry.value;
        pos++;
      }
    }
  }

  // Map glyph names → Unicode.
  const codeToUnicode = new Map<number, string>();
  const unicodeToCode = new Map<string, number>();
  for (const [byteStr, glyphName] of Object.entries(byteToGlyph)) {
    const byte = Number(byteStr);
    const cp = glyphNameToUnicode(glyphName);
    if (cp !== null) {
      const ch = String.fromCodePoint(cp);
      codeToUnicode.set(byte, ch);
      // First-write wins for the reverse map: the standard encodings list
      // their canonical bytes in numeric order, so the lower byte wins.
      if (!unicodeToCode.has(ch)) unicodeToCode.set(ch, byte);
    }
  }

  // Determine 'kind' for downstream classification.
  let kind: EncodingKind;
  switch (baseName) {
    case 'WinAnsiEncoding':
      kind = 'simple-winansi';
      break;
    case 'MacRomanEncoding':
      kind = 'simple-macroman';
      break;
    case 'StandardEncoding':
      kind = 'simple-standard';
      break;
    case 'MacExpertEncoding':
      kind = 'simple-macexpert';
      break;
    default:
      kind = 'simple-custom';
  }

  return {
    kind,
    baseFont: font.baseFont,
    isSubset,
    bytesPerCode: 1,
    codeToUnicode,
    unicodeToCode,
    encodable: codeToUnicode.size > 0,
    warnings,
  };
}

/**
 * Adapter: pull what `resolveEncoding` needs out of a live mupdf PDFObject,
 * then ALSO read the font's /ToUnicode stream (when present) to populate
 * Type0 mappings. The pure `resolveEncoding` function only handles the
 * simple-font path because it doesn't have stream-decoding access.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolveEncodingFromMupdf(fontObj: any): ResolvedEncoding {
  const baseFont = readNameField(fontObj, 'BaseFont') ?? '';
  const subtype = readNameField(fontObj, 'Subtype') ?? '';
  const encoding = readEncoding(fontObj);
  const resolved = resolveEncoding({ baseFont, subtype, encoding });

  // For Type0 fonts we still need to populate codeToUnicode/unicodeToCode
  // from the /ToUnicode stream — that's the part `resolveEncoding` left empty
  // because it can't read streams.
  if (
    (resolved.kind === 'identity-h' || resolved.kind === 'identity-v' || resolved.kind === 'cmap')
    && fontObj?.get
  ) {
    const toUnicode = fontObj.get('ToUnicode');
    if (toUnicode && toUnicode.isStream?.()) {
      try {
        const cmapBytes = readMupdfStreamAsString(toUnicode);
        const mappings = parseCMap(cmapBytes);
        const codeToUnicode = new Map<number, string>();
        const unicodeToCode = new Map<string, number>();
        for (const [cid, uni] of mappings.cidToUnicode) {
          codeToUnicode.set(cid, uni);
          // Reverse map: only single-character values (skip ligatures —
          // user input gets encoded as separate chars instead).
          if ([...uni].length === 1 && !unicodeToCode.has(uni)) {
            unicodeToCode.set(uni, cid);
          }
        }
        return {
          ...resolved,
          codeToUnicode,
          unicodeToCode,
          encodable: codeToUnicode.size > 0,
          warnings: codeToUnicode.size > 0
            ? []
            : [`Type0 ${resolved.kind} /ToUnicode parsed but yielded no mappings`],
        };
      } catch (err) {
        return {
          ...resolved,
          warnings: [
            ...resolved.warnings,
            `Failed to parse /ToUnicode for ${baseFont}: ${err instanceof Error ? err.message : String(err)}`,
          ],
        };
      }
    }
    // No /ToUnicode → leave as encodable: false. Phase 4d.5 (subset
    // expansion) is what fills this gap by deriving CIDs from a system
    // font with the same /BaseFont.
  }

  return resolved;
}

/** Read a mupdf stream object's decoded bytes as a string (latin1). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readMupdfStreamAsString(streamObj: any): string {
  const buf = streamObj.readStream();
  if (buf && typeof buf.asUint8Array === 'function') {
    const bytes = buf.asUint8Array() as Uint8Array;
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  }
  if (buf instanceof Uint8Array) {
    let s = '';
    for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
    return s;
  }
  // Fallback: assume length + indexable.
  const len: number = (buf?.length as number) ?? 0;
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode((buf[i] ?? 0) as number);
  return s;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readNameField(obj: any, key: string): string | null {
  const v = obj?.get?.(key);
  if (v == null) return null;
  if (v.isName?.()) return v.asName?.() ?? null;
  // Some mupdf-js builds return a string for /Type/Subtype/BaseFont directly.
  if (typeof v === 'string') return v;
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readEncoding(fontObj: any): string | EncodingDictData | undefined {
  const enc = fontObj?.get?.('Encoding');
  if (enc == null || enc.isNull?.()) return undefined;

  if (enc.isName?.()) {
    return enc.asName();
  }
  if (enc.isDictionary?.()) {
    const baseEncoding = readNameField(enc, 'BaseEncoding') ?? undefined;
    const differences: DifferencesEntry[] = [];
    const diffArr = enc.get?.('Differences');
    if (diffArr && diffArr.isArray?.()) {
      diffArr.forEach((item: { isNumber?: () => boolean; isName?: () => boolean; asNumber?: () => number; asName?: () => string }) => {
        if (item.isNumber?.()) {
          differences.push({ kind: 'code', value: item.asNumber!() });
        } else if (item.isName?.()) {
          differences.push({ kind: 'name', value: item.asName!() });
        }
      });
    }
    return { baseEncoding, differences };
  }
  return undefined;
}

/** Convenience: produce a glyph name for a given Unicode codepoint, used
 *  when *building* a /Differences override (Phase 4d.5 subset expansion). */
export function unicodeToGlyphNameOrNull(cp: number): string | null {
  return unicodeToGlyphName(cp);
}
