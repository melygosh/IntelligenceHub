import type { DigestPeriod } from '@intelligencehub/shared';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Resolve a digest period label to a backward-looking [from, to] window
 * anchored to `now`. Pure function — exported for unit testing.
 *
 *   day   → last 24h
 *   week  → last 7 days
 *   month → last 30 days
 *
 * `now` defaults to `new Date()` but is injectable for deterministic tests.
 */
export function resolveWindow(
  period: DigestPeriod,
  now: Date = new Date(),
): { windowFrom: Date; windowTo: Date } {
  const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
  return {
    windowFrom: new Date(now.getTime() - days * DAY_MS),
    windowTo: now,
  };
}
