import { pickGranularity } from './graph-granularity';

describe('pickGranularity', () => {
  const DAY = 86_400;
  it('null span (period=all) → month', () => {
    expect(pickGranularity(null)).toBe('month');
  });
  it('≤ 2 days → hour', () => {
    expect(pickGranularity(DAY)).toBe('hour');
    expect(pickGranularity(2 * DAY)).toBe('hour');
  });
  it('≤ 45 days → day', () => {
    expect(pickGranularity(7 * DAY)).toBe('day');
    expect(pickGranularity(45 * DAY)).toBe('day');
  });
  it('≤ 400 days → week', () => {
    expect(pickGranularity(90 * DAY)).toBe('week');
    expect(pickGranularity(400 * DAY)).toBe('week');
  });
  it('> 400 days → month', () => {
    expect(pickGranularity(800 * DAY)).toBe('month');
  });
});
