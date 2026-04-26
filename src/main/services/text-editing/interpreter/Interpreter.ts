// Content-stream interpreter.
//
// Walks a token sequence (from Tokenizer) and emits semantic events:
//   - text-run        when Tj/TJ/'/" fires; carries the decoded text plus
//                     enough state (font, color, matrices, byte ranges) to
//                     drive both the locator and later byte-surgery.
//   - do-xobject      when `Do` fires; v1 doesn't recurse into Form XObjects.
//   - unsupported-op  for operators we silently track but don't fully model.
//
// The interpreter is intentionally permissive: unknown operators are logged
// to diagnostics and skipped, matching how mupdf and pdf.js handle the long
// tail of malformed real-world PDFs.

import type {
  FontResolver,
  GraphicsState,
  InterpretResult,
  InterpreterDiagnostic,
  InterpreterDiagnosticCode,
  InterpreterEvent,
  Matrix,
  RgbColor,
  TextRun,
  TextState,
  TjArrayItem,
  Token,
} from './types';
import { IDENTITY, concat, translation } from './matrix';

interface InterpretOptions {
  /** Set true when interpreting a stream that's itself the body of a Form XObject. */
  inXObject?: boolean;
}

const DEFAULT_TEXT_STATE: TextState = {
  font: null,
  textMatrix: IDENTITY,
  textLineMatrix: IDENTITY,
  charSpacing: 0,
  wordSpacing: 0,
  horizontalScale: 100,
  leading: 0,
  rise: 0,
  renderMode: 0,
};

const DEFAULT_GRAPHICS_STATE: GraphicsState = {
  ctm: IDENTITY,
  fillColor: { r: 0, g: 0, b: 0 },
  strokeColor: { r: 0, g: 0, b: 0 },
};

/**
 * Interpret a content-stream token sequence and return the events + diagnostics.
 */
export function interpret(
  tokens: Token[],
  resolver: FontResolver,
  options: InterpretOptions = {}
): InterpretResult {
  const events: InterpreterEvent[] = [];
  const diagnostics: InterpreterDiagnostic[] = [];

  // Graphics state stack (q / Q).
  const gsStack: GraphicsState[] = [{ ...DEFAULT_GRAPHICS_STATE }];
  // Active text state (only meaningful between BT and ET).
  let textState: TextState = { ...DEFAULT_TEXT_STATE };
  let inTextObject = false;

  // Operand stack — drained on each operator.
  const operandStack: Operand[] = [];

  const inXObject = options.inXObject === true;

  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    switch (tok.kind) {
      case 'comment':
        i++;
        break;
      case 'inline-image':
        // Inline images don't push operands; just step over.
        operandStack.length = 0;
        i++;
        break;
      case 'array-open': {
        const parsed = parseArrayOperand(tokens, i, resolver, currentFontResource(textState));
        if (!parsed) {
          // Couldn't find matching ']'; record and skip.
          diagnostics.push({
            at: tok.start,
            code: 'unknown-operator',
            message: `unmatched array-open at byte ${tok.start}`,
          });
          i++;
          break;
        }
        operandStack.push(parsed.operand);
        i = parsed.nextI;
        break;
      }
      case 'dict-open': {
        const parsed = parseDictOperand(tokens, i);
        if (!parsed) {
          diagnostics.push({
            at: tok.start,
            code: 'unknown-operator',
            message: `unmatched dict-open at byte ${tok.start}`,
          });
          i++;
          break;
        }
        operandStack.push(parsed.operand);
        i = parsed.nextI;
        break;
      }
      case 'array-close':
      case 'dict-close':
        // Stray closer at top level — skip.
        diagnostics.push({
          at: tok.start,
          code: 'unknown-operator',
          message: `stray ${tok.kind} at byte ${tok.start}`,
        });
        i++;
        break;
      case 'number':
        operandStack.push({
          kind: 'number',
          value: tok.value as number,
          start: tok.start,
          end: tok.end,
        });
        i++;
        break;
      case 'name':
        operandStack.push({
          kind: 'name',
          value: tok.value as string,
          start: tok.start,
          end: tok.end,
        });
        i++;
        break;
      case 'string':
      case 'hexstring':
        operandStack.push({
          kind: 'string',
          bytes: tok.value as Uint8Array,
          start: tok.start,
          end: tok.end,
          isHex: tok.kind === 'hexstring',
        });
        i++;
        break;
      case 'eof':
        i++;
        break;
      case 'operator': {
        const opName = tok.value as string;
        executeOperator(opName, tok, operandStack, {
          gsStack,
          textState,
          setTextState: (s) => {
            textState = s;
          },
          inTextObject,
          setInTextObject: (v) => {
            inTextObject = v;
          },
          resolver,
          inXObject,
          events,
          diagnostics,
          recordDiagnostic: (code, message) =>
            diagnostics.push({ at: tok.start, code, message }),
        });
        operandStack.length = 0;
        i++;
        break;
      }
    }
  }

  return { events, diagnostics };
}

