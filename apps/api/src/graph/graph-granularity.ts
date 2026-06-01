/** Postgres date_trunc unit used to bucket co-mention edges for the timeline. */
export type Granularity = 'hour' | 'day' | 'week' | 'month';

const DAY = 86_400;

/**
 * Choose a bucket size so the timeline has a sensible, bounded number of steps
 * (~tens, never thousands) for the given window span in seconds. `null` span
 * means an open-ended window (period='all') → coarse monthly buckets.
 */
export function pickGranularity(spanSeconds: number | null): Granularity {
  if (spanSeconds === null) return 'month';
  if (spanSeconds <= 2 * DAY) return 'hour';
  if (spanSeconds <= 45 * DAY) return 'day';
  if (spanSeconds <= 400 * DAY) return 'week';
  return 'month';
}
