import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBurstCoalescer } from './coalesce';

describe('createBurstCoalescer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('collapses a burst of schedule() calls into a single trailing flush', () => {
    const flush = vi.fn();
    const c = createBurstCoalescer(flush, 800);

    for (let i = 0; i < 50; i++) c.schedule(); // a feed-pull burst
    expect(flush).not.toHaveBeenCalled(); // nothing fires synchronously

    vi.advanceTimersByTime(799);
    expect(flush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(flush).toHaveBeenCalledTimes(1); // 50 events → 1 flush
  });

  it('arms a fresh window for events that arrive after a flush (sustained stream)', () => {
    const flush = vi.fn();
    const c = createBurstCoalescer(flush, 800);

    c.schedule();
    vi.advanceTimersByTime(800);
    expect(flush).toHaveBeenCalledTimes(1);

    c.schedule(); // next window
    vi.advanceTimersByTime(800);
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it('cancel() prevents a pending flush (unmount safety)', () => {
    const flush = vi.fn();
    const c = createBurstCoalescer(flush, 800);

    c.schedule();
    c.cancel();
    vi.advanceTimersByTime(5000);
    expect(flush).not.toHaveBeenCalled();
  });

  it('schedule() after cancel() works again', () => {
    const flush = vi.fn();
    const c = createBurstCoalescer(flush, 800);

    c.schedule();
    c.cancel();
    c.schedule();
    vi.advanceTimersByTime(800);
    expect(flush).toHaveBeenCalledTimes(1);
  });
});