// =============================================================================
// Operand parsing (arrays / dicts as compound operands).
// =============================================================================

type Operand =
  | { kind: 'number'; value: number; start: number; end: number }
  | { kind: 'name'; value: string; start: number; end: number }
  | {
      kind: 'string';
      bytes: Uint8Array;
      start: number;
      end: number;
      isHex: boolean;
    }
  | { kind: 'array'; items: Operand[]; start: number; end: number }
  | { kind: 'dict'; start: number; end: number };

function currentFontResource(textState: TextState): string | null {
  return textState.font?.resourceName ?? null;
}

function parseArrayOperand(
  tokens: Token[],
  start: number,
  _resolver: FontResolver,
  _activeFont: string | null
): { operand: Operand; nextI: number } | null {
  // tokens[start] must be array-open. Walk to the matching array-close.
  const openTok = tokens[start];
  if (openTok.kind !== 'array-open') return null;

  const items: Operand[] = [];
  let depth = 1;
  let i = start + 1;
  while (i < tokens.length && depth > 0) {
    const t = tokens[i];
    switch (t.kind) {
      case 'array-open': {
        const nested = parseArrayOperand(tokens, i, _resolver, _activeFont);
        if (!nested) return null;
        items.push(nested.operand);
        i = nested.nextI;
        break;
      }
      case 'array-close':
        depth--;
        if (depth === 0) {
          return {
            operand: {
              kind: 'array',
              items,
              start: openTok.start,
              end: t.end,
            },
            nextI: i + 1,
          };
        }
        i++;
        break;
      case 'number':
        items.push({
          kind: 'number',
          value: t.value as number,
          start: t.start,
          end: t.end,
        });
        i++;
        break;
      case 'name':
        items.push({
          kind: 'name',
          value: t.value as string,
          start: t.start,
          end: t.end,
        });
        i++;
        break;
      case 'string':
      case 'hexstring':
        items.push({
          kind: 'string',
          bytes: t.value as Uint8Array,
          start: t.start,
          end: t.end,
          isHex: t.kind === 'hexstring',
        });
        i++;
        break;
      case 'dict-open': {
        const nested = parseDictOperand(tokens, i);
        if (!nested) return null;
        items.push(nested.operand);
        i = nested.nextI;
        break;
      }
      // Operators / other token kinds inside an array are unusual; skip.
      default:
        i++;
        break;
    }
  }
  return null; // unterminated
}

function parseDictOperand(
  tokens: Token[],
  start: number
): { operand: Operand; nextI: number } | null {
  // For now we treat dicts as opaque — we just find the matching dict-close
  // and remember the byte range. The interpreter doesn't need dict contents
  // for any operator we currently support (inline-image dicts are handled
  // by the tokenizer itself).
  const openTok = tokens[start];
  if (openTok.kind !== 'dict-open') return null;
  let depth = 1;
  let i = start + 1;
  while (i < tokens.length && depth > 0) {
    const t = tokens[i];
    if (t.kind === 'dict-open') depth++;
    else if (t.kind === 'dict-close') {
      depth--;
      if (depth === 0) {
        return {
          operand: { kind: 'dict', start: openTok.start, end: t.end },
          nextI: i + 1,
        };
      }
    }
    i++;
  }
  return null;
}

// =============================================================================
// Operator dispatch.
// =============================================================================

