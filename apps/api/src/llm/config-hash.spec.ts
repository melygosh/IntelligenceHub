import { configHash, EMPTY_CONFIG_HASH } from './config-hash';

describe('configHash', () => {
  it('returns a 64-char sha256 hex', () => {
    expect(configHash(['A'], [{ name: 'axis1', values: ['v1'] }])).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it('is independent of category order', () => {
    const a = configHash(['A', 'B', 'C'], []);
    const b = configHash(['C', 'A', 'B'], []);
    expect(a).toBe(b);
  });

  it('is independent of axis order', () => {
    const a = configHash(
      [],
      [
        { name: 'x', values: ['1'] },
        { name: 'y', values: ['2'] },
      ],
    );
    const b = configHash(
      [],
      [
        { name: 'y', values: ['2'] },
        { name: 'x', values: ['1'] },
      ],
    );
    expect(a).toBe(b);
  });

  it('is independent of values order within an axis', () => {
    const a = configHash([], [{ name: 'x', values: ['c', 'a', 'b'] }]);
    const b = configHash([], [{ name: 'x', values: ['a', 'b', 'c'] }]);
    expect(a).toBe(b);
  });

  it('changes when a category is added', () => {
    const a = configHash(['A'], []);
    const b = configHash(['A', 'B'], []);
    expect(a).not.toBe(b);
  });

  it('changes when an axis value is removed', () => {
    const a = configHash([], [{ name: 'x', values: ['1', '2'] }]);
    const b = configHash([], [{ name: 'x', values: ['1'] }]);
    expect(a).not.toBe(b);
  });

  it('changes when an axis is renamed', () => {
    const a = configHash([], [{ name: 'foo', values: ['1'] }]);
    const b = configHash([], [{ name: 'bar', values: ['1'] }]);
    expect(a).not.toBe(b);
  });

  it('empty config has a known stable hash', () => {
    expect(configHash([], [])).toBe(EMPTY_CONFIG_HASH);
  });
});

describe('EMPTY_CONFIG_HASH', () => {
  it('is a 64-char hex string', () => {
    expect(EMPTY_CONFIG_HASH).toMatch(/^[0-9a-f]{64}$/);
  });
});
