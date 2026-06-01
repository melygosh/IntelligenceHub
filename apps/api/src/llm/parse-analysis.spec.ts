import { parseAnthropicAnalysis, parseOpenAiAnalysis } from './parse-analysis';

// A schema-valid ArticleAnalysisResult payload. entities/categoryNames/
// axisAssignments have Zod defaults, so a summary + importance is the minimum.
const VALID = {
  summary: 'A concise valid summary of the article body.',
  importance: 'normal',
  entities: [{ canonicalName: 'Acme', type: 'company', aliases: [] }],
  categoryNames: ['Tech'],
  axisAssignments: [],
};

describe('parseAnthropicAnalysis', () => {
  it('returns the validated result from the tool_use block', () => {
    const out = parseAnthropicAnalysis([
      { type: 'text' },
      { type: 'tool_use', input: VALID },
    ]);
    expect(out.summary).toBe(VALID.summary);
    expect(out.importance).toBe('normal');
    expect(out.entities[0].canonicalName).toBe('Acme');
  });

  it('throws when no tool_use block is present', () => {
    expect(() => parseAnthropicAnalysis([{ type: 'text' }])).toThrow(
      /missing tool_use block/,
    );
  });

  it('throws when the tool_use input fails schema validation', () => {
    expect(() =>
      parseAnthropicAnalysis([
        { type: 'tool_use', input: { importance: 'banana' } },
      ]),
    ).toThrow(/failed Zod validation/);
  });
});

describe('parseOpenAiAnalysis', () => {
  it('parses + validates the JSON content', () => {
    const out = parseOpenAiAnalysis(JSON.stringify(VALID));
    expect(out.summary).toBe(VALID.summary);
    expect(out.categoryNames).toEqual(['Tech']);
  });

  it('throws on empty/null content', () => {
    expect(() => parseOpenAiAnalysis(null)).toThrow(/no content/);
    expect(() => parseOpenAiAnalysis('')).toThrow(/no content/);
  });

  it('throws on non-JSON content', () => {
    expect(() => parseOpenAiAnalysis('not json {')).toThrow(/not valid JSON/);
  });

  it('throws when the JSON fails schema validation', () => {
    expect(() => parseOpenAiAnalysis(JSON.stringify({ summary: 42 }))).toThrow(
      /failed Zod validation/,
    );
  });
});
