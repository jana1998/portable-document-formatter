// Locator — maps a mupdf structured-text line to one-or-more TextRun events
// from the interpreter.
//
// The mupdf "line" is what the user clicks; the TextRun(s) tell us which
// operators in the content stream produced that line. For most lines this
// is one-to-one, but justified text with TJ kerning, multi-style lines, and
// inline font changes all create one-line-to-many-runs cases the locator
// must handle.
//
// Confidence is the locator's contract with downstream phases: byte-surgery
// only proceeds if confidence ≥ 0.9. Below that we either fall back to
// redact-and-reemit (Phase 4b) or refuse the edit.

import type { InterpreterEvent, TextRun } from '../interpreter/types';
import { concat, transformPoint } from '../interpreter/matrix';

/** A mupdf-reported visual line that the user wants to edit. */
export interface TargetLine {
  /** Bounding box in mupdf coordinate space (y from top of page, in PDF points). */
  bbox: { x: number; y: number; w: number; h: number };
  /** Concatenated text mupdf reports for this line. */
  text: string;
  /** Page height in PDF user units — needed to convert mupdf y → PDF y. */
  pageHeight: number;
  /** Optional font size hint (used to size the y-tolerance window). */
  fontSize?: number;
}

export interface LocatedRun {
  runs: TextRun[];
  /** 0..1 — how confident the locator is in the match. */
  confidence: number;
  /** Diagnostic reason when confidence is low or the locator refuses. */
  reason?: string;
}

/**
 * Locate the TextRun(s) that produced the given target line.
 *
 * The algorithm is intentionally simple and explainable:
 *   1. Filter runs whose origin falls inside (or close to) the target bbox.
 *   2. Sort filtered runs in reading order (y desc, then x asc).
 *   3. Try an exact match of a single run's text against the target.
 *   4. Try concatenations of consecutive runs.
 *   5. Fall back to fuzzy match (Levenshtein) over single runs and groups.
 *
 * Returns confidence ≥ 0.9 only when the text matches exactly (modulo
 * normalization). Anything below should be treated by callers as "do not
 * use byte-surgery; fall back to redact-and-reemit or refuse the edit."
 */
export function locateRun(events: InterpreterEvent[], target: TargetLine): LocatedRun {
  // Refuse edits inside Form XObjects in v1 — they're handled in a later phase.
  const runs = events
    .filter((e): e is { kind: 'text-run'; run: TextRun } => e.kind === 'text-run')
    .map((e) => e.run)
    .filter((r) => !r.inXObject);

  if (runs.length === 0) {
    return { runs: [], confidence: 0, reason: 'no text-runs in stream' };
  }

  const candidates = filterByBbox(runs, target);
  if (candidates.length === 0) {
    // No positional candidates — fall back to text-only search across the
    // whole page (lower confidence ceiling because we can't disambiguate
    // duplicates).
    const m = matchByText(runs, target.text, /*positionUnknown*/ true);
    return m;
  }

  const ordered = sortByReadingOrder(candidates);
  const m = matchByText(ordered, target.text, /*positionUnknown*/ false);
  return m;
}

// =============================================================================
// Bbox filtering.
// =============================================================================

interface RunWithOrigin {
  run: TextRun;
  originX: number;
  originY: number;
}

function filterByBbox(runs: TextRun[], target: TargetLine): RunWithOrigin[] {
  // Convert mupdf bbox to PDF user-space y coords.
  // mupdf reports y from top of page; PDF user space puts y=0 at the bottom.
  const pdfTopY = target.pageHeight - target.bbox.y;
  const pdfBottomY = target.pageHeight - (target.bbox.y + target.bbox.h);

  // Y tolerance scales with font size — small fonts demand tighter bounds,
  // large fonts allow more slack for ascender/descender variance.
  const referenceFontSize = target.fontSize ?? 12;
  const yTolerance = Math.max(referenceFontSize * 0.6, 4);

  // X tolerance is more generous — mupdf may report a bbox slightly wider
  // than the actual glyph run (whitespace, italic side bearings).
  const xTolerance = Math.max(referenceFontSize * 1.5, 8);

  const out: RunWithOrigin[] = [];
  for (const run of runs) {
    const t = concat(run.textMatrix, run.ctm);
    const origin = transformPoint(t, 0, 0);
    const inY =
      origin.y >= pdfBottomY - yTolerance && origin.y <= pdfTopY + yTolerance;
    const inX =
      origin.x >= target.bbox.x - xTolerance &&
      origin.x <= target.bbox.x + target.bbox.w + xTolerance;
    if (inY && inX) {
      out.push({ run, originX: origin.x, originY: origin.y });
    }
  }
  return out;
}

