import { describe, it, expect } from 'vitest';
import { weightAsOf, timelineBounds } from './timeline';
import type { GraphEdge } from '@intelligencehub/shared';

const buckets = [
  { t: 100, count: 2 },
  { t: 200, count: 3 },
  { t: 300, count: 1 },
];

describe('weightAsOf', () => {
  it('sums counts in buckets with t <= scrubT', () => {
    expect(weightAsOf(buckets, 50)).toBe(0);
    expect(weightAsOf(buckets, 100)).toBe(2);
    expect(weightAsOf(buckets, 250)).toBe(5);
    expect(weightAsOf(buckets, 300)).toBe(6);
    expect(weightAsOf(buckets, 9999)).toBe(6);
  });
  it('undefined buckets → 0', () => {
    expect(weightAsOf(undefined, 100)).toBe(0);
  });
});

describe('timelineBounds', () => {
  it('returns min/max bucket t across co_mention edges', () => {
    const edges: GraphEdge[] = [
      { from: 'a', to: 'b', kind: 'co_mention', weight: 5, buckets },
      {
        from: 'b',
        to: 'c',
        kind: 'co_mention',
        weight: 1,
        buckets: [{ t: 400, count: 1 }],
      },
      { from: 'x', to: 'y', kind: 'mentions', weight: null },
    ];
    expect(timelineBounds(edges)).toEqual({ min: 100, max: 400 });
  });
  it('returns null when no buckets present', () => {
    expect(timelineBounds([{ from: 'a', to: 'b', kind: 'mentions', weight: null }])).toBeNull();
  });
});
