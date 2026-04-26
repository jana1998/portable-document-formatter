// PDF content-stream tokenizer (ISO 32000-2 §7.2).
//
// Produces tokens with byte-accurate [start, end) ranges so later passes can
// splice operator operands directly without re-serializing. The tokenizer is
// permissive: it tries to recover from malformed input and records what it
// had to skip in `diagnostics`, instead of throwing.
//
// Token kinds and what `value` carries are documented in ./types.ts.

import type {
  Token,
  TokenizeResult,
  TokenizerDiagnostic,
  TokenizerDiagnosticCode,
} from './types';

// --- character classes ---------------------------------------------------

// Whitespace per §7.2.3.
function isWhitespace(b: number): boolean {
  return b === 0x00 || b === 0x09 || b === 0x0a || b === 0x0c || b === 0x0d || b === 0x20;
}

// Delimiters per §7.2.3.
function isDelimiter(b: number): boolean {
  return (
    b === 0x28 /* ( */ ||
    b === 0x29 /* ) */ ||
    b === 0x3c /* < */ ||
    b === 0x3e /* > */ ||
    b === 0x5b /* [ */ ||
    b === 0x5d /* ] */ ||
    b === 0x7b /* { */ ||
    b === 0x7d /* } */ ||
    b === 0x2f /* / */ ||
    b === 0x25 /* % */
  );
}

function isWsOrDelim(b: number): boolean {
  return isWhitespace(b) || isDelimiter(b);
}

function isDigit(b: number): boolean {
  return b >= 0x30 && b <= 0x39;
}

function hexValue(b: number): number {
  if (b >= 0x30 && b <= 0x39) return b - 0x30;
  if (b >= 0x41 && b <= 0x46) return b - 0x41 + 10;
  if (b >= 0x61 && b <= 0x66) return b - 0x61 + 10;
  return -1;
}

// --- public entry --------------------------------------------------------

/**
 * Tokenize a PDF content stream. Tokens are emitted in order; diagnostics
 * are collected without throwing.
 */
export function tokenize(input: Uint8Array): TokenizeResult {
  const tokens: Token[] = [];
  const diagnostics: TokenizerDiagnostic[] = [];
  const ctx: Ctx = { input, pos: 0, end: input.length, diagnostics };

  while (ctx.pos < ctx.end) {
    skipWhitespace(ctx);
    if (ctx.pos >= ctx.end) break;

    const startByte = ctx.input[ctx.pos];

    if (startByte === 0x25 /* % */) {
      tokens.push(readComment(ctx));
      continue;
    }
    if (startByte === 0x2f /* / */) {
      tokens.push(readName(ctx));
      continue;
    }
    if (startByte === 0x28 /* ( */) {
      tokens.push(readLiteralString(ctx));
      continue;
    }
    if (startByte === 0x3c /* < */) {
      // << is dict-open, otherwise hex string
      if (ctx.pos + 1 < ctx.end && ctx.input[ctx.pos + 1] === 0x3c) {
        tokens.push({ kind: 'dict-open', start: ctx.pos, end: ctx.pos + 2 });
        ctx.pos += 2;
      } else {
        tokens.push(readHexString(ctx));
      }
      continue;
    }
    if (startByte === 0x3e /* > */) {
      if (ctx.pos + 1 < ctx.end && ctx.input[ctx.pos + 1] === 0x3e) {
        tokens.push({ kind: 'dict-close', start: ctx.pos, end: ctx.pos + 2 });
        ctx.pos += 2;
      } else {
        // Stray '>'. Per spec it's invalid; keep moving so we don't corrupt
        // the rest of the stream. Record a diagnostic and emit as operator.
        diag(ctx, 'unbalanced-paren', `stray '>' at byte ${ctx.pos}`);
        tokens.push({ kind: 'operator', start: ctx.pos, end: ctx.pos + 1, value: '>' });
        ctx.pos += 1;
      }
      continue;
    }
    if (startByte === 0x5b /* [ */) {
      tokens.push({ kind: 'array-open', start: ctx.pos, end: ctx.pos + 1 });
      ctx.pos += 1;
      continue;
    }
    if (startByte === 0x5d /* ] */) {
      tokens.push({ kind: 'array-close', start: ctx.pos, end: ctx.pos + 1 });
      ctx.pos += 1;
      continue;
    }

    // Number candidates: digits, leading +/-, leading '.'.
    if (isDigit(startByte) || startByte === 0x2b /* + */ || startByte === 0x2d /* - */ || startByte === 0x2e /* . */) {
      const numTok = tryReadNumber(ctx);
      if (numTok) {
        tokens.push(numTok);
        continue;
      }
      // Not a number — fall through to operator parse so we still consume
      // something this iteration.
    }

    // Operator (postfix identifier). Reads until whitespace or delimiter.
    const opTok = readOperator(ctx);

    // Inline-image handling: when we see BI, consume the inline-image block
    // opaquely up to and including the matching EI, and replace BI with a
    // single inline-image token covering the whole block. Pre-existing BI
    // operator token is discarded — the inline-image token subsumes it.
    if (opTok.value === 'BI') {
      const inlineTok = consumeInlineImage(ctx, opTok.start);
      tokens.push(inlineTok);
    } else {
      tokens.push(opTok);
    }
  }

  return { tokens, diagnostics };
}

