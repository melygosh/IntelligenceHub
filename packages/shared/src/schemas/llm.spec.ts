import { describe, expect, it } from 'vitest';
import { mergeAnalysis, splitAnalysis, type ArticleAnalysisResult } from './llm.js';

const FULL: ArticleAnalysisResult = {
  summary: 'A summary.',
  importance: 'normal',
  entities: [{ canonicalName: 'Acme', type: 'company', aliases: [], description: null }],
  categoryNames: ['Tech'],
  axisAssignments: [{ axisName: 'Tone', value: 'neutral' }],
};

describe('splitAnalysis / mergeAnalysis', () => {
  it('split then merge round-trips to the original', () => {
    const { extract, categorize } = splitAnalysis(FULL);
    expect(mergeAnalysis(extract, categorize)).toEqual(FULL);
  });

  it('extract carries only article-specific fields', () => {
    const { extract } = splitAnalysis(FULL);
    expect(extract).toEqual({
      summary: 'A summary.',
      importance: 'normal',
      entities: FULL.entities,
    });
  });

  it('categorize carries only user-specific fields', () => {
    const { categorize } = splitAnalysis(FULL);
    expect(categorize).toEqual({
      categoryNames: ['Tech'],
      axisAssignments: [{ axisName: 'Tone', value: 'neutral' }],
    });
  });

  it('merge takes summary/importance/entities from extract and tags from categorize', () => {
    const merged = mergeAnalysis(
      { summary: 'S', importance: 'high', entities: [] },
      { categoryNames: ['X'], axisAssignments: [] },
    );
    expect(merged.summary).toBe('S');
    expect(merged.importance).toBe('high');
    expect(merged.categoryNames).toEqual(['X']);
  });
});