interface OpCtx {
  gsStack: GraphicsState[];
  textState: TextState;
  setTextState: (s: TextState) => void;
  inTextObject: boolean;
  setInTextObject: (v: boolean) => void;
  resolver: FontResolver;
  inXObject: boolean;
  events: InterpreterEvent[];
  diagnostics: InterpreterDiagnostic[];
  recordDiagnostic: (code: InterpreterDiagnosticCode, message: string) => void;
}

function executeOperator(opName: string, opTok: Token, stack: Operand[], ctx: OpCtx): void {
  // Top-level dispatch. Only operators we care about; everything else is
  // silently tracked as 'unsupported-op' (still emits an event so callers
  // can audit coverage).
  switch (opName) {
    // ---------- Graphics state stack ----------
    case 'q':
      ctx.gsStack.push(cloneGraphicsState(top(ctx.gsStack)));
      return;
    case 'Q':
      if (ctx.gsStack.length <= 1) {
        ctx.recordDiagnostic('graphics-state-underflow', `Q with empty stack at byte ${opTok.start}`);
        return;
      }
      ctx.gsStack.pop();
      return;
    case 'cm': {
      // a b c d e f cm
      const m = consumeMatrix(stack);
      if (!m) {
        ctx.recordDiagnostic('missing-operand', 'cm requires 6 numeric operands');
        return;
      }
      const gs = top(ctx.gsStack);
      gs.ctm = concat(m, gs.ctm);
      return;
    }

    // ---------- Color (non-stroking / fill) ----------
    case 'g': {
      const gray = consumeNumber(stack);
      if (gray === null) {
        ctx.recordDiagnostic('missing-operand', 'g requires 1 operand');
        return;
      }
      top(ctx.gsStack).fillColor = { r: gray, g: gray, b: gray };
      return;
    }
    case 'rg': {
      const b = consumeNumber(stack);
      const g = consumeNumber(stack);
      const r = consumeNumber(stack);
      if (r === null || g === null || b === null) {
        ctx.recordDiagnostic('missing-operand', 'rg requires 3 operands');
        return;
      }
      top(ctx.gsStack).fillColor = { r, g, b };
      return;
    }
    case 'k': {
      const k = consumeNumber(stack);
      const y = consumeNumber(stack);
      const m = consumeNumber(stack);
      const c = consumeNumber(stack);
      if (c === null || m === null || y === null || k === null) {
        ctx.recordDiagnostic('missing-operand', 'k requires 4 operands');
        return;
      }
      top(ctx.gsStack).fillColor = cmykToRgb(c, m, y, k);
      return;
    }

    // ---------- Color (stroking) ----------
    case 'G': {
      const gray = consumeNumber(stack);
      if (gray === null) return;
      top(ctx.gsStack).strokeColor = { r: gray, g: gray, b: gray };
      return;
    }
    case 'RG': {
      const b = consumeNumber(stack);
      const g = consumeNumber(stack);
      const r = consumeNumber(stack);
      if (r === null || g === null || b === null) return;
      top(ctx.gsStack).strokeColor = { r, g, b };
      return;
    }
    case 'K': {
      const k = consumeNumber(stack);
      const y = consumeNumber(stack);
      const m = consumeNumber(stack);
      const c = consumeNumber(stack);
      if (c === null || m === null || y === null || k === null) return;
      top(ctx.gsStack).strokeColor = cmykToRgb(c, m, y, k);
      return;
    }

    // Color space + scn variants — track the operand count so the stack
    // gets cleared properly, but don't try to interpret arbitrary color
    // spaces (Separation, DeviceN, ICCBased, etc.) yet. v1 is fine using
    // the most recently-set RGB/Gray/CMYK.
    case 'cs':
    case 'CS':
    case 'sc':
    case 'SC':
    case 'scn':
    case 'SCN':
      ctx.events.push({
        kind: 'unsupported-op',
        opName,
        opStart: opTok.start,
        opEnd: opTok.end,
      });
      return;

    // ---------- Text object ----------
    case 'BT':
      ctx.setTextState({
        ...DEFAULT_TEXT_STATE,
        // font + spacing carry over from any prior BT/ET pair? Per spec
        // these reset on BT, but in practice many PDFs assume otherwise.
        // We follow the spec strictly and reset.
      });
      ctx.setInTextObject(true);
      return;
    case 'ET':
      ctx.setInTextObject(false);
      return;

    // ---------- Text state ----------
    case 'Tc':
      ctx.textState = { ...ctx.textState, charSpacing: consumeNumber(stack) ?? 0 };
      ctx.setTextState(ctx.textState);
      return;
    case 'Tw':
      ctx.textState = { ...ctx.textState, wordSpacing: consumeNumber(stack) ?? 0 };
      ctx.setTextState(ctx.textState);
      return;
    case 'Tz':
      ctx.textState = { ...ctx.textState, horizontalScale: consumeNumber(stack) ?? 100 };
      ctx.setTextState(ctx.textState);
      return;
    case 'TL':
      ctx.textState = { ...ctx.textState, leading: consumeNumber(stack) ?? 0 };
      ctx.setTextState(ctx.textState);
      return;
    case 'Tf': {
      const size = consumeNumber(stack);
      const name = consumeName(stack);
      if (size === null || name === null) {
        ctx.recordDiagnostic('missing-operand', 'Tf requires <name> <size>');
        return;
      }
      ctx.textState = {
        ...ctx.textState,
        font: { resourceName: name, size },
      };
      ctx.setTextState(ctx.textState);
      return;
    }
    case 'Tr':
      ctx.textState = { ...ctx.textState, renderMode: consumeNumber(stack) ?? 0 };
      ctx.setTextState(ctx.textState);
      return;
    case 'Ts':
      ctx.textState = { ...ctx.textState, rise: consumeNumber(stack) ?? 0 };
      ctx.setTextState(ctx.textState);
      return;

    // ---------- Text positioning ----------
    case 'Td': {
      // tx ty Td → translate text line matrix by (tx, ty); textMatrix = textLineMatrix
      if (!ctx.inTextObject) {
        ctx.recordDiagnostic('text-op-outside-bt-et', 'Td outside BT/ET');
        return;
      }
      const ty = consumeNumber(stack);
      const tx = consumeNumber(stack);
      if (tx === null || ty === null) return;
      const newLine = concat(translation(tx, ty), ctx.textState.textLineMatrix);
      ctx.textState = {
        ...ctx.textState,
        textLineMatrix: newLine,
        textMatrix: newLine,
      };
      ctx.setTextState(ctx.textState);
      return;
    }
    case 'TD': {
      // tx ty TD → like Td but also sets leading to -ty
      if (!ctx.inTextObject) {
        ctx.recordDiagnostic('text-op-outside-bt-et', 'TD outside BT/ET');
        return;
      }
      const ty = consumeNumber(stack);
      const tx = consumeNumber(stack);
      if (tx === null || ty === null) return;
      const newLine = concat(translation(tx, ty), ctx.textState.textLineMatrix);
      ctx.textState = {
        ...ctx.textState,
        textLineMatrix: newLine,
        textMatrix: newLine,
        leading: -ty,
      };
      ctx.setTextState(ctx.textState);
      return;
    }
    case 'Tm': {
      // a b c d e f Tm — set both textMatrix and textLineMatrix
      if (!ctx.inTextObject) {
        ctx.recordDiagnostic('text-op-outside-bt-et', 'Tm outside BT/ET');
        return;
      }
      const m = consumeMatrix(stack);
      if (!m) {
        ctx.recordDiagnostic('missing-operand', 'Tm requires 6 numeric operands');
        return;
      }
      ctx.textState = {
        ...ctx.textState,
        textMatrix: m,
        textLineMatrix: m,
      };
      ctx.setTextState(ctx.textState);
      return;
    }
    case 'T*': {
      // Move to start of next line, using current leading. T* ≡ 0 -leading Td
      if (!ctx.inTextObject) {
        ctx.recordDiagnostic('text-op-outside-bt-et', 'T* outside BT/ET');
        return;
      }
      const newLine = concat(
        translation(0, -ctx.textState.leading),
        ctx.textState.textLineMatrix
      );
      ctx.textState = {
        ...ctx.textState,
        textLineMatrix: newLine,
        textMatrix: newLine,
      };
      ctx.setTextState(ctx.textState);
      return;
    }

    // ---------- Text showing ----------
    case 'Tj': {
      if (!ctx.inTextObject) {
        ctx.recordDiagnostic('text-op-outside-bt-et', 'Tj outside BT/ET');
        return;
      }
      const op = consumeStringOperand(stack);
      if (!op) {
        ctx.recordDiagnostic('missing-operand', 'Tj requires a string operand');
        return;
      }
      emitTextRun(ctx, opTok, 'Tj', op);
      return;
    }
    case 'TJ': {
      if (!ctx.inTextObject) {
        ctx.recordDiagnostic('text-op-outside-bt-et', 'TJ outside BT/ET');
        return;
      }
      const op = consumeArrayOperand(stack);
      if (!op) {
        ctx.recordDiagnostic('missing-operand', 'TJ requires an array operand');
        return;
      }
      emitTextRunFromArray(ctx, opTok, op);
      return;
    }
    case "'": {
      // (string) ' ≡ T* (string) Tj
      if (!ctx.inTextObject) {
        ctx.recordDiagnostic('text-op-outside-bt-et', "' outside BT/ET");
        return;
      }
      const op = consumeStringOperand(stack);
      if (!op) {
        ctx.recordDiagnostic('missing-operand', "' requires a string operand");
        return;
      }
      // Apply implicit T*
      const newLine = concat(
        translation(0, -ctx.textState.leading),
        ctx.textState.textLineMatrix
      );
      ctx.textState = {
        ...ctx.textState,
        textLineMatrix: newLine,
        textMatrix: newLine,
      };
      ctx.setTextState(ctx.textState);
      emitTextRun(ctx, opTok, "'", op);
      return;
    }
    case '"': {
      // aw ac (string) " ≡ aw Tw ac Tc T* (string) Tj
      if (!ctx.inTextObject) {
        ctx.recordDiagnostic('text-op-outside-bt-et', '" outside BT/ET');
        return;
      }
      const op = consumeStringOperand(stack);
      const ac = consumeNumber(stack);
      const aw = consumeNumber(stack);
      if (!op || ac === null || aw === null) {
        ctx.recordDiagnostic('missing-operand', '" requires aw ac (string)');
        return;
      }
      const newLine = concat(
        translation(0, -ctx.textState.leading),
        ctx.textState.textLineMatrix
      );
      ctx.textState = {
        ...ctx.textState,
        wordSpacing: aw,
        charSpacing: ac,
        textLineMatrix: newLine,
        textMatrix: newLine,
      };
      ctx.setTextState(ctx.textState);
      emitTextRun(ctx, opTok, '"', op);
      return;
    }

    // ---------- XObjects ----------
    case 'Do': {
      const name = consumeName(stack);
      if (name === null) {
        ctx.recordDiagnostic('missing-operand', 'Do requires a name operand');
        return;
      }
      ctx.events.push({
        kind: 'do-xobject',
        name,
        opStart: opTok.start,
        opEnd: opTok.end,
      });
      return;
    }

    // ---------- Default: log, do not throw ----------
    default:
      ctx.events.push({
        kind: 'unsupported-op',
        opName,
        opStart: opTok.start,
        opEnd: opTok.end,
      });
      return;
  }
}

