// Types shared across the content-stream interpreter modules.
//
// The tokenizer produces Tokens with byte-accurate ranges so later editing
// passes can splice operator operands without serialize-deserialize cycles
// (which would silently change formatting and break round-trips).

/**
 * One token from a PDF content stream.
 * Ranges are half-open: [start, end) into the source byte buffer.
 */
export interface Token {
  kind: TokenKind;
  /** Inclusive byte offset where the token starts in the source buffer. */
  start: number;
  /** Exclusive byte offset where the token ends. */
  end: number;
  /**
   * Decoded value for tokens whose meaning isn't obvious from the byte range:
   *   - 'name'      → string (the name with #NN escapes already resolved)
   *   - 'string'    → Uint8Array (raw decoded bytes; PDF strings are byte
   *                   sequences, not text — encoding depends on the font)
   *   - 'hexstring' → Uint8Array (decoded bytes from the hex pairs)
   *   - 'number'    → number (parsed integer or real)
   *   - 'operator'  → string (the operator identifier, e.g. "Tj", "BT", "cm")
   *   - 'comment'   → string (text after the % up to but not including EOL)
   * Other kinds (delimiters, eof, inline-image) carry no decoded value.
   */
  value?: TokenValue;
}

export type TokenKind =
  | 'name' // /Foo  /Foo#20Bar
  | 'string' // (literal string with escapes and balanced parens)
  | 'hexstring' // <DEAD BEEF>
  | 'number' // 123, -.5, +1.0e3 (PDFs allow no exponent — see notes)
  | 'array-open' // [
  | 'array-close' // ]
  | 'dict-open' // <<
  | 'dict-close' // >>
  | 'operator' // any postfix identifier: Tj, BT, q, cm, ...
  | 'comment' // % ... up to EOL
  | 'inline-image' // BI ... ID <data> EI as a single opaque block
  | 'eof';

export type TokenValue = string | number | Uint8Array;

/**
 * A diagnostic raised by the tokenizer when input is malformed.
 * The tokenizer is permissive — it tries to recover where possible
 * (real-world PDFs are full of slightly-broken content streams) — but
 * records what it had to skip so callers can surface or log it.
 */
export interface TokenizerDiagnostic {
  /** Byte offset where the issue was detected. */
  at: number;
  /** Short machine-readable code, e.g. 'unterminated-string'. */
  code: TokenizerDiagnosticCode;
  /** Human-readable message for logs. */
  message: string;
}

export type TokenizerDiagnosticCode =
  | 'unterminated-string'
  | 'unterminated-hexstring'
  | 'unterminated-comment'
  | 'unterminated-inline-image'
  | 'invalid-name-escape'
  | 'invalid-hex-pair'
  | 'unbalanced-paren';

/**
 * Result of tokenizing a content stream. Tokens are returned in order
 * of appearance; diagnostics are collected without throwing.
 */
export interface TokenizeResult {
  tokens: Token[];
  diagnostics: TokenizerDiagnostic[];
}

// ============================================================================
// Interpreter types — the state machine that walks tokens and emits events.
// ============================================================================

/**
 * A 2D affine transform stored row-major as [a b c d e f], representing
 *   [a b 0]
 *   [c d 0]
 *   [e f 1]
 * which transforms a point (x, y) to (a*x + c*y + e, b*x + d*y + f).
 *
 * This matches PDF's representation in `cm` / `Tm` operators.
 */
export type Matrix = readonly [number, number, number, number, number, number];

/** RGB color channels, each in [0, 1]. */
export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/**
 * Subset of PDF graphics state that affects text rendering. Pushed/popped
 * by `q`/`Q`. We track only what later phases need; line widths, dash
 * patterns, etc. are ignored.
 */
export interface GraphicsState {
  ctm: Matrix;
  fillColor: RgbColor;
  strokeColor: RgbColor;
}

/**
 * Text state. Active only between `BT` and `ET`; all fields are reset to
 * their defaults on each `BT` per ISO 32000-2 §9.3.1.
 */
