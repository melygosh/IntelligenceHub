import type { TimelineBucket } from '@intelligencehub/shared';

const BAR_WIDTH = 6;
const BAR_GAP = 2;
const CHART_HEIGHT = 32;

/**
 * Walks from the first to the last day in the bucket series and inserts a
 * count=0 bucket for any missing day. Returned series is contiguous so the
 * sparkline reflects real cadence (long gaps show as flat low bars).
 */
export function fillGaps(buckets: TimelineBucket[]): Array<{ dayUtc: string; count: number }> {
  if (buckets.length === 0) return [];
  const sorted = [...buckets].sort((a, b) => a.dayUtc.localeCompare(b.dayUtc));
  const out: Array<{ dayUtc: string; count: number }> = [];
  const byDay = new Map(sorted.map((b) => [b.dayUtc, b.count]));
  const start = new Date(`${sorted[0].dayUtc}T00:00:00Z`);
  const end = new Date(`${sorted[sorted.length - 1].dayUtc}T00:00:00Z`);
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
    const day = new Date(t).toISOString().slice(0, 10);
    out.push({ dayUtc: day, count: byDay.get(day) ?? 0 });
  }
  return out;
}

export function MentionTimeline({ buckets }: { buckets: TimelineBucket[] }) {
  if (buckets.length === 0) {
    return <div className="font-mono text-[10.5px] text-mute2">no activity yet</div>;
  }
  const series = fillGaps(buckets);
  const maxCount = Math.max(...series.map((s) => s.count), 1);

  return (
    <svg
      width={series.length * (BAR_WIDTH + BAR_GAP)}
      height={CHART_HEIGHT}
      role="img"
      aria-label={`${buckets.length} mention day${buckets.length === 1 ? '' : 's'}`}
    >
      {series.map((s, i) => {
        const h = s.count === 0 ? 1 : Math.max(1, Math.round((s.count / maxCount) * CHART_HEIGHT));
        return (
          <rect
            key={s.dayUtc}
            x={i * (BAR_WIDTH + BAR_GAP)}
            y={CHART_HEIGHT - h}
            width={BAR_WIDTH}
            height={h}
            fill={s.count === 0 ? 'var(--color-border)' : 'var(--color-accent)'}
          >
            <title>{`${s.dayUtc}: ${s.count} mention${s.count === 1 ? '' : 's'}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
