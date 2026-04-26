// 2D affine matrix utilities matching PDF's `[a b c d e f]` representation
// (ISO 32000-2 §8.3.4). Stored as a 6-tuple; transforms a point (x, y) to
// (a*x + c*y + e, b*x + d*y + f).
//
// Composition order matches PDF: `concat(a, b)` returns "a applied after b",
// i.e. the matrix that, when applied to a point, transforms by `b` then `a`.
// The PDF `cm` operator updates CTM as `CTM' = M × CTM`, where M is the
// new matrix and CTM is the current. In our helpers, that maps to
// `concat(M, oldCtm)`.

import type { Matrix } from './types';

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0] as const;

/**
 * Multiply two matrices: `result = a × b`.
 * For a point p: result(p) = a(b(p)).
 */
export function concat(a: Matrix, b: Matrix): Matrix {
  // [a0 a1 0]   [b0 b1 0]
  // [a2 a3 0] × [b2 b3 0]
  // [a4 a5 1]   [b4 b5 1]
  const [a0, a1, a2, a3, a4, a5] = a;
  const [b0, b1, b2, b3, b4, b5] = b;
  return [
    a0 * b0 + a1 * b2,
    a0 * b1 + a1 * b3,
    a2 * b0 + a3 * b2,
    a2 * b1 + a3 * b3,
    a4 * b0 + a5 * b2 + b4,
    a4 * b1 + a5 * b3 + b5,
  ];
}

/** Return a translation matrix `[1 0 0 1 tx ty]`. */
export function translation(tx: number, ty: number): Matrix {
  return [1, 0, 0, 1, tx, ty];
}

/**
 * Apply a matrix to a point. Returns `(a*x + c*y + e, b*x + d*y + f)`.
 */
export function transformPoint(m: Matrix, x: number, y: number): { x: number; y: number } {
  return {
    x: m[0] * x + m[2] * y + m[4],
    y: m[1] * x + m[3] * y + m[5],
  };
}

/** True if two matrices are equal within the given tolerance (default 1e-9). */
export function approxEqual(a: Matrix, b: Matrix, eps = 1e-9): boolean {
  for (let i = 0; i < 6; i++) {
    if (Math.abs(a[i] - b[i]) > eps) return false;
  }
  return true;
}
