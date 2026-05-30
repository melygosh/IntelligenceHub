import { describe, it, expect } from 'vitest';
import {
  connectingArticleIdSet,
  connectingEntityIdSet,
  splitConnectingRelated,
  pinSelectedFirst,
  type ArticleRelation,
} from './relation';

const A = (id: string, ents: string[]): ArticleRelation => ({
  id,
  entities: ents.map((e) => ({ id: e })),
});

// a1: {e1,e2}  a2: {e1}  a3: {e1,e2,e3}  a4: {e4}
const articles: ArticleRelation[] = [
  A('a1', ['e1', 'e2']),
  A('a2', ['e1']),
  A('a3', ['e1', 'e2', 'e3']),
  A('a4', ['e4']),
];

describe('connectingArticleIdSet (mention ALL selected entities)', () => {
  it('returns null when nothing is selected', () => {
    expect(connectingArticleIdSet(articles, new Set())).toBeNull();
  });
  it('single selection = every article mentioning it', () => {
    expect(connectingArticleIdSet(articles, new Set(['e1']))).toEqual(
      new Set(['a1', 'a2', 'a3']),
    );
  });
  it('multi selection = only articles mentioning ALL of them', () => {
    expect(connectingArticleIdSet(articles, new Set(['e1', 'e2']))).toEqual(
      new Set(['a1', 'a3']),
    );
  });
  it('empties when no single article ties all selected', () => {
    expect(connectingArticleIdSet(articles, new Set(['e1', 'e4']))).toEqual(
      new Set(),
    );
  });
});

describe('connectingEntityIdSet (entities mentioned by ALL selected articles)', () => {
  it('returns null when nothing is selected', () => {
    expect(connectingEntityIdSet(articles, new Set())).toBeNull();
  });
  it('single article = its entities', () => {
    expect(connectingEntityIdSet(articles, new Set(['a1']))).toEqual(
      new Set(['e1', 'e2']),
    );
  });
  it('multi article = intersection of their entity sets', () => {
    expect(connectingEntityIdSet(articles, new Set(['a1', 'a3']))).toEqual(
      new Set(['e1', 'e2']),
    );
  });
  it('empties when articles share no entity', () => {
    expect(connectingEntityIdSet(articles, new Set(['a1', 'a4']))).toEqual(
      new Set(),
    );
  });
});

describe('splitConnectingRelated', () => {
  const items = [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }, { id: 'a4' }];
  it('inactive (both null) → empty groups, active=false', () => {
    expect(splitConnectingRelated(items, null, null)).toEqual({
      connecting: [],
      related: [],
      active: false,
    });
  });
  it('splits into connecting (all) and related (any-but-not-all), disjoint, order-preserving', () => {
    const connecting = new Set(['a1', 'a3']); // mention all
    const any = new Set(['a1', 'a2', 'a3']); // mention any
    expect(splitConnectingRelated(items, connecting, any)).toEqual({
      connecting: [{ id: 'a1' }, { id: 'a3' }],
      related: [{ id: 'a2' }],
      active: true,
    });
  });
});

describe('pinSelectedFirst', () => {
  const items = [{ id: 'x' }, { id: 'y' }, { id: 'z' }];
  it('returns a copy in original order when nothing selected', () => {
    expect(pinSelectedFirst(items, new Set())).toEqual(items);
  });
  it('moves selected items to the front, preserving order within each group', () => {
    expect(pinSelectedFirst(items, new Set(['z', 'x']))).toEqual([
      { id: 'x' },
      { id: 'z' },
      { id: 'y' },
    ]);
  });
});
