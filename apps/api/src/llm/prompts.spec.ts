import {
  analyzeArticleSystemPrompt,
  analyzeArticleOutputSchema,
  buildDigestSystemPrompt,
  buildDigestOutputSchema,
} from './prompts';

describe('configurable summary length', () => {
  it('injects the char limit into the analyze prompt', () => {
    expect(analyzeArticleSystemPrompt(800)).toContain(
      'Maximum 800 characters.',
    );
    expect(analyzeArticleSystemPrompt(400)).toContain(
      'Maximum 400 characters.',
    );
    expect(analyzeArticleSystemPrompt(400)).not.toContain('800');
  });

  it('injects the char limit into the output schema maxLength', () => {
    expect(analyzeArticleOutputSchema(800).properties.summary.maxLength).toBe(
      800,
    );
    expect(analyzeArticleOutputSchema(1200).properties.summary.maxLength).toBe(
      1200,
    );
  });
});

describe('configurable digest paragraph count', () => {
  it('injects the paragraph range into the digest prompt (default 2-3)', () => {
    const p = buildDigestSystemPrompt(2, 3);
    expect(p).toContain('2-3 paragraph editorial summary');
    expect(p).toContain('array of 2-3 paragraph strings');
  });

  it('reflects a non-default paragraph range', () => {
    const p = buildDigestSystemPrompt(1, 5);
    expect(p).toContain('1-5 paragraph editorial summary');
    expect(p).not.toContain('2-3 paragraph');
  });

  it('injects the bounds into the output schema min/maxItems', () => {
    const s = buildDigestOutputSchema(2, 3);
    expect(s.properties.summary.minItems).toBe(2);
    expect(s.properties.summary.maxItems).toBe(3);

    const s2 = buildDigestOutputSchema(1, 5);
    expect(s2.properties.summary.minItems).toBe(1);
    expect(s2.properties.summary.maxItems).toBe(5);
  });
});