// =============================================================================
// Text-run emission helpers.
// =============================================================================

function emitTextRun(
  ctx: OpCtx,
  opTok: Token,
  operator: 'Tj' | "'" | '"',
  op: { bytes: Uint8Array; start: number; end: number; isHex: boolean }
): void {
  const text = decodeWithFont(ctx, op.bytes);
  const gs = top(ctx.gsStack);
  const font = ctx.textState.font ?? { resourceName: '', size: 0 };
  const run: TextRun = {
    text,
    operator,
    opStart: op.start,
    opEnd: opTok.end,
    bytes: op.bytes,
    operandStart: op.start,
    operandEnd: op.end,
    isHex: op.isHex,
    fontResourceName: font.resourceName,
    fontSize: font.size,
    textMatrix: ctx.textState.textMatrix,
    ctm: gs.ctm,
    fillColor: { ...gs.fillColor },
    strokeColor: { ...gs.strokeColor },
    inXObject: ctx.inXObject,
  };
  ctx.events.push({ kind: 'text-run', run });
}

function emitTextRunFromArray(ctx: OpCtx, opTok: Token, arr: ArrayOperand): void {
  const items: TjArrayItem[] = [];
  let combined = '';
  for (const item of arr.items) {
    if (item.kind === 'string') {
      const text = decodeWithFont(ctx, item.bytes);
      combined += text;
      items.push({
        kind: 'string',
        text,
        bytes: item.bytes,
        operandStart: item.start,
        operandEnd: item.end,
        isHex: item.isHex,
      });
    } else if (item.kind === 'number') {
      items.push({ kind: 'kern', value: item.value });
    }
    // names/arrays/dicts inside TJ are technically illegal — skip.
  }
  const gs = top(ctx.gsStack);
  const font = ctx.textState.font ?? { resourceName: '', size: 0 };
  const run: TextRun = {
    text: combined,
    operator: 'TJ',
    opStart: arr.start,
    opEnd: opTok.end,
    fontResourceName: font.resourceName,
    fontSize: font.size,
    textMatrix: ctx.textState.textMatrix,
    ctm: gs.ctm,
    fillColor: { ...gs.fillColor },
    strokeColor: { ...gs.strokeColor },
    tjArray: items,
    inXObject: ctx.inXObject,
  };
  ctx.events.push({ kind: 'text-run', run });
}

