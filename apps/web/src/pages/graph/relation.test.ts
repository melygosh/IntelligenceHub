import { describe, expect, it } from 'vitest';
import { relatedArticleIdSet, relatedEntityIdSet } from './relation';

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