// --- internals -----------------------------------------------------------

interface Ctx {
  input: Uint8Array;
  pos: number;
  end: number;
  diagnostics: TokenizerDiagnostic[];
}

function diag(ctx: Ctx, code: TokenizerDiagnosticCode, message: string): void {
  ctx.diagnostics.push({ at: ctx.pos, code, message });
}

function skipWhitespace(ctx: Ctx): void {
  while (ctx.pos < ctx.end && isWhitespace(ctx.input[ctx.pos])) ctx.pos++;
}

function readComment(ctx: Ctx): Token {
  const start = ctx.pos;
  // Skip the '%'
  ctx.pos++;
  // Read to EOL (CR or LF).
  let textStart = ctx.pos;
  while (ctx.pos < ctx.end) {
    const b = ctx.input[ctx.pos];
    if (b === 0x0a || b === 0x0d) break;
    ctx.pos++;
  }
  const value = bytesToLatin1(ctx.input, textStart, ctx.pos);
  return { kind: 'comment', start, end: ctx.pos, value };
}

function readName(ctx: Ctx): Token {
  const start = ctx.pos;
  // Skip the leading '/'
  ctx.pos++;
  // Read until whitespace or delimiter.
  const nameStart = ctx.pos;
  while (ctx.pos < ctx.end && !isWsOrDelim(ctx.input[ctx.pos])) {
    ctx.pos++;
  }
  // Decode #NN escapes per §7.3.5.
  const decoded = decodeNameEscapes(ctx.input, nameStart, ctx.pos, ctx);
  return { kind: 'name', start, end: ctx.pos, value: decoded };
}

function decodeNameEscapes(
  input: Uint8Array,
  from: number,
  to: number,
  ctx: Ctx
): string {
  // Names encode any byte as '#' + two hex digits; everything else is taken
  // literally. In practice the bytes outside escapes are 7-bit printable
  // ASCII, but spec doesn't constrain it — treat as ISO-8859-1 for fidelity.
  const out: number[] = [];
  let i = from;
  while (i < to) {
    const b = input[i];
    if (b !== 0x23 /* # */) {
      out.push(b);
      i++;
      continue;
    }
    // '#NN' escape — need two more hex bytes available.
    if (i + 2 >= to) {
      diag(ctx, 'invalid-name-escape', `truncated #NN at byte ${i}`);
      out.push(b);
      i++;
      continue;
    }
    const h1 = hexValue(input[i + 1]);
    const h2 = hexValue(input[i + 2]);
    if (h1 < 0 || h2 < 0) {
      diag(ctx, 'invalid-name-escape', `invalid hex pair after # at byte ${i}`);
      out.push(b);
      i++;
      continue;
    }
    out.push((h1 << 4) | h2);
    i += 3;
  }
  return bytesToLatin1FromArray(out);
}

