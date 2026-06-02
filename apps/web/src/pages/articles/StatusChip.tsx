import type { ArticleStatus } from '@intelligencehub/shared';

const STYLE: Record<ArticleStatus, string> = {
  // 'ready' rows don't render a chip — the importance dot carries the verdict.
  ready: '',
  pending: 'border-border bg-paper2 text-mute2',
  filtered: 'border-border bg-paper2 text-muted',
  failed: 'border-red-300 bg-red-50 text-red-700',
  duplicate: 'border-border bg-paper2 text-mute2',
};

const LABEL: Record<ArticleStatus, string> = {
  ready: '',
  pending: 'processing…',
  filtered: 'filtered',
  failed: 'analysis failed',
  duplicate: 'duplicate',
};

/**
 * Per-row processing-state chip (US-7). For status='filtered' the
 * filter_reason is appended so the user knows WHY the pre-filter cut it.
 * Returns null for status='ready' (importance dot suffices).
 */
export function StatusChip({
  status,
  filterReason,
}: {
  status: ArticleStatus;
  filterReason: string | null;
}) {
  if (status === 'ready') return null;
  const label = LABEL[status];
  const reason = status === 'filtered' && filterReason ? `: ${filterReason}` : '';
  return (
    <span
      className={
        'inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.06em] ' +
        STYLE[status]
      }
      title={status === 'filtered' && filterReason ? filterReason : undefined}
    >
      {label}
      {reason}
    </span>
  );
}