function decodeWithFont(ctx: OpCtx, bytes: Uint8Array): string {
  const font = ctx.textState.font;
  if (!font) {
    // No font set; fall back to Latin1.
    return latin1(bytes);
  }
  return ctx.resolver.decodeText(font.resourceName, bytes);
}

// =============================================================================
// Operand stack helpers.
// =============================================================================

function consumeNumber(stack: Operand[]): number | null {
  const op = stack.pop();
  if (op && op.kind === 'number') return op.value;
  if (op) stack.push(op); // not consumed
  return null;
}

function consumeName(stack: Operand[]): string | null {
  const op = stack.pop();
  if (op && op.kind === 'name') return op.value;
  if (op) stack.push(op);
  return null;
}

function consumeMatrix(stack: Operand[]): Matrix | null {
  // Read 6 numbers in reverse off the stack.
  const buf: number[] = [];
  for (let n = 0; n < 6; n++) {
    const v = consumeNumber(stack);
    if (v === null) {
      // Roll back what we consumed.
      // (Not strictly necessary — caller resets stack — but be safe.)
      return null;
    }
    buf.push(v);
  }
  // We popped in reverse, so the last popped (index 5) is the first operand.
  return [buf[5], buf[4], buf[3], buf[2], buf[1], buf[0]];
}

