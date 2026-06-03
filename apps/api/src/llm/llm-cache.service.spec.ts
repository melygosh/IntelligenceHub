import { extractFromFull } from './llm-cache.service';
import type { ArticleAnalysisResult } from '@intelligencehub/shared';

const FULL: ArticleAnalysisResult = {
  summary: 'S',
  importance: 'high',
  entities: [
    { canonicalName: 'A', type: 'company', aliases: [], description: null },
  ],
  categoryNames: ['Tech'],
  axisAssignments: [{ axisName: 'Tone', value: 'neutral' }],
};

describe('extractFromFull', () => {
  it('keeps only summary/importance/entities', () => {
    expect(extractFromFull(FULL)).toEqual({
      summary: 'S',
      importance: 'high',
      entities: FULL.entities,
    });
  });
});