function readLiteralString(ctx: Ctx): Token {
  const start = ctx.pos;
  // Skip the leading '('
  ctx.pos++;
  const out: number[] = [];
  let depth = 1; // count of unescaped open parens still open

  while (ctx.pos < ctx.end && depth > 0) {
    const b = ctx.input[ctx.pos];
    if (b === 0x28 /* ( */) {
      depth++;
      out.push(b);
      ctx.pos++;
    } else if (b === 0x29 /* ) */) {
      depth--;
      if (depth === 0) {
        ctx.pos++; // consume the closing paren
        break;
      }
      out.push(b);
      ctx.pos++;
    } else if (b === 0x5c /* \ */) {
      // Escape sequence (§7.3.4.2 Table 3).
      ctx.pos++;
      if (ctx.pos >= ctx.end) {
        diag(ctx, 'unterminated-string', `trailing backslash at byte ${ctx.pos}`);
        break;
      }
      const e = ctx.input[ctx.pos];
      if (e === 0x6e /* n */) {
        out.push(0x0a);
        ctx.pos++;
      } else if (e === 0x72 /* r */) {
        out.push(0x0d);
        ctx.pos++;
      } else if (e === 0x74 /* t */) {
        out.push(0x09);
        ctx.pos++;
      } else if (e === 0x62 /* b */) {
        out.push(0x08);
        ctx.pos++;
      } else if (e === 0x66 /* f */) {
        out.push(0x0c);
        ctx.pos++;
      } else if (e === 0x28 /* ( */ || e === 0x29 /* ) */ || e === 0x5c /* \ */) {
        out.push(e);
        ctx.pos++;
      } else if (e === 0x0d /* CR */) {
        // Line continuation: consume CR and optional LF, emit nothing.
        ctx.pos++;
        if (ctx.pos < ctx.end && ctx.input[ctx.pos] === 0x0a) ctx.pos++;
      } else if (e === 0x0a /* LF */) {
        // Line continuation.
        ctx.pos++;
      } else if (isDigit(e)) {
        // Octal escape: 1-3 digits.
        let value = e - 0x30;
        ctx.pos++;
        for (let k = 0; k < 2; k++) {
          if (ctx.pos < ctx.end && isDigit(ctx.input[ctx.pos]) && ctx.input[ctx.pos] <= 0x37) {
            value = (value << 3) | (ctx.input[ctx.pos] - 0x30);
            ctx.pos++;
          } else {
            break;
          }
        }
        out.push(value & 0xff);
      } else {
        // Unknown escape: per spec the backslash is dropped; emit the byte literally.
        out.push(e);
        ctx.pos++;
      }
    } else {
      // PDF strings may contain a literal CR; the spec says to treat CR or
      // CRLF (without the line-continuation backslash) as a single LF.
      if (b === 0x0d) {
        out.push(0x0a);
        ctx.pos++;
        if (ctx.pos < ctx.end && ctx.input[ctx.pos] === 0x0a) ctx.pos++;
      } else {
        out.push(b);
        ctx.pos++;
      }
    }
  }

  if (depth > 0) {
    diag(ctx, 'unterminated-string', `unterminated literal string starting at byte ${start}`);
  }

  return { kind: 'string', start, end: ctx.pos, value: Uint8Array.from(out) };
}

function readHexString(ctx: Ctx): Token {
  const start = ctx.pos;
  // Skip the leading '<'
  ctx.pos++;
  const bytes: number[] = [];
  let nibble = -1;
  while (ctx.pos < ctx.end) {
    const b = ctx.input[ctx.pos];
    if (b === 0x3e /* > */) {
      ctx.pos++;
      break;
    }
    if (isWhitespace(b)) {
      ctx.pos++;
      continue;
    }
    const v = hexValue(b);
    if (v < 0) {
      // Per spec invalid hex chars are an error; in practice we record and skip.
      diag(ctx, 'invalid-hex-pair', `non-hex byte 0x${b.toString(16)} in hex string`);
      ctx.pos++;
      continue;
    }
    if (nibble < 0) {
      nibble = v;
    } else {
      bytes.push((nibble << 4) | v);
      nibble = -1;
    }
    ctx.pos++;
  }
  // Per spec: an odd number of hex digits is treated as if followed by '0'.
  if (nibble >= 0) {
    bytes.push((nibble << 4) | 0);
  }
  if (ctx.pos > ctx.end || ctx.input[ctx.pos - 1] !== 0x3e) {
    // We hit end-of-stream without seeing '>'.
    diag(ctx, 'unterminated-hexstring', `unterminated hex string starting at byte ${start}`);
  }
  return { kind: 'hexstring', start, end: ctx.pos, value: Uint8Array.from(bytes) };
}

