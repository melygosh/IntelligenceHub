import { describe, expect, it } from 'vitest';
import {
  isRelated,
  partitionByRelation,
  relatedArticleIdSet,
  relatedEntityIdSet,
} from './relation';

// Three articles over four entities:
//   a1 -> e1, e2
//   a2 -> e2, e3
//   a3 -> (none)
// e4 is never mentioned.
const articles = [
  { id: 'a1', entities: [{ id: 'e1' }, { id: 'e2' }] },
  { id: 'a2', entities: [{ id: 'e2' }, { id: 'e3' }] },
  { id: 'a3', entities: [] },
];

describe('relatedArticleIdSet', () => {
  it('returns null when no entity is selected', () => {
    expect(relatedArticleIdSet(articles, new Set())).toBeNull();
  });

  it('collects articles mentioning any selected entity', () => {
    const r = relatedArticleIdSet(articles, new Set(['e2']));
    expect(r).not.toBeNull();
    expect([...r!].sort()).toEqual(['a1', 'a2']);
  });

  it('unions across multiple selected entities', () => {
    const r = relatedArticleIdSet(articles, new Set(['e1', 'e3']));
    expect([...r!].sort()).toEqual(['a1', 'a2']);
  });

  it('is empty (not null) when a selected entity matches nothing', () => {
    const r = relatedArticleIdSet(articles, new Set(['e4']));
    expect(r).not.toBeNull();
    expect(r!.size).toBe(0);
  });
});

describe('relatedEntityIdSet', () => {
  it('returns null when no article is selected', () => {
    expect(relatedEntityIdSet(articles, new Set())).toBeNull();
  });

  it('collects entities mentioned by the selected articles', () => {
    const r = relatedEntityIdSet(articles, new Set(['a1']));
    expect([...r!].sort()).toEqual(['e1', 'e2']);
  });

  it('unions entities across multiple selected articles', () => {
    const r = relatedEntityIdSet(articles, new Set(['a1', 'a2']));
    expect([...r!].sort()).toEqual(['e1', 'e2', 'e3']);
  });

  it('is empty when the selected article mentions nothing', () => {
    const r = relatedEntityIdSet(articles, new Set(['a3']));
    expect(r!.size).toBe(0);
  });
});

describe('isRelated', () => {
  const related = new Set(['e2']);
  it('treats pinned ids as related even when not in the related set', () => {
    expect(isRelated('e9', new Set(['e9']), related)).toBe(true);
  });
  it('treats ids in the related set as related', () => {
    expect(isRelated('e2', new Set(), related)).toBe(true);
  });
  it('is false for unrelated, unpinned ids', () => {
    expect(isRelated('e3', new Set(), related)).toBe(false);
  });
  it('is false for everything when related is null', () => {
    expect(isRelated('e2', new Set(), null)).toBe(false);
  });
});

describe('partitionByRelation', () => {
  const entities = [
    { id: 'e1' },
    { id: 'e2' },
    { id: 'e3' },
    { id: 'e4' },
  ];

  it('does not split when related is null — everything in others, order kept', () => {
    const g = partitionByRelation(entities, new Set(), null);
    expect(g.split).toBe(false);
    expect(g.related).toEqual([]);
    expect(g.others.map((x) => x.id)).toEqual(['e1', 'e2', 'e3', 'e4']);
  });

  it('splits related (incl. pinned) above others, preserving input order', () => {
    // related set = {e2}; pinned = {e4}. Related group = [e2, e4] in input
    // order; others = [e1, e3].
    const g = partitionByRelation(entities, new Set(['e4']), new Set(['e2']));
    expect(g.split).toBe(true);
    expect(g.related.map((x) => x.id)).toEqual(['e2', 'e4']);
    expect(g.others.map((x) => x.id)).toEqual(['e1', 'e3']);
  });

  it('keeps a selected-but-unrelated item in the Related group (pinned wins)', () => {
    // e1 is pinned but not in the related set — it must stay in Related so the
    // user's pick never sinks into Others.
    const g = partitionByRelation(entities, new Set(['e1']), new Set(['e3']));
    expect(g.related.map((x) => x.id)).toEqual(['e1', 'e3']);
    expect(g.others.map((x) => x.id)).toEqual(['e2', 'e4']);
  });

  it('puts everything in others when nothing is related or pinned', () => {
    const g = partitionByRelation(entities, new Set(), new Set(['zzz']));
    expect(g.split).toBe(true);
    expect(g.related).toEqual([]);
    expect(g.others.map((x) => x.id)).toEqual(['e1', 'e2', 'e3', 'e4']);
  });

  it('does not mutate the input array', () => {
    const input = [{ id: 'e1' }, { id: 'e2' }];
    const snapshot = input.map((x) => x.id);
    partitionByRelation(input, new Set(['e2']), new Set(['e1']));
    expect(input.map((x) => x.id)).toEqual(snapshot);
  });
});
