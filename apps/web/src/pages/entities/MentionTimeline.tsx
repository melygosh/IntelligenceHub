import type { TimelineBucket } from '@intelligencehub/shared';

const DAY_MS = 86_400_000;
const MIN_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 180;

type Day = { dayUtc: string; count: number };

/**
 * Builds a contiguous daily series for the chart. The window ends on the last
 * day with a mention and extends back far enough to always show at least
 * MIN_WINDOW_DAYS of context (capped at MAX_WINDOW_DAYS), with count=0 filled
 * for quiet days so cadence and gaps read honestly.
 */
export function buildSeries(buckets: TimelineBucket[]): Day[] {
  if (buckets.length === 0) return [];
  const byDay = new Map(buckets.map((b) => [b.dayUtc, b.count]));
  const days = [...byDay.keys()].sort();
  const firstMs = Date.parse(`${days[0]}T00:00:00Z`);
  const lastMs = Date.parse(`${days[days.length - 1]}T00:00:00Z`);
  let startMs = Math.min(firstMs, lastMs - (MIN_WINDOW_DAYS - 1) * DAY_MS);
  if ((lastMs - startMs) / DAY_MS > MAX_WINDOW_DAYS - 1) {
    startMs = lastMs - (MAX_WINDOW_DAYS - 1) * DAY_MS;
  }
  const out: Day[] = [];
  for (let t = startMs; t <= lastMs; t += DAY_MS) {
    const day = new Date(t).toISOString().slice(0, 10);
    out.push({ dayUtc: day, count: byDay.get(day) ?? 0 });
  }
  return out;
}

function dayLabel(dayUtc: string): string {
  return new Date(`${dayUtc}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

const MONO = "var(--font-mono), 'IBM Plex Mono', monospace";

export function MentionTimeline({ buckets }: { buckets: TimelineBucket[] }) {
  if (buckets.length === 0) {
    return (
      <div className="border border-border bg-paper2/40 px-4 py-5 font-mono text-[12.5px] text-muted">
        No mention activity yet.
      </div>
    );
  }

  const series = buildSeries(buckets);
  const max = Math.max(...series.map((s) => s.count), 1);
  const total = series.reduce((n, s) => n + s.count, 0);

  const W = 800;
  const H = 130;
  const pad = { top: 12, right: 8, bottom: 22, left: 32 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const yTicks = max <= 3 ? [...new Set([0, max])] : [0, Math.ceil(max / 2), max];
  const slot = innerW / series.length;
  const barW = Math.max(2, slot * 0.7);
  const midIdx = Math.floor(series.length / 2);

  return (
    <div className="border border-border bg-paper">
      <div className="flex items-baseline justify-between border-b border-border px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          Mention activity
        </span>
        <span className="font-mono text-[10.5px] tnum text-mute2">
          {series.length} days · peak {max}/day
        </span>
      </div>
      <div className="px-3 py-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full"
          role="img"
          aria-label={`Mention activity over ${series.length} days, ${total} mentions total, peak ${max} per day`}
        >
          {/* y gridlines + tick labels */}
          {yTicks.map((t) => {
            const y = pad.top + innerH - (t / max) * innerH;
            return (
              <g key={t}>
                <line
                  x1={pad.left}
                  x2={W - pad.right}
                  y1={y}
                  y2={y}
                  stroke="var(--color-border)"
                  strokeWidth="0.6"
                  strokeDasharray={t === 0 ? undefined : '2 3'}
                />
                <text
                  x={pad.left - 6}
                  y={y + 4}
                  fontSize="10"
                  fontFamily={MONO}
                  fill="var(--color-mute2)"
                  textAnchor="end"
                >
                  {t}
                </text>
              </g>
            );
          })}

          {/* bars + weekly separators */}
          {series.map((d, i) => {
            const x = pad.left + i * slot + (slot - barW) / 2;
            const h = (d.count / max) * innerH;
            const y = pad.top + innerH - h;
            const weekBoundary = i % 7 === 0 && i !== 0;
            return (
              <g key={d.dayUtc}>
                {weekBoundary ? (
                  <line
                    x1={pad.left + i * slot}
                    x2={pad.left + i * slot}
                    y1={pad.top}
                    y2={pad.top + innerH}
                    stroke="var(--color-border2)"
                    strokeWidth="0.8"
                  />
                ) : null}
                <rect
                  x={x}
                  y={d.count === 0 ? pad.top + innerH - 0.6 : y}
                  width={barW}
                  height={d.count === 0 ? 0.6 : Math.max(h, 1)}
                  fill={d.count === 0 ? 'var(--color-border)' : 'var(--color-accent)'}
                  opacity={d.count === 0 ? 0.7 : 1}
                >
                  <title>{`${d.dayUtc}: ${d.count} mention${d.count === 1 ? '' : 's'}`}</title>
                </rect>
              </g>
            );
          })}

          {/* x-axis date labels: start · middle · end */}
          <text x={pad.left} y={H - 6} fontSize="10" fontFamily={MONO} fill="var(--color-mute2)">
            {dayLabel(series[0].dayUtc)}
          </text>
          <text x={W / 2} y={H - 6} fontSize="10" fontFamily={MONO} fill="var(--color-mute2)" textAnchor="middle">
            {dayLabel(series[midIdx].dayUtc)}
          </text>
          <text x={W - pad.right} y={H - 6} fontSize="10" fontFamily={MONO} fill="var(--color-mute2)" textAnchor="end">
            {dayLabel(series[series.length - 1].dayUtc)}
          </text>
        </svg>
      </div>
    </div>
  );
}