export interface TextState {
  font: { resourceName: string; size: number } | null;
  textMatrix: Matrix;
  textLineMatrix: Matrix;
  charSpacing: number;
  wordSpacing: number;
  horizontalScale: number; // Tz, percentage where 100 = normal
  leading: number; // TL
  rise: number; // Ts
  renderMode: number; // Tr (0 = fill default)
}

/**
 * The shape of an array operand for the `TJ` operator. Strings and numeric
 * kern offsets alternate freely. We preserve byte ranges for each string
 * piece so byte-surgery can later replace one piece without disturbing the
 * others.
 */
export type TjArrayItem =
  | {
      kind: 'string';
      text: string; // decoded via the active font's encoding
      bytes: Uint8Array; // raw bytes from the operand
      operandStart: number; // byte offset of the literal/hex string in the source
      operandEnd: number;
      isHex: boolean;
    }
  | {
      kind: 'kern';
      value: number; // negative = move right (space removed); positive = move left
    };

/**
 * One text-showing event from the interpreter. Captures everything later
 * phases need to (a) match against mupdf's structured-text JSON for the
 * locator, (b) reuse the original font/color when reemitting text, and
 * (c) splice operand bytes for in-place byte-surgery.
 */
export interface TextRun {
  /** Concatenated decoded text (for TJ, all string pieces joined). */
  text: string;

  /** Which text-showing operator produced this run. */
  operator: 'Tj' | 'TJ' | "'" | '"';

  /**
   * Byte range of the entire op block (operands + opcode), in the source
   * content stream. For `Tj` this covers `(string) Tj`; for `TJ` it covers
   * `[...] TJ`; for `'` and `"` it covers all operands and the opcode.
   */
  opStart: number;
  opEnd: number;

  /** Raw operand bytes for `Tj` / `'` / `"` (the single string operand). */
  bytes?: Uint8Array;
  /** Byte range of the string operand alone (for byte-surgery). `Tj`/`'`/`"`. */
  operandStart?: number;
  operandEnd?: number;
  /** Was the string a hex string `<...>` rather than a literal `(...)`? */
  isHex?: boolean;

  /** For `TJ`, the array elements with their byte ranges. */
  tjArray?: TjArrayItem[];

  /** Active font at the time of this run. */
  fontResourceName: string;
  fontSize: number;

  /** Position-tracking matrices at the moment the op was executed. */
  textMatrix: Matrix;
  ctm: Matrix;

  /** Active fill color (used for text rendering modes 0 and 2). */
  fillColor: RgbColor;
  /** Active stroke color (used for text rendering modes 1 and 2). */
  strokeColor: RgbColor;

  /** True if this run was discovered inside a Form XObject (`Do`). v1 refuses these. */
  inXObject: boolean;
}

/** Interpreter events emitted as the state machine walks the token stream. */
export type InterpreterEvent =
  | { kind: 'text-run'; run: TextRun }
  | { kind: 'do-xobject'; name: string; opStart: number; opEnd: number }
  | { kind: 'unsupported-op'; opName: string; opStart: number; opEnd: number };

export interface InterpreterDiagnostic {
  at: number;
  code: InterpreterDiagnosticCode;
  message: string;
}

export type InterpreterDiagnosticCode =
  | 'graphics-state-underflow' // Q without matching q
  | 'text-op-outside-bt-et' // Tj/TJ/Td/etc. outside BT...ET
  | 'missing-operand' // an op fired with too few operands on the stack
  | 'unknown-operator';

export interface InterpretResult {
  events: InterpreterEvent[];
  diagnostics: InterpreterDiagnostic[];
}

/**
 * Pluggable font encoding lookup. The interpreter calls `decodeText` for
 * every `Tj`/`TJ` operand string. Encoding logic (WinAnsi/MacRoman/
 * Identity-H/etc.) lives outside the interpreter; for unit tests a simple
 * Latin1 stub is sufficient.
 */
export interface FontResolver {
  decodeText(fontResourceName: string, bytes: Uint8Array): string;
}
