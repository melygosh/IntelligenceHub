import { resolveWindow } from './period-window';

describe('resolveWindow', () => {
  const NOW = new Date('2026-05-26T12:00:00.000Z');

  it('day → windowFrom is 24h before now', () => {
    const { windowFrom, windowTo } = resolveWindow('day', NOW);
    expect(windowFrom.toISOString()).toBe('2026-05-25T12:00:00.000Z');
    expect(windowTo.toISOString()).toBe('2026-05-26T12:00:00.000Z');
  });

  it('week → windowFrom is 7 days before now', () => {
    const { windowFrom, windowTo } = resolveWindow('week', NOW);
    expect(windowFrom.toISOString()).toBe('2026-05-19T12:00:00.000Z');
    expect(windowTo.toISOString()).toBe('2026-05-26T12:00:00.000Z');
  });

  it('month → windowFrom is 30 days before now', () => {
    const { windowFrom, windowTo } = resolveWindow('month', NOW);
    expect(windowFrom.toISOString()).toBe('2026-04-26T12:00:00.000Z');
    expect(windowTo.toISOString()).toBe('2026-05-26T12:00:00.000Z');
  });
});
