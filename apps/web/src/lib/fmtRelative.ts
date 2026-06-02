/**
 * Render a "X ago" relative-time string against the current wall clock.
 *
 * Accepts:
 *   - an ISO-8601 string (e.g. "2026-05-29T11:00:00Z")
 *   - a Unix-seconds number (e.g. 1748520000)
 *   - a `Date`
 *   - `null` / `undefined` for "not yet" / "missing" values, rendered as the
 *     em-dash placeholder.
 *
 * Granularity steps: seconds → minutes → hours → days → months (30d each).
 * Values in the future return "now" rather than a negative count.
 */
export function fmtRelative(input: string | number | Date | null | undefined): string {
  if (input === null || input === undefined) return '—';
  const target =
    typeof input === 'number'
      ? input * 1000
      : input instanceof Date
        ? input.getTime()
        : new Date(input).getTime();
  const ms = Date.now() - target;
  if (ms < 0) return 'now';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mon = Math.floor(day / 30);
  return `${mon}mo ago`;
}
