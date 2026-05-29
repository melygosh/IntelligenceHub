import type { TelemetryRow } from '@intelligencehub/shared';
import { useGetTelemetrySummaryQuery } from '../../store/api';
import { LoadingHint } from '../../components/ui/LoadingHint';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Sep } from '../../components/ui/Sep';


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
      <td className="py-2 pr-3 font-mono text-[12.5px] text-ink">{r.operation}</td>
      <td className="py-2 pr-3 font-mono text-[12.5px] text-muted">{r.provider}</td>
      <td className="py-2 pr-3 font-mono text-[12.5px] text-muted">{r.model}</td>
      <td className="py-2 pr-3 text-right font-mono text-[12.5px] tnum text-ink">{r.callCount}</td>
      <td className="py-2 pr-3 text-right font-mono text-[12.5px] tnum text-muted">{fmtTokens(r.inputTokens)}</td>
      <td className="py-2 pr-3 text-right font-mono text-[12.5px] tnum text-muted">{fmtTokens(r.outputTokens)}</td>
      <td className="py-2 pr-3 text-right font-mono text-[12.5px] tnum text-mute2">
        {fmtTokens(r.cacheReadTokens)} / {fmtTokens(r.cacheCreationTokens)}
      </td>
      <td className="py-2 pr-3 text-right font-mono text-[12.5px] tnum text-mute2">{r.avgLatencyMs}</td>
      <td className="py-2 pr-3 text-right font-mono text-[12.5px] tnum text-muted">{fmtPercent(r.successRate)}</td>
      <td className="py-2 pr-1 text-right font-mono text-[12.5px] tnum text-mute2">{r.failoverCount}</td>
    </tr>
  );
}

export default function TelemetryPage() {
  const { data, isLoading, isError } = useGetTelemetrySummaryQuery();

  if (isLoading) return <LoadingHint />;
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-5xl border border-dashed border-border">
        <EmptyState title="Telemetry unavailable" />
      </div>
    );
  }

  const isEmpty = data.rows.length === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow="/telemetry"
        title="LLM telemetry"
        subtitle="Per-operation token use and latency. Lifetime totals scoped to your user."
      />

      {isEmpty ? (
        <div className="border border-dashed border-border">
          <EmptyState
            title="No LLM calls yet"
            subtitle="Add a feed and let it process to see token use here."
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[12.5px] text-muted">
            <span className="tnum text-ink">{data.totalCalls} calls</span>
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
                  <th className="py-2 pr-3 text-left font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Operation</th>
                  <th className="py-2 pr-3 text-left font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Prov</th>
                  <th className="py-2 pr-3 text-left font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Model</th>
                  <th className="py-2 pr-3 text-right font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Calls</th>
                  <th className="py-2 pr-3 text-right font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Input</th>
                  <th className="py-2 pr-3 text-right font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Output</th>
                  <th className="py-2 pr-3 text-right font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Cache R/W</th>
                  <th className="py-2 pr-3 text-right font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Avg ms</th>
                  <th className="py-2 pr-3 text-right font-mono text-[12px] uppercase tracking-[0.08em] text-muted">Success</th>
                  <th className="py-2 pr-1 text-right font-mono text-[12px] uppercase tracking-[0.08em] text-muted">F/over</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <TelemetryTableRow key={`${r.operation}-${r.provider}-${r.model}-${i}`} r={r} />
                ))}
              </tbody>
            </table>
          </div>

        </>
      )}
    </div>
  );
}
