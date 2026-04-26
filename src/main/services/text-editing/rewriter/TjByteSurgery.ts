// Tj-byte surgery — splice new operand bytes into the original content
// stream while preserving every other byte (operators, whitespace,
// comments, font references).
//
// This is the byte-perfect path: the page's /Resources/Font dict is
// untouched, the original /F# reference still points at the same font,
// and the only diff in the saved PDF is the new bytes inside the
// `(...)` / `<...>` operand. The rendered text adopts the original
// font's metrics automatically because the operator and font are unchanged.
//
// Used only when the policy layer has confirmed that:
//   1. The locator returned the operand byte range with high confidence.
//   2. The new text encodes cleanly for the active font's encoding.
//   3. The font is NOT a subset that's missing any of the new glyphs
//      (or the layer above has expanded the subset — Phase 4d.5).
//
// Otherwise the orchestrator falls back to RedactAndReemit (Phase 4b).

import { serializeStringPreservingForm } from './StreamWriter';

export interface TjOperandReplacement {
  /** Byte offset of the *first* byte of the operand string in the source. */
  operandStart: number;
  /** Byte offset *after* the last byte of the operand string. */
  operandEnd: number;
  /** Was the original written as `<hex>`? Then we keep it that way. */
  preserveHex: boolean;
  /** New bytes already encoded for the active font's encoding. */
  newBytes: Uint8Array;
}

/**
 * Apply a set of operand replacements to a content stream, returning the
 * modified bytes. Replacements may target multiple Tj operands across the
 * stream (one per edit) or multiple string items within a single TJ array.
 *
 * Throws if any two replacements overlap. Caller is responsible for
 * deciding which replacements are coherent — this function blindly splices.
 */
export function applyOperandReplacements(
  source: Uint8Array,
  replacements: TjOperandReplacement[]
): Uint8Array {
  if (replacements.length === 0) {
    // Defensive copy so callers can mutate the result without aliasing.
    return new Uint8Array(source);
  }

  validateReplacements(source, replacements);

  // Sort in ascending order so we can splice in a single forward pass.
  const sorted = replacements.slice().sort((a, b) => a.operandStart - b.operandStart);

  // Pre-serialize each replacement so we know the final length before
  // allocating the output buffer.
  const serialized = sorted.map((r) => {
    const s = serializeStringPreservingForm(r.newBytes, r.preserveHex);
    return {
      ...r,
      bytes: utf8Encode(s.text),
    };
  });

  // Compute the output length: source length + sum of (newLen - oldLen)
  // for each replacement.
  let totalLen = source.length;
  for (const r of serialized) {
    totalLen += r.bytes.length - (r.operandEnd - r.operandStart);
  }
  const out = new Uint8Array(totalLen);

  // Walk source and replacements in lockstep.
  let srcCursor = 0;
  let dstCursor = 0;
  for (const r of serialized) {
    // Copy bytes before this replacement.
    const head = source.subarray(srcCursor, r.operandStart);
    out.set(head, dstCursor);
    dstCursor += head.length;
    // Insert the new bytes.
    out.set(r.bytes, dstCursor);
    dstCursor += r.bytes.length;
    srcCursor = r.operandEnd;
  }
  // Copy the tail.
  if (srcCursor < source.length) {
    const tail = source.subarray(srcCursor);
    out.set(tail, dstCursor);
    dstCursor += tail.length;
  }

  if (dstCursor !== totalLen) {
    throw new Error(
      `applyOperandReplacements: produced ${dstCursor} bytes, expected ${totalLen} — internal length-tracking bug`
    );
  }

  return out;
}

function validateReplacements(source: Uint8Array, replacements: TjOperandReplacement[]): void {
  for (const r of replacements) {
    if (r.operandStart < 0 || r.operandEnd > source.length) {
      throw new Error(
        `replacement out of bounds: [${r.operandStart}, ${r.operandEnd}) vs source length ${source.length}`
      );
    }
    if (r.operandEnd < r.operandStart) {
      throw new Error(
        `replacement has end<start: [${r.operandStart}, ${r.operandEnd})`
      );
    }
  }
  // Detect overlap (sorted scan).
  const sorted = replacements.slice().sort((a, b) => a.operandStart - b.operandStart);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].operandStart < sorted[i - 1].operandEnd) {
      throw new Error(
        `overlapping replacements: [${sorted[i - 1].operandStart}, ${sorted[i - 1].operandEnd}) and [${sorted[i].operandStart}, ${sorted[i].operandEnd})`
      );
    }
  }
}

/** Encode a string as UTF-8 bytes. Used because the writer emits ASCII. */
function utf8Encode(s: string): Uint8Array {
  // Performance note: building TextEncoder once is fine; this runs per edit.
  return new TextEncoder().encode(s);
}
