import type { TelemetryRow } from '@intelligencehub/shared';
import { useGetTelemetrySummaryQuery } from '../../store/api';

const Sep = () => <span className="text-border2">·</span>;

function fmtCost(n: number | null): string {
  if (n === null) return '—';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(3)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function fmtPercent(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function TelemetryTableRow({ r }: { r: TelemetryRow }) {
  return (
    <tr className="border-t border-border">
      <td className="py-2 pr-3 font-mono text-[10.5px] text-ink">{r.operation}</td>
      <td className="py-2 pr-3 font-mono text-[10.5px] text-muted">{r.provider}</td>
      <td className="py-2 pr-3 font-mono text-[10.5px] text-muted">{r.model}</td>
      <td className="py-2 pr-3 text-right font-mono text-[10.5px] tnum text-ink">{r.callCount}</td>
      <td className="py-2 pr-3 text-right font-mono text-[10.5px] tnum text-muted">{fmtTokens(r.inputTokens)}</td>
      <td className="py-2 pr-3 text-right font-mono text-[10.5px] tnum text-muted">{fmtTokens(r.outputTokens)}</td>
      <td className="py-2 pr-3 text-right font-mono text-[10.5px] tnum text-mute2">
        {fmtTokens(r.cacheReadTokens)} / {fmtTokens(r.cacheCreationTokens)}
      </td>
      <td className="py-2 pr-3 text-right font-mono text-[10.5px] tnum text-ink">{fmtCost(r.costUsd)}</td>
      <td className="py-2 pr-3 text-right font-mono text-[10.5px] tnum text-mute2">{r.avgLatencyMs}</td>
      <td className="py-2 pr-3 text-right font-mono text-[10.5px] tnum text-muted">{fmtPercent(r.successRate)}</td>
      <td className="py-2 pr-1 text-right font-mono text-[10.5px] tnum text-mute2">{r.failoverCount}</td>
    </tr>
  );
}

export default function TelemetryPage() {
  const { data, isLoading, isError } = useGetTelemetrySummaryQuery();

  if (isLoading) return <p className="font-mono text-[11px] text-mute2">Loading…</p>;
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-3xl border border-dashed border-border px-6 py-10 text-center">
        <p className="font-serif text-[18px] text-ink">Telemetry unavailable</p>
      </div>
    );
  }

  const isEmpty = data.rows.length === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          /telemetry
        </div>
        <h1 className="pretty mb-3 font-serif text-[28px] leading-tight text-ink">
          LLM telemetry
        </h1>
        <p className="font-mono text-[10.5px] text-mute2">
          Per-operation token use and cost. Lifetime totals scoped to your user.
        </p>
      </header>

      {isEmpty ? (
        <div className="border border-dashed border-border px-6 py-10 text-center">
          <p className="font-serif text-[18px] text-ink">No LLM calls yet</p>
          <p className="mx-auto mt-2 max-w-sm font-mono text-[12px] leading-relaxed text-muted">
            Add a feed and let it process to see token use here.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-muted">
            <span className="tnum text-ink">{data.totalCalls} calls</span>
            <Sep />
            <span className="tnum text-ink">{fmtCost(data.totalCostUsd)} total</span>
            {data.dateRange.from && data.dateRange.to ? (
              <>
                <Sep />
                <span className="tnum">
                  Since {fmtDate(data.dateRange.from)}
                </span>
              </>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-muted">Operation</th>
                  <th className="py-2 pr-3 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-muted">Prov</th>
                  <th className="py-2 pr-3 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-muted">Model</th>
                  <th className="py-2 pr-3 text-right font-mono text-[10px] uppercase tracking-[0.08em] text-muted">Calls</th>
                  <th className="py-2 pr-3 text-right font-mono text-[10px] uppercase tracking-[0.08em] text-muted">Input</th>
                  <th className="py-2 pr-3 text-right font-mono text-[10px] uppercase tracking-[0.08em] text-muted">Output</th>
                  <th className="py-2 pr-3 text-right font-mono text-[10px] uppercase tracking-[0.08em] text-muted">Cache R/W</th>
                  <th className="py-2 pr-3 text-right font-mono text-[10px] uppercase tracking-[0.08em] text-muted">Cost</th>
                  <th className="py-2 pr-3 text-right font-mono text-[10px] uppercase tracking-[0.08em] text-muted">Avg ms</th>
                  <th className="py-2 pr-3 text-right font-mono text-[10px] uppercase tracking-[0.08em] text-muted">Success</th>
                  <th className="py-2 pr-1 text-right font-mono text-[10px] uppercase tracking-[0.08em] text-muted">F/over</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <TelemetryTableRow key={`${r.operation}-${r.provider}-${r.model}-${i}`} r={r} />
                ))}
              </tbody>
            </table>
          </div>

          {data.unknownModelCount > 0 ? (
            <p className="font-mono text-[10px] text-mute2">
              Cost excludes {data.unknownModelCount} calls from models not in the pricing table.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
