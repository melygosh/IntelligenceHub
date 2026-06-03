export type BurstCoalescer = {
  /** Request a flush. The first call arms a timer; calls within the window are
   * absorbed (the pending flush covers them). */
  schedule(): void;
  /** Cancel any pending flush (call on unmount). */
  cancel(): void;
};

/**
 * Collapse a burst of `schedule()` calls into a single trailing `flush()`.
 *
 * A feed pull emits one `article.analyzed` SSE event per article — dozens in a
 * window. Invalidating the actively-subscribed Articles query on every event
 * triggers a full refetch + list re-render each time. This bounds N rapid
 * events to one flush per `delayMs` window (leading-armed, trailing-fired):
 * the first event arms the timer, subsequent events in the window are no-ops,
 * the timer fires `flush()` once, and the next event arms a fresh window — so a
 * sustained stream still converges every ≤delayMs instead of never.
 */
export function createBurstCoalescer(flush: () => void, delayMs: number): BurstCoalescer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule() {
      if (timer !== null) return; // a flush is already pending — coalesce
      timer = setTimeout(() => {
        timer = null;
        flush();
      }, delayMs);
    },
    cancel() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
