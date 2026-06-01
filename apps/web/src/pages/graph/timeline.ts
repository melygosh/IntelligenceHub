import type { GraphEdge } from '@intelligencehub/shared';

type Bucket = { t: number; count: number };

/** Cumulative co-mention weight as of `scrubT`: sum of bucket counts at t ≤ scrubT. */
export function weightAsOf(buckets: Bucket[] | undefined, scrubT: number): number {
  if (!buckets) return 0;
  let w = 0;
  for (const b of buckets) if (b.t <= scrubT) w += b.count;
  return w;
}

/** Min/max bucket-start time across all co_mention edges, or null if none carry buckets. */
export function timelineBounds(
  edges: GraphEdge[],
): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const e of edges) {
    if (!e.buckets) continue;
    for (const b of e.buckets) {
      if (b.t < min) min = b.t;
      if (b.t > max) max = b.t;
    }
  }
  return min === Infinity ? null : { min, max };
}