function consumeStringOperand(
  stack: Operand[]
): { bytes: Uint8Array; start: number; end: number; isHex: boolean } | null {
  const op = stack.pop();
  if (op && op.kind === 'string') {
    return { bytes: op.bytes, start: op.start, end: op.end, isHex: op.isHex };
  }
  if (op) stack.push(op);
  return null;
}

interface ArrayOperand {
  items: Operand[];
  start: number;
  end: number;
}

function consumeArrayOperand(stack: Operand[]): ArrayOperand | null {
  const op = stack.pop();
  if (op && op.kind === 'array') {
    return { items: op.items, start: op.start, end: op.end };
  }
  if (op) stack.push(op);
  return null;
}

// =============================================================================
// Misc helpers.
// =============================================================================

function top<T>(stack: T[]): T {
  return stack[stack.length - 1];
}

function cloneGraphicsState(gs: GraphicsState): GraphicsState {
  return {
    ctm: gs.ctm,
    fillColor: { ...gs.fillColor },
    strokeColor: { ...gs.strokeColor },
  };
}

function cmykToRgb(c: number, m: number, y: number, k: number): RgbColor {
  // Per ISO 32000-2 §8.6.5.3 — naive conversion (not ICC-aware).
  const r = (1 - c) * (1 - k);
  const g = (1 - m) * (1 - k);
  const b = (1 - y) * (1 - k);
  return { r, g, b };
}

function latin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}
