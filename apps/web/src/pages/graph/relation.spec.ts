import { describe, it, expect } from 'vitest';
import { partitionArticles, pinSelectedFirst, type ArticleRelation } from './relation';

const A = (id: string, ents: string[]): ArticleRelation => ({
  id,
  entities: ents.map((e) => ({ id: e })),
});

// a1: {e1,e2}  a2: {e1}  a3: {e1,e2,e3}  a4: {e4}  a5: {} (no entities)
const articles: ArticleRelation[] = [
  A('a1', ['e1', 'e2']),
  A('a2', ['e1']),
  A('a3', ['e1', 'e2', 'e3']),
  A('a4', ['e4']),
  A('a5', []),
];

describe('partitionArticles', () => {
  it('is inactive (everything in others) when no entity is selected', () => {
    const g = partitionArticles(articles, new Set());
    expect(g.active).toBe(false);
    expect(g.connecting).toEqual([]);
    expect(g.related).toEqual([]);
    expect(g.others.map((a) => a.id)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);
  });

  it('splits connecting (mentions ALL) / related (mentions SOME) / others (NONE)', () => {
    const g = partitionArticles(articles, new Set(['e1', 'e2']));
    expect(g.active).toBe(true);
    expect(g.connecting.map((a) => a.id)).toEqual(['a1', 'a3']);
    expect(g.related.map((a) => a.id)).toEqual(['a2']);
    expect(g.others.map((a) => a.id)).toEqual(['a4', 'a5']);
  });

  it('treats a single selected entity as connecting when present', () => {
    const g = partitionArticles(articles, new Set(['e1']));
    expect(g.connecting.map((a) => a.id)).toEqual(['a1', 'a2', 'a3']);
    expect(g.related).toEqual([]);
    expect(g.others.map((a) => a.id)).toEqual(['a4', 'a5']);
  });

  it('preserves input order within each group', () => {
    const g = partitionArticles(articles, new Set(['e3']));
    expect(g.connecting.map((a) => a.id)).toEqual(['a3']);
    expect(g.others.map((a) => a.id)).toEqual(['a1', 'a2', 'a4', 'a5']);
  });
});

describe('pinSelectedFirst', () => {
  it('returns a copy unchanged when nothing selected', () => {
    const items = [{ id: 'x' }, { id: 'y' }];
    expect(pinSelectedFirst(items, new Set())).toEqual(items);
  });

  it('moves selected items to the front, preserving relative order', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    expect(pinSelectedFirst(items, new Set(['b', 'd'])).map((i) => i.id)).toEqual([
      'b',
      'd',
      'a',
      'c',
    ]);
  });

  it('recovers selected items absent from items via the pool, pinned after in-list ones', () => {
    // 'z' was selected from an earlier search and is no longer in `items`,
    // but lives in the pool — it must still appear, pinned at the top.
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'z' }];
    expect(
      pinSelectedFirst(items, new Set(['b', 'z']), pool).map((i) => i.id),
    ).toEqual(['b', 'z', 'a', 'c']);
  });

  it('does not duplicate a selected item present in both items and pool', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    const pool = [{ id: 'a' }, { id: 'b' }];
    expect(pinSelectedFirst(items, new Set(['a']), pool).map((i) => i.id)).toEqual([
      'a',
      'b',
    ]);
  });
});
