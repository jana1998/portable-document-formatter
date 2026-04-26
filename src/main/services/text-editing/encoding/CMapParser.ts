// Parse a PDF /ToUnicode CMap stream into a CID → Unicode map.
//
// CMap streams are PostScript-based but use a tiny stable subset (per the
// "PDF Reference: Adobe CMap and CIDFont Files Specification"). We only
// care about three operator pairs:
//   - begincodespacerange / endcodespacerange  — declares the byte width
//                                                of CIDs (we infer this
//                                                from the hex strings).
//   - beginbfchar / endbfchar                  — N pairs of `<CID> <UTF-16BE-hex>`
//   - beginbfrange / endbfrange                — N triples; either
//                                                  `<CID-start> <CID-end> <UTF-16BE-hex>` (sequential)
//                                                or
//                                                  `<CID-start> <CID-end> [<UTF-16BE-hex> ...]` (per-CID array)
//
// Other CMap operators (cidchar, cidrange, usecmap, …) are accepted by the
// scanner but ignored: they're only meaningful for full encoding CMaps,
// not the Unicode mappings we need for editing.

export interface CMapMappings {
  /** CID (integer 0..2^bytes-1) → decoded Unicode string (1+ codepoints). */
  cidToUnicode: Map<number, string>;
  /** Bytes per CID inferred from codespacerange. Typically 1 or 2. */
  bytesPerCode: 1 | 2 | 4;
}

/**
 * Parse a /ToUnicode CMap stream's text into mappings. Caller owns
 * decoding the stream's filter chain — pass the decoded UTF-8/Latin-1
 * text in.
 */
export function parseCMap(input: Uint8Array | string): CMapMappings {
  const text = typeof input === 'string' ? input : latin1(input);
  const tokens = scanTokens(text);
  const cidToUnicode = new Map<number, string>();
  let bytesPerCode: 1 | 2 | 4 = 2; // default; codespacerange overrides

  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.kind === 'kw') {
      switch (tok.value) {
        case 'begincodespacerange': {
          const end = findKeyword(tokens, i + 1, 'endcodespacerange');
          if (end > 0) {
            // First hex string in the block tells us the byte width.
            for (let j = i + 1; j < end; j++) {
              const cur = tokens[j];
              if (cur.kind === 'hex') {
                const bytes = cur.value.length / 2;
                if (bytes === 1 || bytes === 2 || bytes === 4) {
                  bytesPerCode = bytes;
                }
                break;
              }
            }
            i = end + 1;
            continue;
          }
          break;
        }
        case 'beginbfchar': {
          const end = findKeyword(tokens, i + 1, 'endbfchar');
          if (end > 0) {
            parseBfChar(tokens, i + 1, end, cidToUnicode);
            i = end + 1;
            continue;
          }
          break;
        }
        case 'beginbfrange': {
          const end = findKeyword(tokens, i + 1, 'endbfrange');
          if (end > 0) {
            parseBfRange(tokens, i + 1, end, cidToUnicode);
            i = end + 1;
            continue;
          }
          break;
        }
      }
    }
    i++;
  }

  return { cidToUnicode, bytesPerCode };
}

// =============================================================================
// Tokenizer (minimal — only what CMap operators need).
// =============================================================================

type Token =
  | { kind: 'hex'; value: string } // canonicalized lowercase hex without delims
  | { kind: 'array-open' }
  | { kind: 'array-close' }
  | { kind: 'number'; value: number }
  | { kind: 'kw'; value: string } // identifier/keyword (everything else)
  | { kind: 'eof' };

function scanTokens(text: string): Token[] {
  const tokens: Token[] = [];
  const n = text.length;
  let p = 0;

  const isWs = (ch: string) =>
    ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\0';

  while (p < n) {
    const ch = text[p];

    // Skip whitespace.
    if (isWs(ch)) {
      p++;
      continue;
    }

    // Skip comments to EOL (PostScript-style).
    if (ch === '%') {
      while (p < n && text[p] !== '\n' && text[p] !== '\r') p++;
      continue;
    }

    // Skip PS-string literals — they appear in CMap headers (e.g., (Adobe)
    // for /Registry). We don't care about their content.
    if (ch === '(') {
      let depth = 1;
      p++;
      while (p < n && depth > 0) {
        const c = text[p];
        if (c === '\\' && p + 1 < n) {
          p += 2;
          continue;
        }
        if (c === '(') depth++;
        else if (c === ')') depth--;
        p++;
      }
      continue;
    }

    // Hex string `<...>`.
    if (ch === '<') {
      const start = p + 1;
      let end = start;
      while (end < n && text[end] !== '>') end++;
      const raw = text.substring(start, end).replace(/\s+/g, '').toLowerCase();
      tokens.push({ kind: 'hex', value: raw });
      p = end + 1;
      continue;
    }

    // Array delimiters.
    if (ch === '[') {
      tokens.push({ kind: 'array-open' });
      p++;
      continue;
    }
    if (ch === ']') {
      tokens.push({ kind: 'array-close' });
      p++;
      continue;
    }

    // Number or identifier — read until whitespace/delimiter.
    const tokStart = p;
    while (p < n && !isWs(text[p]) && text[p] !== '<' && text[p] !== '>' && text[p] !== '[' && text[p] !== ']' && text[p] !== '%' && text[p] !== '(') {
      p++;
    }
    const word = text.substring(tokStart, p);
    if (word.length === 0) {
      // Defensive: don't infinite-loop on a pathological char.
      p++;
      continue;
    }
    if (/^-?\d+(\.\d+)?$/.test(word)) {
      tokens.push({ kind: 'number', value: parseFloat(word) });
    } else {
      tokens.push({ kind: 'kw', value: word });
    }
  }

  tokens.push({ kind: 'eof' });
  return tokens;
}

