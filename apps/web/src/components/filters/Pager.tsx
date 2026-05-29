/**
 * Classic prev/next pager with a 'page N of M' counter. Used by /articles
 * and /entities list pages. Parent owns the page number and decides how to
 * persist (URL param, in-memory state). When there's only one page (or
 * zero), renders nothing — the caller doesn't need to gate the mount.
 */
export function Pager({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (next: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  const canPrev = page > 1;
  const canNext = page < totalPages;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border bg-paper2/40 px-5 py-1.5 font-mono text-[12.5px] text-mute2">
      <button
        type="button"
        onClick={() => canPrev && onChange(page - 1)}
        disabled={!canPrev}
        className="text-muted hover:text-ink disabled:cursor-not-allowed disabled:text-mute2 disabled:hover:text-mute2"
      >
        ← prev
      </button>
      <span className="tnum">
        page <span className="text-ink">{page}</span> of {totalPages}
      </span>
      <button
        type="button"
        onClick={() => canNext && onChange(page + 1)}
        disabled={!canNext}
        className="text-muted hover:text-ink disabled:cursor-not-allowed disabled:text-mute2 disabled:hover:text-mute2"
      >
        next →
      </button>
    </div>
  );
}