function sortByReadingOrder(rs: RunWithOrigin[]): TextRun[] {
  // Primary key: descending y (top-down on the PDF page where y points up).
  // Secondary key: ascending x (left-to-right).
  // Tertiary: source order (opStart) for runs at identical positions.
  return rs
    .slice()
    .sort((a, b) => {
      const dy = b.originY - a.originY;
      if (Math.abs(dy) > 0.5) return dy;
      const dx = a.originX - b.originX;
      if (Math.abs(dx) > 0.5) return dx;
      return a.run.opStart - b.run.opStart;
    })
    .map((r) => r.run);
}

// =============================================================================
// Text matching.
// =============================================================================

const NORMALIZED_CONFIDENCE_FLOOR = 0.5;

function matchByText(runs: TextRun[], target: string, positionUnknown: boolean): LocatedRun {
  const wantedNorm = normalize(target);
  if (wantedNorm.length === 0) {
    return { runs: [], confidence: 0, reason: 'empty target text' };
  }

  // 1. Exact single-run match.
  for (const run of runs) {
    if (normalize(run.text) === wantedNorm) {
      const conf = positionUnknown ? 0.85 : 1.0;
      return { runs: [run], confidence: conf };
    }
  }

  // 2. Exact concatenation match across consecutive runs.
  const concatHit = matchConcatenation(runs, wantedNorm);
  if (concatHit) {
    const conf = positionUnknown ? 0.8 : 0.95;
    return { runs: concatHit.runs, confidence: conf };
  }

  // 3. Fuzzy match (single run).
  let best: { run: TextRun; distance: number } | null = null;
  for (const run of runs) {
    const d = levenshtein(normalize(run.text), wantedNorm);
    if (best === null || d < best.distance) {
      best = { run, distance: d };
    }
  }

  if (best && best.distance <= Math.max(2, Math.floor(wantedNorm.length * 0.15))) {
    // Confidence falls off linearly with edit-distance ratio. With ceiling=1
    // and bbox-filtered candidates, distance/length is the only penalty —
    // a 1-char diff in an 11-char string becomes 0.909, well above the
    // 0.9 byte-surgery threshold. These tiny-distance fuzzy matches are
    // overwhelmingly encoding edge cases on the same run, not wrong runs.
    const ratio = best.distance / wantedNorm.length;
    const ceiling = positionUnknown ? 0.85 : 1.0;
    const conf = ceiling - ratio;
    return {
      runs: [best.run],
      confidence: Math.max(NORMALIZED_CONFIDENCE_FLOOR, conf),
      reason: `fuzzy match (Levenshtein ${best.distance})`,
    };
  }

  // 4. No match.
  return { runs: [], confidence: 0, reason: 'no run matches target text' };
}

/**
 * Try every contiguous subsequence of `runs` and check whether their
 * concatenated normalized text equals the target. Bounded by 2× target
 * length to keep this O(n × target.length) in practice.
 */
function matchConcatenation(
  runs: TextRun[],
  wantedNorm: string
): { runs: TextRun[] } | null {
  for (let i = 0; i < runs.length; i++) {
    let combined = '';
    const group: TextRun[] = [];
    for (let j = i; j < runs.length; j++) {
      combined += runs[j].text;
      group.push(runs[j]);
      const combinedNorm = normalize(combined);
      if (combinedNorm === wantedNorm) {
        return { runs: group.slice() };
      }
      if (combinedNorm.length > wantedNorm.length * 2) break;
    }
  }
  return null;
}

/**
 * Normalize text for comparison: collapse whitespace, trim ends. Critically
 * we keep case and punctuation — those distinguish similar lines on the page.
 */
function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Standard DP Levenshtein. Tolerable cost for short strings. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost // substitution
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}