function tryReadNumber(ctx: Ctx): Token | null {
  // Numbers per §7.3.3:
  //   integer: optional sign, digits
  //   real:    optional sign, digits with a decimal point
  // PDF (unlike PostScript) does not allow exponents.
  const start = ctx.pos;
  let p = ctx.pos;
  if (ctx.input[p] === 0x2b /* + */ || ctx.input[p] === 0x2d /* - */) p++;
  let sawDigit = false;
  let sawDot = false;
  while (p < ctx.end) {
    const b = ctx.input[p];
    if (isDigit(b)) {
      sawDigit = true;
      p++;
    } else if (b === 0x2e /* . */ && !sawDot) {
      sawDot = true;
      p++;
    } else {
      break;
    }
  }
  if (!sawDigit) return null;
  // Must end at whitespace/delimiter/eof — otherwise this isn't a number,
  // it's the start of an operator like "true" or a malformed identifier.
  if (p < ctx.end && !isWsOrDelim(ctx.input[p])) {
    return null;
  }
  const text = bytesToLatin1(ctx.input, start, p);
  const value = sawDot ? parseFloat(text) : parseInt(text, 10);
  ctx.pos = p;
  return { kind: 'number', start, end: p, value };
}

function readOperator(ctx: Ctx): Token {
  const start = ctx.pos;
  while (ctx.pos < ctx.end && !isWsOrDelim(ctx.input[ctx.pos])) {
    ctx.pos++;
  }
  const value = bytesToLatin1(ctx.input, start, ctx.pos);
  return { kind: 'operator', start, end: ctx.pos, value };
}

function consumeInlineImage(ctx: Ctx, blockStart: number): Token {
  // We've already consumed 'BI'. Now skip everything up to and including
  // the matching 'EI'. Spec layout: BI <key/value pairs> ID <data> EI.
  //
  // Scanning the data is the tricky part — image bytes can contain anything.
  // Strategy: walk forward looking for whitespace + 'EI' followed by
  // whitespace or end-of-stream. This isn't bullet-proof for adversarial
  // inputs, but covers every well-formed PDF in the wild.
  //
  // We don't separately tokenize the dict pairs; the inline-image token is
  // opaque from BI..EI inclusive. The interpreter doesn't care about
  // inline-image internals for text editing.

  // First find the 'ID' marker (an operator preceded by whitespace).
  while (ctx.pos < ctx.end) {
    if (
      isWhitespace(ctx.input[ctx.pos]) &&
      ctx.pos + 2 < ctx.end &&
      ctx.input[ctx.pos + 1] === 0x49 /* I */ &&
      ctx.input[ctx.pos + 2] === 0x44 /* D */ &&
      // 'ID' must be followed by whitespace per spec.
      ctx.pos + 3 < ctx.end &&
      isWhitespace(ctx.input[ctx.pos + 3])
    ) {
      ctx.pos += 4; // consume the whitespace + 'ID' + the trailing whitespace
      break;
    }
    ctx.pos++;
  }

  // Now scan for 'EI' preceded by whitespace.
  while (ctx.pos < ctx.end) {
    if (
      isWhitespace(ctx.input[ctx.pos]) &&
      ctx.pos + 2 < ctx.end &&
      ctx.input[ctx.pos + 1] === 0x45 /* E */ &&
      ctx.input[ctx.pos + 2] === 0x49 /* I */ &&
      // 'EI' must be at a token boundary: followed by ws/delim or EOF.
      (ctx.pos + 3 >= ctx.end || isWsOrDelim(ctx.input[ctx.pos + 3]))
    ) {
      // Position now sits on the whitespace before EI; consume up to and
      // including the 'EI' bytes.
      ctx.pos += 3; // ws + 'E' + 'I'
      return { kind: 'inline-image', start: blockStart, end: ctx.pos };
    }
    ctx.pos++;
  }

  // Reached EOF without matching EI — record diagnostic but still emit a
  // token spanning what we consumed so the caller can decide what to do.
  diag(ctx, 'unterminated-inline-image', `inline image starting at byte ${blockStart} has no EI`);
  return { kind: 'inline-image', start: blockStart, end: ctx.pos };
}

function bytesToLatin1(buf: Uint8Array, from: number, to: number): string {
  // ISO-8859-1 byte→char mapping; preserves every byte 0–255 round-trippably.
  let s = '';
  for (let i = from; i < to; i++) s += String.fromCharCode(buf[i]);
  return s;
}

function bytesToLatin1FromArray(arr: number[]): string {
  let s = '';
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return s;
}