function findKeyword(tokens: Token[], from: number, kw: string): number {
  for (let i = from; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === 'kw' && t.value === kw) return i;
  }
  return -1;
}

// =============================================================================
// Parse bfchar / bfrange bodies.
// =============================================================================

function parseBfChar(tokens: Token[], from: number, to: number, out: Map<number, string>): void {
  // Pairs of `<CID> <UTF-16BE>`
  let i = from;
  while (i < to) {
    const a = tokens[i];
    if (a.kind !== 'hex') {
      i++;
      continue;
    }
    if (i + 1 >= to) break;
    const b = tokens[i + 1];
    if (b.kind !== 'hex') {
      i++;
      continue;
    }
    const cid = parseHexInt(a.value);
    const uni = decodeUtf16Be(b.value);
    if (cid !== null && uni !== null) {
      out.set(cid, uni);
    }
    i += 2;
  }
}

function parseBfRange(tokens: Token[], from: number, to: number, out: Map<number, string>): void {
  // Triples:  `<start> <end> <UTF-16BE>` (sequential)
  //         | `<start> <end> [<UTF-16BE> <UTF-16BE> ...]` (per-CID array)
  let i = from;
  while (i < to) {
    const a = tokens[i];
    if (a.kind !== 'hex') {
      i++;
      continue;
    }
    if (i + 2 >= to) break;
    const b = tokens[i + 1];
    if (b.kind !== 'hex') {
      i++;
      continue;
    }
    const startCid = parseHexInt(a.value as string);
    const endCid = parseHexInt(b.value as string);
    if (startCid === null || endCid === null || endCid < startCid) {
      i += 2;
      continue;
    }

    const third = tokens[i + 2];

    if (third.kind === 'hex') {
      // Sequential range: each CID gets the previous unicode + 1.
      const baseUnicode = decodeUtf16Be(third.value as string);
      if (baseUnicode !== null) {
        // PDF spec: only the LAST codepoint of a multi-codepoint base
        // increments. e.g. start=0x30 end=0x39 base="0x30" → CIDs map
        // to 0x30, 0x31, ..., 0x39.
        const codepoints = [...baseUnicode];
        for (let cid = startCid; cid <= endCid; cid++) {
          if (codepoints.length === 0) break;
          out.set(cid, codepoints.join(''));
          // Advance the last codepoint.
          const lastIdx = codepoints.length - 1;
          const lastCp = codepoints[lastIdx].codePointAt(0)!;
          codepoints[lastIdx] = String.fromCodePoint(lastCp + 1);
        }
      }
      i += 3;
      continue;
    }

    if (third.kind === 'array-open') {
      // Array form: each CID in the range maps to the corresponding array element.
      const arrayItems: string[] = [];
      let j = i + 3;
      while (j < to && tokens[j].kind !== 'array-close') {
        const cur = tokens[j];
        if (cur.kind === 'hex') {
          const u = decodeUtf16Be(cur.value);
          if (u !== null) arrayItems.push(u);
        }
        j++;
      }
      for (let k = 0; k < arrayItems.length && startCid + k <= endCid; k++) {
        out.set(startCid + k, arrayItems[k]);
      }
      i = (j < to ? j + 1 : j); // move past array-close
      continue;
    }

    // Unknown shape; skip.
    i++;
  }
}

// =============================================================================
// Hex / UTF-16BE helpers.
// =============================================================================

function parseHexInt(hex: string): number | null {
  if (hex.length === 0) return null;
  const n = parseInt(hex, 16);
  return Number.isFinite(n) ? n : null;
}

/**
 * Decode a UTF-16BE hex string into a JavaScript string. Handles surrogate
 * pairs (codepoints > 0xFFFF) automatically because the JS string itself
 * stores UTF-16. Multi-codepoint values are returned concatenated.
 */
function decodeUtf16Be(hex: string): string | null {
  if (hex.length === 0 || hex.length % 2 !== 0) return null;
  // Each pair of hex digits is one byte; we read 2-byte UTF-16 BE units.
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    const b = parseInt(hex.substring(i, i + 2), 16);
    if (!Number.isFinite(b)) return null;
    bytes.push(b);
  }
  // 1-byte hex (e.g. ASCII shorthand): treat as a single codepoint <= 0xFF.
  if (bytes.length === 1) {
    return String.fromCharCode(bytes[0]);
  }
  // Otherwise interpret in 2-byte UTF-16BE units.
  if (bytes.length % 2 !== 0) return null;
  let s = '';
  for (let i = 0; i < bytes.length; i += 2) {
    s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
  }
  return s;
}

function latin1(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}
