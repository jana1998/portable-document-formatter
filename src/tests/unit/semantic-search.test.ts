import { describe, it, expect } from 'vitest';
import {
  applySemanticThreshold,
  rankPagesBySimilarity,
  type SemanticFilterResult,
} from '@renderer/services/embeddings-indexer';

function fakeRanked(scores: number[]) {
  return scores.map((score, i) => ({ pageNumber: i + 1, score }));
}

describe('applySemanticThreshold', () => {
  const SKIP_MSG =
    'Semantic search works best with phrases — try exact search for single characters';

  it('skips on empty query (length 0)', () => {
    const result = applySemanticThreshold(fakeRanked([0.5, 0.8]), 0);
    expect(result.kind).toBe('skip');
    if (result.kind === 'skip') expect(result.reason).toBe(SKIP_MSG);
  });

  it('skips on single char (length 1)', () => {
    const result = applySemanticThreshold(fakeRanked([0.9]), 1);
    expect(result.kind).toBe('skip');
  });

  it('skips on two chars (length 2)', () => {
    const result = applySemanticThreshold(fakeRanked([0.9]), 2);
    expect(result.kind).toBe('skip');
  });

  it('uses 0.15 threshold for length 3 — filters 0.10, passes 0.20', () => {
    const result = applySemanticThreshold(fakeRanked([0.10, 0.20]), 3) as Extract<SemanticFilterResult, { kind: 'results' }>;
    expect(result.kind).toBe('results');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].score).toBe(0.20);
  });

  it('uses 0.15 threshold for length 6', () => {
    const result = applySemanticThreshold(fakeRanked([0.14, 0.16]), 6) as Extract<SemanticFilterResult, { kind: 'results' }>;
    expect(result.kind).toBe('results');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].score).toBe(0.16);
  });

  it('uses 0.25 threshold for length 7 — filters 0.20, passes 0.30', () => {
    const result = applySemanticThreshold(fakeRanked([0.20, 0.30]), 7) as Extract<SemanticFilterResult, { kind: 'results' }>;
    expect(result.kind).toBe('results');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].score).toBe(0.30);
  });

  it('returns empty items array for long query with no matches', () => {
    const result = applySemanticThreshold([], 10);
    expect(result.kind).toBe('results');
    if (result.kind === 'results') expect(result.items).toHaveLength(0);
  });

  it('passes all items above threshold for long query', () => {
    const result = applySemanticThreshold(fakeRanked([0.26, 0.50, 0.10]), 20) as Extract<SemanticFilterResult, { kind: 'results' }>;
    expect(result.kind).toBe('results');
    expect(result.items).toHaveLength(2);
  });
});

describe('rankPagesBySimilarity — zero vector guard', () => {
  it('returns score 0 for all pages when query vector is all zeros', () => {
    const zeroVec = new Array(384).fill(0);
    const embeddings = new Map([
      [1, new Array(384).fill(0.5)],
      [2, new Array(384).fill(0.1)],
    ]);
    const ranked = rankPagesBySimilarity(zeroVec, embeddings, 10);
    for (const r of ranked) {
      expect(r.score).toBe(0);
    }
  });

  it('ranks pages by descending cosine score', () => {
    // query points toward [1, 0, 0]
    // page2 is mostly aligned → highest score
    // page3 is at 45° → mid score
    // page1 is mostly perpendicular → lowest score
    const queryVec = [1, 0, 0];
    const embeddings = new Map([
      [1, [0.1, 0.99, 0]],  // mostly perpendicular → low cos
      [2, [0.99, 0.1, 0]],  // mostly aligned → high cos
      [3, [0.7, 0.7, 0]],   // 45° → mid cos
    ]);
    const ranked = rankPagesBySimilarity(queryVec, embeddings, 10);
    expect(ranked[0].pageNumber).toBe(2);
    expect(ranked[1].pageNumber).toBe(3);
    expect(ranked[2].pageNumber).toBe(1);
  });
});
