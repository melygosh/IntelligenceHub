import { groupAxisValuesByAxis } from './group-axis-values';

describe('groupAxisValuesByAxis', () => {
  it('returns empty map for empty input', () => {
    expect(groupAxisValuesByAxis([])).toEqual(new Map());
  });

  it('groups multiple values under their axis', () => {
    const out = groupAxisValuesByAxis([
      { id: 'v1', axisId: 'a1' },
      { id: 'v2', axisId: 'a1' },
      { id: 'v3', axisId: 'a2' },
    ]);
    expect(out.size).toBe(2);
    expect(out.get('a1')).toEqual(['v1', 'v2']);
    expect(out.get('a2')).toEqual(['v3']);
  });

  it('preserves input order within an axis', () => {
    const out = groupAxisValuesByAxis([
      { id: 'v2', axisId: 'a1' },
      { id: 'v1', axisId: 'a1' },
    ]);
    expect(out.get('a1')).toEqual(['v2', 'v1']);
  });

  it('dedupes duplicate value ids under the same axis', () => {
    const out = groupAxisValuesByAxis([
      { id: 'v1', axisId: 'a1' },
      { id: 'v1', axisId: 'a1' },
    ]);
    expect(out.get('a1')).toEqual(['v1']);
  });
});
